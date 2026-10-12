/** Room measurements and furniture are stored in meters. */
export type ItemKind = 'sofa' | 'chair' | 'table' | 'shelf' | 'art';
export type LayoutId = 'A' | 'B';
export interface Room { width: number; depth: number; height: number }
export interface Furniture {
  id: string;
  name: string;
  kind: ItemKind;
  width: number;
  depth: number;
  height: number;
  x: number;
  z: number;
  /** Height of the item's bottom above the floor. */
  y: number;
  /** Radians, using the same positive Y rotation as Three.js. */
  rotation: number;
  color: string;
  photo?: string;
}
export interface Layout { id: LayoutId; name: string; room: Room; items: Furniture[] }
export interface AppState { layouts: Layout[]; activeId: LayoutId; selectionId: string | null }
export interface Point { x: number; z: number }
export type Wall = 'left' | 'right' | 'back' | 'front' | 'ceiling';
export interface StorageLike { getItem(key: string): string | null; setItem(key: string, value: string): void }
export interface ItemClearance {
  walls: { left: number; right: number; back: number; front: number };
  closest: { id: string; name: string; distance: number } | null;
}
export interface PlannerStore {
  getState(): AppState;
  subscribe(listener: () => void): () => void;
  select(id: string | null): boolean;
  setActive(id: LayoutId): boolean;
  renameLayout(name: string): boolean;
  setRoom(patch: Partial<Room>): boolean;
  addItem(kind: ItemKind): string | null;
  patchItem(id: string, patch: Partial<Furniture>): boolean;
  removeItem(id: string): boolean;
  copyActiveToOther(): boolean;
  beginEdit(): void;
  endEdit(): boolean;
  cancelEdit(): void;
  undo(): boolean;
  redo(): boolean;
  canUndo(): boolean;
  canRedo(): boolean;
  save(): boolean;
  load(): boolean;
}

export const STORAGE_KEY = 'roomshift.v1';
export const MAX_ITEMS = 12;
export const MAX_PHOTO_LENGTH = 2_800_000;
const EPSILON = 1e-7;
const kinds: ItemKind[] = ['sofa', 'chair', 'table', 'shelf', 'art'];
const finiteRange = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const nameValid = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= 60;

function validPhoto(photo: unknown): photo is string {
  if (typeof photo !== 'string' || photo.length > MAX_PHOTO_LENGTH) return false;
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(photo);
  if (!match || match[2].length % 4 !== 0) return false;
  try {
    const header = atob(match[2].slice(0, 64));
    if (match[1] === 'png') return header.startsWith('\x89PNG\r\n\x1a\n');
    if (match[1] === 'jpeg') return header.startsWith('\xff\xd8\xff');
    return header.startsWith('RIFF') && header.slice(8, 12) === 'WEBP';
  } catch { return false; }
}

export function validateRoom(value: unknown): value is Room {
  return record(value) && finiteRange(value.width, 2, 20) && finiteRange(value.depth, 2, 20) && finiteRange(value.height, 1.8, 5);
}

export function validateItem(value: unknown): value is Furniture {
  if (!record(value) || typeof value.id !== 'string' || !/^[\w-]{1,80}$/.test(value.id) || !nameValid(value.name)) return false;
  if (!kinds.includes(value.kind as ItemKind) || typeof value.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(value.color)) return false;
  if (!finiteRange(value.width, .02, 10) || !finiteRange(value.depth, .02, 10) || !finiteRange(value.height, .02, 5)) return false;
  if (!finiteRange(value.x, -30, 30) || !finiteRange(value.z, -30, 30) || !finiteRange(value.y, 0, 5) || !finiteRange(value.rotation, -1_000_000, 1_000_000)) return false;
  if (value.photo !== undefined && (value.kind !== 'art' || !validPhoto(value.photo))) return false;
  return true;
}

