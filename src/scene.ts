import {
  DistanceGrabbable, Grabbed, GrabSystem, MovementMode, OneHandGrabbable,
  ReferenceSpaceType, SessionMode, World, type Entity,
} from '@iwsdk/core';
import {
  BoxGeometry, BufferGeometry, CanvasTexture, DirectionalLight, EdgesGeometry,
  Group, HemisphereLight, Line, LineBasicMaterial, LineSegments,
  Plane, Quaternion, Raycaster, Sprite, SpriteMaterial, SRGBColorSpace, Vector2, Vector3,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  activeLayout, clearanceForItem, corners, exportPlanSvg, formatDistance, itemsOverlap,
  selectedItem, wallViolations, type Furniture, type ItemKind, type PlannerStore,
} from './model';
import { buildFurniture, buildRoomScene, disposeObject } from './objects';
import { createSpatialControls, type SpatialButton } from './spatial-ui';

export type SceneView = 'tabletop' | 'life-size';
export interface SceneStatus {
  ready: boolean; xrSupported: boolean; inXR: boolean; error?: string; message?: string;
  view?: SceneView; compare?: boolean; overlays?: { overlaps: boolean; gaps: boolean };
}
export interface SceneController {
  update(): void;
  setView(view: SceneView): void;
  setCompare(enabled: boolean): void;
  setOverlays(options: { overlaps: boolean; gaps: boolean }): void;
  enterXR(): Promise<void>;
  dispose(): void;
}

interface ItemObject { entity: Entity; group: Group; geometryKey: string }
const rounded = (value: number) => Math.round(value * 1000) / 1000;
const geometryKey = (item: Furniture) => JSON.stringify([item.kind, item.width, item.depth, item.height, item.color, item.photo]);

