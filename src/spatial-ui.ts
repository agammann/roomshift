import { PokeInteractable, RayInteractable, type Entity, type World } from '@iwsdk/core';
import { CanvasTexture, Group, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace } from 'three';

export interface SpatialButton {
  label: () => string;
  action: () => void;
  active?: () => boolean;
  enabled?: () => boolean;
  visible?: () => boolean;
}

/** A real world-space surface: the SDK's hand rays and fingertip pokes both activate it. */
export function createSpatialControls(world: World, buttons: SpatialButton[], heading: () => string) {
  const root = new Group();
  root.name = 'Roomshift hands controls';
  root.visible = false;
  const rootEntity = world.createTransformEntity(root, { parent: world.sceneEntity, persistent: true });
  const entities: Entity[] = [];
  const repaint: (() => void)[] = [];
  const surfaces: { mesh: Mesh; button: SpatialButton }[] = [];
  const resources: { mesh: Mesh; material: MeshBasicMaterial; texture: CanvasTexture }[] = [];
  const columns = 6;
  const buttonWidth = .112;
  const buttonHeight = .057;
  const horizontalGap = .009;
  const verticalGap = .01;

  function surface(width: number, height: number, label: () => string, button?: SpatialButton) {
    const canvas = document.createElement('canvas');
    canvas.width = button ? 384 : 1536;
    canvas.height = button ? 192 : 144;
    const context = canvas.getContext('2d')!;
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    const material = new MeshBasicMaterial({ map: texture, transparent: true, depthTest: false });
    const mesh = new Mesh(new PlaneGeometry(width, height), material);
    resources.push({ mesh, material, texture });
    mesh.renderOrder = 100;
    const entity = world.createTransformEntity(mesh, rootEntity);
    entities.push(entity);
    let hovered = false;
    let cached = '';
    const paint = () => {
      const enabled = !button?.enabled || button.enabled();
      const active = !!button?.active?.();
      const text = label();
      const next = `${text}|${enabled}|${active}|${hovered}`;
      if (cached === next) return;
      cached = next;
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = button ? (active || hovered ? '#355746' : '#f3f0e8') : '#264536';
      context.beginPath();
      context.roundRect(4, 4, canvas.width - 8, canvas.height - 8, button ? 24 : 18);
      context.fill();
      context.globalAlpha = enabled ? 1 : .38;
      context.fillStyle = button && !active && !hovered ? '#264536' : '#ffffff';
      context.font = button ? '600 31px system-ui, sans-serif' : '600 38px system-ui, sans-serif';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      const lines = text.split('\n');
      lines.forEach((line, index) => context.fillText(line, canvas.width / 2, canvas.height / 2 + (index - (lines.length - 1) / 2) * 42, canvas.width - 28));
      context.globalAlpha = 1;
      texture.needsUpdate = true;
    };
    repaint.push(paint);
    if (button) {
      entity.addComponent(RayInteractable);
      entity.addComponent(PokeInteractable);
      entity.object3D!.addEventListener('pointerenter', () => { hovered = true; paint(); });
      entity.object3D!.addEventListener('pointerleave', () => { hovered = false; paint(); });
      entity.object3D!.addEventListener('click', event => {
        event.stopPropagation();
        if (!button.enabled || button.enabled()) button.action();
      });
    }
    paint();
    return mesh;
  }

  const title = surface(columns * (buttonWidth + horizontalGap) - horizontalGap, .047, heading);
  buttons.forEach(button => surfaces.push({ mesh: surface(buttonWidth, buttonHeight, button.label, button), button }));
  const refresh = () => {
    const visible = surfaces.filter(value => !value.button.visible || value.button.visible());
    const rows = Math.ceil(visible.length / columns);
    surfaces.forEach(value => { value.mesh.visible = visible.includes(value); });
    title.position.set(0, rows * (buttonHeight + verticalGap) / 2 + .039, 0);
    visible.forEach(({ mesh }, index) => mesh.position.set(
      (index % columns - (columns - 1) / 2) * (buttonWidth + horizontalGap),
      ((rows - 1) / 2 - Math.floor(index / columns)) * (buttonHeight + verticalGap), .001,
    ));
    repaint.forEach(paint => paint());
  };
  refresh();

  return {
    root,
    refresh,
    dispose: () => {
      resources.forEach(({ mesh, material, texture }) => { texture.dispose(); material.dispose(); mesh.geometry.dispose(); });
      entities.forEach(entity => entity.dispose({ disposeResources: false }));
      rootEntity.dispose({ disposeResources: false });
    },
  };
}