export function validateState(value: unknown): value is AppState {
  if (!record(value) || !Array.isArray(value.layouts) || value.layouts.length !== 2 || !['A', 'B'].includes(value.activeId as string)) return false;
  const ids = new Set<string>();
  let referenceRoom: Room | undefined;
  for (const layout of value.layouts) {
    if (!record(layout) || !['A', 'B'].includes(layout.id as string) || ids.has(layout.id as string) || !nameValid(layout.name) || !validateRoom(layout.room)) return false;
    if (referenceRoom && (layout.room.width !== referenceRoom.width || layout.room.depth !== referenceRoom.depth || layout.room.height !== referenceRoom.height)) return false;
    referenceRoom = layout.room;
    ids.add(layout.id as string);
    if (!Array.isArray(layout.items) || layout.items.length > MAX_ITEMS || !layout.items.every(validateItem)) return false;
    if (new Set(layout.items.map(item => item.id)).size !== layout.items.length) return false;
  }
  const selectedLayout = value.layouts.find(layout => layout.id === value.activeId);
  return value.selectionId === null || (typeof value.selectionId === 'string' && selectedLayout.items.some((item: Furniture) => item.id === value.selectionId));
}

function copyState(state: AppState): AppState {
  return {
    activeId: state.activeId,
    selectionId: state.selectionId,
    layouts: state.layouts.map(layout => ({ ...layout, room: { ...layout.room }, items: layout.items.map(item => ({ ...item })) })),
  };
}

function freezeState(state: AppState): AppState {
  for (const layout of state.layouts) {
    Object.freeze(layout.room);
    layout.items.forEach(Object.freeze);
    Object.freeze(layout.items);
    Object.freeze(layout);
  }
  Object.freeze(state.layouts);
  return Object.freeze(state);
}

const room: Room = { width: 5.4, depth: 4.2, height: 2.7 };
const everyday: Furniture[] = [
  { id: 'sofa-1', name: 'Sofa', kind: 'sofa', width: 2.1, depth: .85, height: .78, x: -.6, z: -.85, y: 0, rotation: 0, color: '#adb9a2' },
  { id: 'chair-1', name: 'Armchair', kind: 'chair', width: .8, depth: .82, height: .85, x: 1.6, z: .25, y: 0, rotation: 0, color: '#d9cdb8' },
  { id: 'table-1', name: 'Coffee table', kind: 'table', width: 1.1, depth: .6, height: .42, x: -.3, z: .65, y: 0, rotation: 0, color: '#caa777' },
  { id: 'shelf-1', name: 'Bookshelf', kind: 'shelf', width: .9, depth: .32, height: 1.8, x: 1.83, z: -1.65, y: 0, rotation: 0, color: '#6c805a' },
  { id: 'table-2', name: 'Side table', kind: 'table', width: .45, depth: .45, height: .52, x: 1.65, z: 1.1, y: 0, rotation: 0, color: '#b49570' },
  { id: 'art-1', name: 'Wall art', kind: 'art', width: .7, depth: .04, height: .5, x: .1, z: -2.07, y: 1.4, rotation: 0, color: '#dfb197' },
];
const alternative = everyday.map(item => ({ ...item }));
Object.assign(alternative[0], { x: -1.38, z: -.8, rotation: Math.PI / 2 });
Object.assign(alternative[1], { x: 1.25, z: -.8, rotation: -Math.PI / 4 });
Object.assign(alternative[2], { x: -.15, z: .3 });
Object.assign(alternative[3], { x: 2.1, z: -1.6 });
Object.assign(alternative[4], { x: .65, z: 1.25 });

export const initialState: AppState = freezeState({
  layouts: [
    { id: 'A', name: 'Everyday', room: { ...room }, items: everyday },
    { id: 'B', name: 'Open floor', room: { ...room }, items: alternative },
  ],
  activeId: 'A', selectionId: 'sofa-1',
});

export function activeLayout(state: AppState): Layout {
  return state.layouts.find(layout => layout.id === state.activeId)!;
}
export function selectedItem(state: AppState): Furniture | null {
  return activeLayout(state).items.find(item => item.id === state.selectionId) ?? null;
}