/** One IWSDK renderer, scene graph, and saved state for browser and immersive sessions. */
export async function mountScene(container: HTMLElement, options: {
  store: PlannerStore;
  onStatus?: (status: SceneStatus) => void;
}): Promise<SceneController> {
  const { store, onStatus } = options;
  const emulator = (window as Window & { IWER_DEVICE?: {
    primaryInputMode: 'hand' | 'controller'; controlMode: 'manual' | 'programmatic'; notifyStateChange(): void;
    devui?: { devUIContainer: HTMLDivElement };
  } }).IWER_DEVICE;
  if (import.meta.env.DEV && emulator) {
    // Synchronize the documented runtime and DevUI mode stores, then give
    // control straight back to the visible simulator controls.
    const priorMode = emulator.controlMode;
    emulator.controlMode = 'programmatic';
    emulator.primaryInputMode = 'hand';
    emulator.notifyStateChange();
    emulator.controlMode = priorMode;
    if (emulator.devui) emulator.devui.devUIContainer.style.display = 'none';
    // The application owns entry. Suppress only IWER's separate offer button;
    // its input controls are restored whenever a real immersive session starts.
    for (const element of Array.from(document.body.children)) {
      if (element instanceof HTMLElement && element.shadowRoot?.querySelector('button')?.textContent === 'Enter XR') element.style.display = 'none';
    }
  }
  const world = await World.create(container, {
    xr: {
      sessionMode: SessionMode.ImmersiveVR,
      referenceSpace: ReferenceSpaceType.LocalFloor,
      features: { handTracking: { required: true } },
      offer: 'none',
      restoreCameraOnExit: true,
    },
    render: { fov: 42, near: .015, far: 120 },
    input: { canvasPointerEvents: false },
    features: { grabbing: { useHandPinchForGrab: true }, locomotion: false, spatialUI: false },
  });
  world.scene.background = null;
  world.renderer.setClearColor(0xf1efe8, 0);
  world.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  world.renderer.shadowMap.enabled = true;
  const hemisphere = new HemisphereLight(0xffffff, 0xa8b4a5, 1.6);
  world.scene.add(hemisphere);
  const daylight = new DirectionalLight(0xffffff, 2.2);
  daylight.position.set(-3, 8, 5);
  daylight.castShadow = true;
  daylight.shadow.mapSize.set(2048, 2048);
  daylight.shadow.camera.left = -12;
  daylight.shadow.camera.right = 12;
  daylight.shadow.camera.top = 12;
  daylight.shadow.camera.bottom = -12;
  daylight.shadow.normalBias = .025;
  world.scene.add(daylight);

  const roomRoot = new Group();
  roomRoot.name = 'Roomshift measured room';
  const roomEntity = world.createTransformEntity(roomRoot, { parent: world.sceneEntity, persistent: true });
  const overlays = new Group();
  overlays.name = 'Measured gaps and alternate layout';
  roomRoot.add(overlays);
  let shell: Group | undefined;
  let shellKey = '';
  const itemObjects = new Map<string, ItemObject>();
  const holding = new Set<string>();
  let view: SceneView = 'tabletop';
  let compare = false;
  let overlayOptions = { overlaps: true, gaps: true };
  let disposed = false;
  let inXR = false;
  let supported = false;
  let needsAnchor = false;
  let notice = 'Pinch and move furniture. Point at a control and pinch, or touch it.';
  type ControlPage = 'plan' | 'item' | 'room' | 'add' | 'number';
  type NumberField = 'width' | 'depth' | 'height' | 'x' | 'z' | 'y';
  let controlPage: ControlPage = 'plan';
  let numberEdit: {
    scope: 'item' | 'room'; field: NumberField; id?: string; layoutId: string;
    value: string; replace: boolean; returnPage: 'item' | 'room'; error?: string;
  } | undefined;
  let overlaysTimer: ReturnType<typeof setTimeout> | undefined;
  let lastOverlayTime = 0;
  let lastPanelTime = 0;
  let internalMutationDepth = 0;
  const internalMutation = <T,>(action: () => T): T => {
    internalMutationDepth++;
    try { return action(); } finally { internalMutationDepth--; }
  };
  const controls = new OrbitControls(world.camera, world.renderer.domElement);
  controls.enableDamping = false;
  controls.minPolarAngle = .1;
  controls.maxPolarAngle = Math.PI / 2 - .02;
  controls.minDistance = .3;
  controls.maxDistance = 60;
  controls.enablePan = false;

  const report = (message?: string, error?: string) => onStatus?.({
    ready: !disposed, xrSupported: supported, inXR, message, error,
    view, compare, overlays: { ...overlayOptions },
  });
  const current = () => selectedItem(store.getState());
  const editSelected = (patch: Partial<Furniture>) => {
    const item = current();
    if (item) store.patchItem(item.id, patch);
  };
  const beginNumber = (scope: 'item' | 'room', field: NumberField) => {
    const state = store.getState();
    const item = selectedItem(state);
    if (scope === 'item' && !item) return;
    const value = scope === 'item' ? item![field] : activeLayout(state).room[field as 'width' | 'depth' | 'height'];
    numberEdit = { scope, field, id: item?.id, layoutId: state.activeId, value: String(rounded(value * 100)), replace: true, returnPage: scope };
    controlPage = 'number';
    panel.refresh();
  };
  const numberKey = (key: string) => {
    if (!numberEdit) return;
    const draft = numberEdit;
    let value = draft.replace ? '' : draft.value;
    if (key === '.') { if (value.includes('.')) return; if (!value || value === '-') value += '0'; }
    if (key === '-') { value = value.startsWith('-') ? value.slice(1) : `-${value}`; }
    else value += key;
    if (value.length > 12) return;
    draft.value = value;
    draft.replace = false;
    draft.error = undefined;
    panel.refresh();
  };
  const applyNumber = () => {
    const draft = numberEdit;
    if (!draft) return;
    const value = Number(draft.value) / 100;
    if (!draft.value.trim() || !Number.isFinite(value) || store.getState().activeId !== draft.layoutId) {
      draft.error = 'Enter a valid measurement';
      panel.refresh();
      return;
    }
    const state = store.getState();
    const prior = draft.scope === 'room'
      ? activeLayout(state).room[draft.field as 'width' | 'depth' | 'height']
      : activeLayout(state).items.find(item => item.id === draft.id)?.[draft.field];
    const applied = prior === value || (draft.scope === 'room'
      ? store.setRoom({ [draft.field]: value })
      : store.patchItem(draft.id!, { [draft.field]: value }));
    if (!applied) {
      const max = draft.scope === 'room' ? (draft.field === 'height' ? 500 : 2000) : draft.field === 'width' || draft.field === 'depth' ? 1000 : draft.field === 'x' || draft.field === 'z' ? 3000 : 500;
      const min = draft.scope === 'room' ? (draft.field === 'height' ? 180 : 200) : draft.field === 'x' || draft.field === 'z' ? -3000 : draft.field === 'y' ? 0 : 2;
      draft.error = `${min} to ${max} cm required`;
      panel.refresh();
      return;
    }
    controlPage = draft.returnPage;
    numberEdit = undefined;
    panel.refresh();
  };
  const say = (text: string) => { notice = text; panel.refresh(); report(text); };
  const download = () => {
    const layout = activeLayout(store.getState());
    const blob = new Blob([exportPlanSvg(layout)], { type: 'image/svg+xml;charset=utf-8' });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = `roomshift-layout-${layout.id}.svg`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(href), 3000);
    say(`2D plan exported as roomshift-layout-${layout.id}.svg`);
  };
  const button = (label: string, action: () => void, extra: Partial<SpatialButton> = {}): SpatialButton => ({ label: () => label, action, ...extra });
  const onPage = (page: ControlPage, entry: SpatialButton): SpatialButton => ({ ...entry, visible: () => controlPage === page });
  const pageTabs = (['plan', 'item', 'room', 'add'] as const).map(page => button(
    page[0].toUpperCase() + page.slice(1), () => { numberEdit = undefined; controlPage = page; panel.refresh(); }, { active: () => controlPage === page },
  ));
  const buttons: SpatialButton[] = [
    button('Tabletop', () => setView('tabletop'), { active: () => view === 'tabletop' }),
    button('Life-size', () => setView('life-size'), { active: () => view === 'life-size' }),
    ...pageTabs,
    ...[
      button('Layout A', () => store.setActive('A'), { active: () => store.getState().activeId === 'A' }),
      button('Layout B', () => store.setActive('B'), { active: () => store.getState().activeId === 'B' }),
      button('Compare', () => setCompare(!compare), { active: () => compare }),
      button('Undo', () => store.undo(), { enabled: () => store.canUndo() }),
      button('Redo', () => store.redo(), { enabled: () => store.canRedo() }),
      button('Save', () => say(store.save() ? 'Both layouts saved on this device.' : 'Device storage is unavailable.')),
      button('Load', () => say(store.load() ? 'Saved layouts restored.' : 'No saved layouts found.')),
      button('Copy A/B', () => { store.copyActiveToOther(); say('Current arrangement copied to the other layout.'); }),
      button('Export plan', download),
      button('Exit VR', () => world.exitXR()),
      button('Gaps', () => { overlayOptions.gaps = !overlayOptions.gaps; updateOverlays(); report(); }, { active: () => overlayOptions.gaps }),
      button('Overlaps', () => { overlayOptions.overlaps = !overlayOptions.overlaps; updateOverlays(); report(); }, { active: () => overlayOptions.overlaps }),
      button('Recenter', () => { needsAnchor = true; say('Room and controls moved in front of you.'); }),
    ].map(entry => onPage('plan', entry)),
    ...(['sofa', 'chair', 'table', 'shelf', 'art'] as ItemKind[]).map(kind => onPage('add', button(`+ ${kind}`, () => {
      const id = store.addItem(kind);
      if (!id) say('This room already has 12 items. Remove an item to add another.');
    }))),
    ...(['width', 'depth', 'height', 'x', 'z', 'y'] as const).map(field => onPage('item', button(
      `Edit ${field === 'y' ? 'elevation' : field === 'width' ? 'W' : field === 'depth' ? 'D' : field === 'height' ? 'H' : field.toUpperCase()}`,
      () => beginNumber('item', field), { enabled: () => !!current() && (field !== 'y' || current()?.kind === 'art') },
    ))),
    ...[
      button('Rotate -15', () => { const item = current(); if (item) editSelected({ rotation: item.rotation - Math.PI / 12 }); }, { enabled: () => !!current() }),
      button('Rotate +15', () => { const item = current(); if (item) editSelected({ rotation: item.rotation + Math.PI / 12 }); }, { enabled: () => !!current() }),
      button('Select next', () => {
        const state = store.getState(), items = activeLayout(state).items;
        const index = items.findIndex(item => item.id === state.selectionId);
        store.select(items[(index + 1) % items.length]?.id ?? null);
      }),
      button('Remove', () => { const item = current(); if (item) store.removeItem(item.id); }, { enabled: () => !!current() }),
    ].map(entry => onPage('item', entry)),
    ...(['width', 'depth', 'height'] as const).map(field => onPage('room', button(`Edit room ${field === 'width' ? 'W' : field === 'depth' ? 'D' : 'H'}`, () => beginNumber('room', field)))),
    ...['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '.', '-'].map(key => onPage('number', button(key, () => numberKey(key), {
      enabled: () => key !== '-' || numberEdit?.field === 'x' || numberEdit?.field === 'z',
    }))),
    ...[
      button('Backspace', () => { if (numberEdit) { numberEdit.value = numberEdit.replace ? '' : numberEdit.value.slice(0, -1); numberEdit.replace = false; numberEdit.error = undefined; panel.refresh(); } }),
      button('Clear', () => { if (numberEdit) { numberEdit.value = ''; numberEdit.replace = false; numberEdit.error = undefined; panel.refresh(); } }),
      button('Apply', applyNumber),
      button('Cancel', () => { controlPage = numberEdit?.returnPage ?? 'item'; numberEdit = undefined; panel.refresh(); }),
    ].map(entry => onPage('number', entry)),
  ];
  const panel = createSpatialControls(world, buttons, () => {
    if (numberEdit) return `${numberEdit.scope === 'room' ? 'Room ' : ''}${numberEdit.field === 'y' ? 'Elevation' : numberEdit.field}: ${numberEdit.value || '0'} cm${numberEdit.replace ? ' (replace)' : ''}${numberEdit.error ? ` | ${numberEdit.error}` : ''}`;
    const item = current();
    if (!item) return notice;
    const closest = clearanceForItem(item, activeLayout(store.getState())).closest;
    return `${item.name} | ${Math.round(item.width * 100)} x ${Math.round(item.depth * 100)} x ${Math.round(item.height * 100)} cm${closest ? ` | Nearest ${formatDistance(closest.distance)}` : ''}`;
  });

  function configureGrab(entity: Entity, item: Furniture) {
    const yMin = item.kind === 'art' ? 0 : item.y;
    const yMax = item.kind === 'art' ? 5 : item.y;
    const config = {
      rotate: true, rotateMin: [0, -3_000_000, 0] as [number, number, number], rotateMax: [0, 3_000_000, 0] as [number, number, number],
      translate: true, translateMin: [-30, yMin, -30] as [number, number, number], translateMax: [30, yMax, 30] as [number, number, number],
    };
    if (view === 'tabletop') entity.addComponent(OneHandGrabbable, config);
    else entity.addComponent(DistanceGrabbable, { ...config, scale: false, detachOnGrab: false, movementMode: MovementMode.MoveAtSource });
  }

  function dropGrabs() {
    const grab = world.getSystem(GrabSystem);
    itemObjects.forEach(value => grab?.forceRelease(value.entity));
    if (holding.size) { holding.clear(); internalMutation(() => store.endEdit()); }
  }

  function reconcile() {
    if (disposed) return;
    const state = store.getState();
    const layout = activeLayout(state);
    const nextShellKey = JSON.stringify(layout.room);
    if (shellKey !== nextShellKey) {
      if (shell) { roomRoot.remove(shell); disposeObject(shell); }
      shell = buildRoomScene(layout, { includeFurniture: false });
      roomRoot.add(shell);
      shellKey = nextShellKey;
      if (inXR) needsAnchor = true;
      else fitDesktop();
    }
    for (const [id, value] of itemObjects) {
      if (!layout.items.some(item => item.id === id)) {
        holding.delete(id);
        value.entity.dispose();
        itemObjects.delete(id);
      }
    }
    for (const item of layout.items) {
      let value = itemObjects.get(item.id);
      const key = geometryKey(item);
      if (value && value.geometryKey !== key) {
        value.entity.dispose();
        itemObjects.delete(item.id);
        value = undefined;
      }
      if (!value) {
        const group = buildFurniture(item);
        group.name = item.name;
        group.traverse(object => { object.userData.itemId = item.id; });
        const entity = world.createTransformEntity(group, roomEntity);
        configureGrab(entity, item);
        value = { group, entity, geometryKey: key };
        itemObjects.set(item.id, value);
      }
      // forceRelease clears its pointer immediately; the SDK's Grabbed tag is
      // removed on the following frame. Cancelled holds must still restore a
      // switched/undone layout now rather than leaving the old pose on screen.
      if (!value.entity.hasComponent(Grabbed) || !holding.has(item.id)) {
        value.group.position.set(item.x, item.y, item.z);
        value.group.rotation.set(0, item.rotation, 0);
        const component = view === 'tabletop' ? OneHandGrabbable : DistanceGrabbable;
        if (item.kind !== 'art') {
          value.entity.getVectorView(component, 'translateMin')[1] = item.y;
          value.entity.getVectorView(component, 'translateMax')[1] = item.y;
        }
      }
    }
    scheduleOverlays();
    panel.refresh();
  }

  function line(points: Vector3[], color: string) {
    const mesh = new Line(new BufferGeometry().setFromPoints(points), new LineBasicMaterial({ color, transparent: true, opacity: .85 }));
    mesh.renderOrder = 10;
    overlays.add(mesh);
    return mesh;
  }

  function label(text: string, position: Vector3, color = '#355746') {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 96;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#fffff8';
    context.beginPath();
    context.roundRect(3, 3, 250, 90, 14);
    context.fill();
    context.font = '600 46px system-ui, sans-serif';
    context.fillStyle = color;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(text, 128, 48, 242);
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    const sprite = new Sprite(new SpriteMaterial({ map: texture, depthTest: false }));
    sprite.position.copy(position);
    const width = inXR && view === 'tabletop' ? 1.15 : 1.05;
    sprite.scale.set(width, width * 96 / 256, 1);
    sprite.renderOrder = 30;
    overlays.add(sprite);
  }

  function updateOverlays() {
    if (disposed) return;
    overlays.children.slice().forEach(object => { overlays.remove(object); disposeObject(object); });
    const state = store.getState();
    const layout = activeLayout(state);
    for (const item of layout.items) {
      const collision = overlayOptions.overlaps && (wallViolations(item, layout.room).length > 0 || layout.items.some(other => item.id !== other.id && itemsOverlap(item, other)));
      if (collision || item.id === state.selectionId) {
        const color = collision ? '#c95142' : '#54795d';
        const points = corners(item).map(point => new Vector3(point.x, item.y + .012, point.z));
        line([...points, points[0]], color);
        if (collision || item.id === state.selectionId) {
          const geometry = new EdgesGeometry(new BoxGeometry(item.width, item.height, item.depth));
          const edges = new LineSegments(geometry, new LineBasicMaterial({ color, transparent: true, opacity: collision ? .75 : .9 }));
          edges.position.set(item.x, item.y + item.height / 2, item.z);
          edges.rotation.y = item.rotation;
          overlays.add(edges);
        }
      }
    }
    if (compare) {
      const other = state.layouts.find(value => value.id !== state.activeId)!;
      for (const item of other.items) {
        const edges = new LineSegments(new EdgesGeometry(new BoxGeometry(item.width, item.height, item.depth)), new LineBasicMaterial({ color: '#798bad', transparent: true, opacity: .4, depthTest: false }));
        edges.position.set(item.x, item.y + item.height / 2, item.z);
        edges.rotation.y = item.rotation;
        overlays.add(edges);
      }
      label(`Ghost: layout ${other.id}`, new Vector3(0, .12, layout.room.depth / 2 + .18), '#657a9f');
    }
    const selected = selectedItem(state);
    if (overlayOptions.gaps && selected) {
      const clearance = clearanceForItem(selected, layout);
      const points = corners(selected);
      const left = points.reduce((a, b) => a.x < b.x ? a : b);
      const right = points.reduce((a, b) => a.x > b.x ? a : b);
      const back = points.reduce((a, b) => a.z < b.z ? a : b);
      const front = points.reduce((a, b) => a.z > b.z ? a : b);
      const measurements = [
        [new Vector3(-layout.room.width / 2, .035, left.z), new Vector3(left.x, .035, left.z), clearance.walls.left],
        [new Vector3(right.x, .035, right.z), new Vector3(layout.room.width / 2, .035, right.z), clearance.walls.right],
        [new Vector3(back.x, .035, -layout.room.depth / 2), new Vector3(back.x, .035, back.z), clearance.walls.back],
        [new Vector3(front.x, .035, front.z), new Vector3(front.x, .035, layout.room.depth / 2), clearance.walls.front],
      ] as const;
      for (const [start, end, gap] of measurements) {
        if (Math.abs(gap) < .06) continue;
        const color = gap < 0 ? '#c95142' : '#54795d';
        line([start, end], color);
        label(formatDistance(gap), start.clone().lerp(end, .5).add(new Vector3(0, .13, 0)), color);
      }
    }
    lastOverlayTime = performance.now();
  }

  function scheduleOverlays() {
    if (performance.now() - lastOverlayTime > 100) updateOverlays();
    else if (overlaysTimer === undefined) overlaysTimer = setTimeout(() => { overlaysTimer = undefined; updateOverlays(); }, 100);
  }

  function fitDesktop() {
    const room = activeLayout(store.getState()).room;
    roomRoot.position.set(0, 0, 0);
    roomRoot.rotation.set(0, 0, 0);
    roomRoot.scale.setScalar(1);
    if (view === 'tabletop') {
      const longest = Math.max(room.width, room.depth);
      world.camera.position.set(longest * .9, longest * .86, longest * 1.05);
      controls.target.set(0, room.height * .22, 0);
      controls.maxPolarAngle = Math.PI / 2 - .02;
    } else {
      world.camera.position.set(0, 1.5, room.depth * .35);
      controls.target.set(0, 1.25, -room.depth * .2);
      controls.maxPolarAngle = Math.PI - .1;
    }
    controls.update();
  }

  function anchorXR() {
    const head = world.player.head.getWorldPosition(new Vector3());
    const rotation = world.player.head.getWorldQuaternion(new Quaternion());
    const forward = new Vector3(0, 0, -1).applyQuaternion(rotation);
    forward.y = 0;
    if (forward.lengthSq() < .01) forward.set(0, 0, -1);
    forward.normalize();
    const room = activeLayout(store.getState()).room;
    const yaw = Math.atan2(-forward.x, -forward.z);
    roomRoot.rotation.set(0, yaw, 0);
    if (view === 'tabletop') {
      roomRoot.scale.setScalar(.54 / Math.max(room.width, room.depth));
      roomRoot.position.copy(head).addScaledVector(forward, .43);
      roomRoot.position.y = Math.max(.35, head.y - .55);
    } else {
      roomRoot.scale.setScalar(1);
      roomRoot.position.set(head.x, 0, head.z);
    }
    panel.root.position.copy(head).addScaledVector(forward, .56);
    panel.root.position.y -= .04;
    panel.root.lookAt(head);
    needsAnchor = false;
    updateOverlays();
  }

  function setView(next: SceneView) {
    if (next !== view) {
      dropGrabs();
      itemObjects.forEach(value => { disposeObject(value.group); value.entity.dispose({ disposeResources: false }); });
      itemObjects.clear();
      view = next;
      reconcile();
    }
    if (inXR) needsAnchor = true;
    else fitDesktop();
    panel.refresh();
    report();
  }
  function setCompare(enabled: boolean) { compare = enabled; updateOverlays(); panel.refresh(); report(); }

  const raycaster = new Raycaster();
  const pointer = new Vector2();
  let drag: { pointerId: number; id: string; plane: Plane; offset: Vector3 } | undefined;
  function pointerRay(event: PointerEvent) {
    const rect = world.renderer.domElement.getBoundingClientRect();
    pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    roomRoot.updateWorldMatrix(true, true);
    world.camera.updateWorldMatrix(true, false);
    raycaster.setFromCamera(pointer, world.camera);
  }
  const onPointerDown = (event: PointerEvent) => {
    if (inXR || event.button !== 0) return;
    pointerRay(event);
    const hit = raycaster.intersectObjects([...itemObjects.values()].map(value => value.group), true)[0];
    if (!hit) return;
    const id = hit.object.userData.itemId as string;
    const item = activeLayout(store.getState()).items.find(value => value.id === id);
    if (!item) return;
    const worldBottom = roomRoot.localToWorld(new Vector3(item.x, item.y, item.z));
    const plane = new Plane(new Vector3(0, 1, 0), -worldBottom.y);
    const intersection = raycaster.ray.intersectPlane(plane, new Vector3());
    if (!intersection) return;
    event.stopImmediatePropagation();
    event.preventDefault();
    controls.enabled = false;
    internalMutation(() => { store.select(id); store.beginEdit(); });
    drag = { pointerId: event.pointerId, id, plane, offset: roomRoot.worldToLocal(intersection).sub(new Vector3(item.x, item.y, item.z)) };
    world.renderer.domElement.setPointerCapture(event.pointerId);
    world.renderer.domElement.style.cursor = 'grabbing';
  };
  const onPointerMove = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.pointerId || inXR) return;
    pointerRay(event);
    const intersection = raycaster.ray.intersectPlane(drag.plane, new Vector3());
    if (!intersection) return;
    const local = roomRoot.worldToLocal(intersection).sub(drag.offset);
    internalMutation(() => store.patchItem(drag!.id, { x: rounded(Math.max(-30, Math.min(30, local.x))), z: rounded(Math.max(-30, Math.min(30, local.z))) }));
  };
  const finishDrag = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    drag = undefined;
    internalMutation(() => event.type === 'pointercancel' ? store.cancelEdit() : store.endEdit());
    controls.enabled = !inXR;
    world.renderer.domElement.style.cursor = 'grab';
  };
  const canvas = world.renderer.domElement;
  canvas.style.cursor = 'grab';
  canvas.style.touchAction = 'none';
  canvas.addEventListener('pointerdown', onPointerDown, true);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', finishDrag);
  canvas.addEventListener('pointercancel', finishDrag);
  const resize = () => {
    if (disposed || inXR || world.renderer.xr.isPresenting) return;
    const width = Math.max(1, container.clientWidth), height = Math.max(1, container.clientHeight);
    world.renderer.setSize(width, height);
    world.camera.aspect = width / height;
    world.camera.updateProjectionMatrix();
  };
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);

  const onSessionStart = () => {
    inXR = true;
    controls.enabled = false;
    needsAnchor = true;
    panel.root.visible = true;
    if (import.meta.env.DEV && emulator?.devui) emulator.devui.devUIContainer.style.display = '';
    report('Use hands to grab furniture, or point and pinch the spatial controls.');
  };
  const onSessionEnd = () => {
    dropGrabs();
    inXR = false;
    panel.root.visible = false;
    if (import.meta.env.DEV && emulator?.devui) emulator.devui.devUIContainer.style.display = 'none';
    controls.enabled = true;
    setTimeout(() => { if (!disposed) { fitDesktop(); resize(); report('Returned to browser view.'); } }, 40);
  };
  world.renderer.xr.addEventListener('sessionstart', onSessionStart);
  world.renderer.xr.addEventListener('sessionend', onSessionEnd);
  const stopFrames = world.onXRFrame(() => {
    if (needsAnchor) anchorXR();
    for (const [id, value] of itemObjects) {
      const grabbed = value.entity.hasComponent(Grabbed);
      if (grabbed) {
        if (!holding.has(id)) {
          internalMutation(() => {
            if (!holding.size) store.beginEdit();
            holding.add(id);
            store.select(id);
          });
        }
        const item = activeLayout(store.getState()).items.find(value => value.id === id);
        if (item) {
          const position = value.group.position;
          const patch = { x: rounded(position.x), z: rounded(position.z), y: rounded(Math.max(0, position.y)), rotation: value.group.rotation.y };
          if (Math.abs(patch.x - item.x) > .001 || Math.abs(patch.z - item.z) > .001 || Math.abs(patch.y - item.y) > .001 || Math.abs(patch.rotation - item.rotation) > .001) internalMutation(() => store.patchItem(id, patch));
        }
      } else if (holding.delete(id) && !holding.size) internalMutation(() => store.endEdit());
    }
    if (performance.now() - lastPanelTime > 150) { panel.refresh(); lastPanelTime = performance.now(); }
  });
  const unsubscribe = store.subscribe(() => {
    // A layout switch, undo, load, deletion, or form edit must never receive stale
    // poses from an already-held object on the next XR frame.
    if (!internalMutationDepth) {
      dropGrabs();
      if (drag) {
        const previousPointer = drag.pointerId;
        drag = undefined;
        internalMutation(() => store.endEdit());
        if (canvas.hasPointerCapture(previousPointer)) canvas.releasePointerCapture(previousPointer);
        controls.enabled = !inXR;
        canvas.style.cursor = 'grab';
      }
    }
    reconcile();
  });
  reconcile();
  fitDesktop();
  resize();
  try { supported = await navigator.xr?.isSessionSupported('immersive-vr') ?? false; } catch { supported = false; }
  report(supported ? 'Browser view ready. Enter VR for hand interactions.' : 'Browser view ready. A WebXR browser or emulator is needed for VR.');

  return {
    update: reconcile,
    setView,
    setCompare,
    setOverlays: next => { overlayOptions = { ...next }; updateOverlays(); panel.refresh(); report(); },
    enterXR: () => new Promise<void>((resolve, reject) => {
      if (inXR) { resolve(); return; }
      if (!supported) { reject(new Error('Immersive VR is unavailable in this browser. Use Meta Quest Browser or the local emulator.')); return; }
      const started = () => { cleanup(); resolve(); };
      let interval: ReturnType<typeof setInterval>;
      let timeout: ReturnType<typeof setTimeout>;
      const cleanup = () => { clearInterval(interval); clearTimeout(timeout); world.renderer.xr.removeEventListener('sessionstart', started); };
      world.renderer.xr.addEventListener('sessionstart', started);
      // Keep this synchronous with the React button click: WebXR requires a user gesture.
      world.launchXR();
      interval = setInterval(() => {
        if (!world.sessionRequestPending && !world.session) {
          cleanup();
          const error = 'VR entry was declined or unavailable. Try again from the Enter VR button.';
          report(undefined, error);
          reject(new Error(error));
        }
      }, 100);
      timeout = setTimeout(() => { cleanup(); reject(new Error('VR entry timed out. Try again from the Enter VR button.')); }, 15000);
    }),
    dispose: () => {
      if (disposed) return;
      dropGrabs();
      if (drag) store.endEdit();
      disposed = true;
      unsubscribe();
      stopFrames();
      clearTimeout(overlaysTimer);
      resizeObserver.disconnect();
      controls.dispose();
      canvas.removeEventListener('pointerdown', onPointerDown, true);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', finishDrag);
      canvas.removeEventListener('pointercancel', finishDrag);
      world.renderer.xr.removeEventListener('sessionstart', onSessionStart);
      world.renderer.xr.removeEventListener('sessionend', onSessionEnd);
      world.exitXR();
      panel.dispose();
      itemObjects.forEach(value => { disposeObject(value.group); value.entity.dispose({ disposeResources: false }); });
      if (shell) disposeObject(shell);
      disposeObject(overlays);
      roomEntity.dispose({ disposeResources: false });
      world.destroy();
      world.renderer.dispose();
      canvas.remove();
    },
  };
}