/** Clockwise floor footprint, matching Three.js rotation around Y. */
export function corners(item: Furniture): Point[] {
  const c = Math.cos(item.rotation), s = Math.sin(item.rotation);
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sz]) => {
    const x = sx * item.width / 2, z = sz * item.depth / 2;
    return { x: item.x + x * c + z * s, z: item.z - x * s + z * c };
  });
}

function dot(point: Point, axis: Point): number { return point.x * axis.x + point.z * axis.z; }
function horizontalRelation(a: Furniture, b: Furniture): 'overlap' | 'touch' | 'apart' {
  const ac = corners(a), bc = corners(b);
  const axes = [a.rotation, b.rotation].flatMap(angle => [
    { x: Math.cos(angle), z: -Math.sin(angle) },
    { x: Math.sin(angle), z: Math.cos(angle) },
  ]);
  let touches = false;
  for (const axis of axes) {
    const ap = ac.map(point => dot(point, axis)), bp = bc.map(point => dot(point, axis));
    const penetration = Math.min(Math.max(...ap), Math.max(...bp)) - Math.max(Math.min(...ap), Math.min(...bp));
    if (penetration < -EPSILON) return 'apart';
    if (penetration <= EPSILON) touches = true;
  }
  return touches ? 'touch' : 'overlap';
}

/** Touching surfaces are allowed. Wall art above a sofa does not collide with it. */
export function itemsOverlap(a: Furniture, b: Furniture): boolean {
  const verticalOverlap = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return verticalOverlap > EPSILON && horizontalRelation(a, b) === 'overlap';
}

export function wallViolations(item: Furniture, room: Room): Wall[] {
  const walls = wallGaps(item, room);
  const result: Wall[] = (Object.keys(walls) as (keyof typeof walls)[]).filter(wall => walls[wall] < -EPSILON);
  if (item.y + item.height > room.height + EPSILON) result.push('ceiling');
  return result;
}

function wallGaps(item: Furniture, room: Room): ItemClearance['walls'] {
  const points = corners(item), xs = points.map(point => point.x), zs = points.map(point => point.z);
  return {
    left: Math.min(...xs) + room.width / 2,
    right: room.width / 2 - Math.max(...xs),
    back: Math.min(...zs) + room.depth / 2,
    front: room.depth / 2 - Math.max(...zs),
  };
}

function pointSegmentDistance(point: Point, start: Point, end: Point): number {
  const dx = end.x - start.x, dz = end.z - start.z;
  const denominator = dx * dx + dz * dz;
  const t = denominator === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.z - start.z) * dz) / denominator));
  return Math.hypot(point.x - start.x - t * dx, point.z - start.z - t * dz);
}

/** True shortest horizontal edge-to-edge gap, including rotated furniture. */
export function horizontalDistance(a: Furniture, b: Furniture): number {
  if (horizontalRelation(a, b) !== 'apart') return 0;
  const ac = corners(a), bc = corners(b);
  let shortest = Infinity;
  for (let index = 0; index < 4; index++) {
    for (const point of ac) shortest = Math.min(shortest, pointSegmentDistance(point, bc[index], bc[(index + 1) % 4]));
    for (const point of bc) shortest = Math.min(shortest, pointSegmentDistance(point, ac[index], ac[(index + 1) % 4]));
  }
  return shortest;
}

export function clearanceForItem(item: Furniture, layout: Layout): ItemClearance {
  let closest: ItemClearance['closest'] = null;
  for (const other of layout.items) {
    if (other.id === item.id) continue;
    const distance = horizontalDistance(item, other);
    if (!closest || distance < closest.distance) closest = { id: other.id, name: other.name, distance };
  }
  return { walls: wallGaps(item, layout.room), closest };
}

export function formatDistance(meters: number): string {
  if (!Number.isFinite(meters)) return '—';
  const centimeters = Math.round(meters * 100);
  return `${Object.is(centimeters, -0) ? 0 : centimeters} cm`;
}

export function serializeState(state: AppState): string {
  if (!validateState(state)) throw new Error('Invalid room plan');
  return JSON.stringify({ version: 1, state });
}
export function deserializeState(serialized: string): AppState | null {
  // Two layouts can contain up to 24 photos; reject unreasonably large payloads before parsing.
  if (serialized.length > MAX_PHOTO_LENGTH * MAX_ITEMS * 2 + 100_000) return null;
  try {
    const parsed: unknown = JSON.parse(serialized);
    if (!record(parsed) || parsed.version !== 1 || !validateState(parsed.state)) return null;
    return copyState(parsed.state);
  } catch { return null; }
}

const defaults: Record<ItemKind, Omit<Furniture, 'id' | 'x' | 'z'>> = {
  sofa: { name: 'Sofa', kind: 'sofa', width: 2.1, depth: .9, height: .8, y: 0, rotation: 0, color: '#d2be9e' },
  chair: { name: 'Chair', kind: 'chair', width: .75, depth: .8, height: .9, y: 0, rotation: 0, color: '#7d8c71' },
  table: { name: 'Table', kind: 'table', width: 1.2, depth: .7, height: .65, y: 0, rotation: 0, color: '#a77b58' },
  shelf: { name: 'Bookshelf', kind: 'shelf', width: 1.2, depth: .35, height: 1.8, y: 0, rotation: 0, color: '#876346' },
  art: { name: 'Wall art', kind: 'art', width: .8, depth: .045, height: .6, y: 1.25, rotation: 0, color: '#ba7864' },
};

function browserStorage(): StorageLike | undefined {
  try { return typeof localStorage === 'undefined' ? undefined : localStorage; } catch { return undefined; }
}
function contentKey(state: AppState): string { return JSON.stringify(state.layouts); }

export function createPlannerStore(start: AppState = initialState, storage: StorageLike | undefined = browserStorage()): PlannerStore {
  if (!validateState(start)) throw new Error('Invalid initial room plan');
  let state = freezeState(copyState(start));
  const listeners = new Set<() => void>();
  const past: AppState[] = [], future: AppState[] = [];
  let editStart: AppState | null = null;
  let itemCounter = 0;
  const notify = () => { for (const listener of listeners) listener(); };
  const remember = (snapshot: AppState) => {
    past.push(snapshot);
    if (past.length > 100) past.shift();
    future.length = 0;
  };
  const apply = (next: AppState, history = true): boolean => {
    if (!validateState(next) || JSON.stringify(next) === JSON.stringify(state)) return false;
    if (history && !editStart && contentKey(state) !== contentKey(next)) remember(state);
    state = freezeState(next);
    notify();
    return true;
  };
  const updateLayout = (mutate: (layout: Layout, next: AppState) => void): boolean => {
    const next = copyState(state);
    mutate(activeLayout(next), next);
    return apply(next);
  };
  const endEdit = (): boolean => {
    if (!editStart) return false;
    const before = editStart;
    editStart = null;
    if (contentKey(before) === contentKey(state)) return false;
    remember(before);
    notify();
    return true;
  };
  return {
    getState: () => state,
    subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    select: id => {
      if (id !== null && !activeLayout(state).items.some(item => item.id === id)) return false;
      return apply({ ...state, selectionId: id }, false);
    },
    setActive: id => {
      if (!['A', 'B'].includes(id)) return false;
      endEdit();
      const next = copyState(state);
      next.activeId = id;
      next.selectionId = activeLayout(next).items.some(item => item.id === state.selectionId) ? state.selectionId : null;
      return apply(next, false);
    },
    renameLayout: name => updateLayout(layout => { layout.name = name.trim(); }),
    setRoom: patch => {
      const next = copyState(state);
      for (const layout of next.layouts) layout.room = { ...layout.room, ...patch };
      return apply(next);
    },
    addItem: kind => {
      if (!kinds.includes(kind) || activeLayout(state).items.length >= MAX_ITEMS) return null;
      let id = '';
      do { id = `${kind}-${Date.now().toString(36)}-${(++itemCounter).toString(36)}`; }
      while (state.layouts.some(layout => layout.items.some(item => item.id === id)));
      const current = activeLayout(state);
      const item: Furniture = { ...defaults[kind], id, x: 0, z: kind === 'art' ? -current.room.depth / 2 + .03 : .7 };
      // Prefer a free in-room position; allow visible warnings if the room is full.
      const candidates: Point[] = [{ x: item.x, z: item.z }];
      if (kind !== 'art') {
        for (let z = -current.room.depth / 2 + item.depth / 2 + .1; z < current.room.depth / 2; z += .25)
          for (let x = -current.room.width / 2 + item.width / 2 + .1; x < current.room.width / 2; x += .25) candidates.push({ x, z });
      }
      for (const point of candidates) {
        const candidate = { ...item, ...point };
        if (wallViolations(candidate, current.room).length === 0 && current.items.every(other => !itemsOverlap(candidate, other))) { Object.assign(item, point); break; }
      }
      const changed = updateLayout((layout, next) => { layout.items.push(item); next.selectionId = id; });
      return changed ? id : null;
    },
    patchItem: (id, patch) => updateLayout(layout => {
      const index = layout.items.findIndex(item => item.id === id);
      if (index < 0) return;
      const item = { ...layout.items[index], ...patch, id: layout.items[index].id, kind: layout.items[index].kind };
      if (patch.photo === '' || (Object.hasOwn(patch, 'photo') && patch.photo === undefined)) delete item.photo;
      if (typeof item.name === 'string') item.name = item.name.trim();
      if (Number.isFinite(item.rotation)) item.rotation = Math.atan2(Math.sin(item.rotation), Math.cos(item.rotation));
      layout.items[index] = item;
    }),
    removeItem: id => updateLayout((layout, next) => {
      layout.items = layout.items.filter(item => item.id !== id);
      if (next.selectionId === id) next.selectionId = null;
    }),
    copyActiveToOther: () => {
      const next = copyState(state), source = activeLayout(next), other = next.layouts.find(layout => layout.id !== next.activeId)!;
      other.room = { ...source.room };
      other.items = source.items.map(item => ({ ...item }));
      return apply(next);
    },
    beginEdit: () => { if (!editStart) editStart = state; },
    endEdit,
    cancelEdit: () => {
      if (!editStart) return;
      const before = editStart;
      editStart = null;
      if (state !== before) { state = before; notify(); }
    },
    undo: () => {
      endEdit();
      const previous = past.pop();
      if (!previous) return false;
      future.push(state); state = previous; notify(); return true;
    },
    redo: () => {
      endEdit();
      const next = future.pop();
      if (!next) return false;
      past.push(state); state = next; notify(); return true;
    },
    canUndo: () => past.length > 0 || (editStart !== null && contentKey(editStart) !== contentKey(state)),
    canRedo: () => future.length > 0 && (editStart === null || contentKey(editStart) === contentKey(state)),
    save: () => {
      if (!storage) return false;
      try { storage.setItem(STORAGE_KEY, serializeState(state)); return true; } catch { return false; }
    },
    load: () => {
      if (!storage) return false;
      try {
        const serialized = storage.getItem(STORAGE_KEY);
        if (!serialized) return false;
        const loaded = deserializeState(serialized);
        if (!loaded) return false;
        editStart = null; past.length = 0; future.length = 0;
        state = freezeState(loaded); notify(); return true;
      } catch { return false; }
    },
  };
}

export function xmlEscape(value: string): string {
  return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]!);
}

/** A standalone, measured 2D plan. Photos remain in the local editor and are not embedded. */
export function exportPlanSvg(layout: Layout): string {
  const scale = 110, margin = 94;
  const planWidth = layout.room.width * scale, planDepth = layout.room.depth * scale;
  const pageWidth = Math.max(820, planWidth + margin * 2), pageHeight = planDepth + 220 + layout.items.length * 27;
  const left = (pageWidth - planWidth) / 2, top = 118;
  const map = (point: Point) => `${(left + (point.x + layout.room.width / 2) * scale).toFixed(2)},${(top + (point.z + layout.room.depth / 2) * scale).toFixed(2)}`;
  const lines: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${pageWidth}" height="${pageHeight}" viewBox="0 0 ${pageWidth} ${pageHeight}" role="img" aria-label="${xmlEscape(layout.name)} measured room plan">`,
    `<rect width="100%" height="100%" fill="#fbf8f2"/>`,
    `<g font-family="Arial, sans-serif" fill="#26352e">`,
    `<text x="40" y="44" font-size="26" font-weight="700">Roomshift · ${xmlEscape(layout.name)}</text>`,
    `<text x="40" y="73" font-size="14">Room ${formatDistance(layout.room.width)} × ${formatDistance(layout.room.depth)} · ceiling ${formatDistance(layout.room.height)}</text>`,
    `<text x="40" y="96" font-size="12">Plan scale: 110 SVG units per meter. Measurements are entered by you; verify clearances in the room.</text>`,
    `<rect x="${left}" y="${top}" width="${planWidth}" height="${planDepth}" fill="#f1ebdf" stroke="#26352e" stroke-width="3"/>`,
    `<text x="${pageWidth / 2}" y="${top - 9}" text-anchor="middle" font-size="13">BACK · ${formatDistance(layout.room.width)}</text>`,
    `<text x="${pageWidth / 2}" y="${top + planDepth + 23}" text-anchor="middle" font-size="13">FRONT</text>`,
    `<text x="${left - 18}" y="${top + planDepth / 2}" text-anchor="middle" font-size="12" transform="rotate(-90 ${left - 18} ${top + planDepth / 2})">LEFT · ${formatDistance(layout.room.depth)}</text>`,
    `<text x="${left + planWidth + 23}" y="${top + planDepth / 2}" text-anchor="middle" font-size="12" transform="rotate(90 ${left + planWidth + 23} ${top + planDepth / 2})">RIGHT</text>`,
  ];
  const conflicts = new Set<string>();
  for (const item of layout.items) {
    if (wallViolations(item, layout.room).length || layout.items.some(other => other.id !== item.id && itemsOverlap(item, other))) conflicts.add(item.id);
  }
  layout.items.forEach((item, index) => {
    const center = map(item).split(',');
    lines.push(`<polygon points="${corners(item).map(map).join(' ')}" fill="${item.color}" fill-opacity=".6" stroke="${conflicts.has(item.id) ? '#ae4439' : '#49574a'}" stroke-width="2"/>`);
    lines.push(`<text x="${center[0]}" y="${Number(center[1]) + 5}" text-anchor="middle" font-size="14" font-weight="700">${index + 1}</text>`);
  });
  const legendTop = top + planDepth + 60;
  lines.push(`<text x="40" y="${legendTop}" font-size="14" font-weight="700">Dimensions: W × D × H. Center coordinates measured from the room center.</text>`);
  layout.items.forEach((item, index) => {
    const degrees = Math.round(item.rotation * 180 / Math.PI);
    lines.push(`<text x="40" y="${legendTop + 27 * (index + 1)}" font-size="13">${index + 1}. ${xmlEscape(item.name)} · ${formatDistance(item.width)} × ${formatDistance(item.depth)} × ${formatDistance(item.height)} · x ${formatDistance(item.x)}, z ${formatDistance(item.z)} · ${degrees}°${item.y ? ` · bottom ${formatDistance(item.y)}` : ''}${conflicts.has(item.id) ? ' · CHECK OVERLAP / BOUNDARY' : ''}</text>`);
  });
  lines.push('</g></svg>');
  return lines.join('\n');
}
