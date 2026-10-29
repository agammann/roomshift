import test from 'node:test';
import assert from 'node:assert/strict';
import {
  activeLayout, clearanceForItem, corners, createPlannerStore, deserializeState, exportPlanSvg,
  formatDistance, horizontalDistance, initialState, itemsOverlap, MAX_ITEMS, MAX_PHOTO_LENGTH,
  serializeState, STORAGE_KEY, validateItem, validateState, wallViolations,
} from './model.ts';
import type { AppState, Furniture, StorageLike } from './model.ts';

const fixture = (patch: Partial<Furniture> = {}): Furniture => ({
  id: 'fixture', name: 'Fixture', kind: 'table', width: 2, depth: 2, height: 1,
  x: 0, z: 0, y: 0, rotation: 0, color: '#aabbcc', ...patch,
});
const closeTo = (actual: number, expected: number, epsilon = 1e-8) =>
  assert.ok(Math.abs(actual - expected) < epsilon, `expected ${actual} to equal ${expected}`);
const fresh = (): AppState => structuredClone(initialState);
class MemoryStorage implements StorageLike {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

test('both supplied layouts fit the room without collisions', () => {
  assert.equal(validateState(initialState), true);
  assert.equal(initialState.layouts.length, 2);
  for (const layout of initialState.layouts) {
    for (const item of layout.items) {
      assert.deepEqual(wallViolations(item, layout.room), [], `${layout.id}: ${item.name}`);
      for (const other of layout.items) if (item !== other) assert.equal(itemsOverlap(item, other), false, `${layout.id}: ${item.name}/${other.name}`);
    }
  }
});

test('footprints rotate with positive Three.js Y rotation', () => {
  const points = corners(fixture({ width: 4, depth: 2, x: 1, z: -1, rotation: Math.PI / 2 }));
  closeTo(points[0].x, 0);
  closeTo(points[0].z, 1);
  closeTo(points[1].x, 0);
  closeTo(points[1].z, -3);
  closeTo(points[2].x, 2);
  closeTo(points[2].z, -3);
});

test('touching horizontal faces are allowed but positive volume intersection collides', () => {
  const a = fixture();
  assert.equal(itemsOverlap(a, fixture({ id: 'b', x: 2 })), false);
  assert.equal(itemsOverlap(a, fixture({ id: 'b', x: 1.999 })), true);
  assert.equal(itemsOverlap(a, fixture({ id: 'b', x: 2.001 })), false);
  assert.equal(horizontalDistance(a, fixture({ id: 'b', x: 2 })), 0);
});

test('parallel diagonal thin furniture is separated even when bounding boxes overlap', () => {
  const a = fixture({ width: 3, depth: .25, rotation: Math.PI / 4 });
  const b = fixture({ id: 'b', width: 3, depth: .25, rotation: Math.PI / 4, x: .6, z: .6 });
  assert.equal(itemsOverlap(a, b), false);
  closeTo(horizontalDistance(a, b), .6 * Math.SQRT2 - .25);
  closeTo(horizontalDistance(a, b), horizontalDistance(b, a));
});

test('distance uses corner-to-edge or corner-to-corner geometry, rather than center distance', () => {
  closeTo(horizontalDistance(fixture(), fixture({ id: 'b', x: 3, z: 4 })), Math.sqrt(5));
  const a = fixture({ rotation: Math.PI / 4 });
  const b = fixture({ id: 'b', x: 3, rotation: Math.PI / 4 });
  closeTo(horizontalDistance(a, b), 3 - 2 * Math.SQRT2);
  closeTo(horizontalDistance(fixture(), fixture({ id: 'b', x: .5, z: .5 })), 0);
});

test('elevated art does not collide with furniture beneath it', () => {
  const furniture = fixture();
  const art = fixture({ id: 'art', kind: 'art', width: .7, depth: .04, height: .5, y: 1.4 });
  assert.equal(itemsOverlap(furniture, art), false);
  assert.equal(itemsOverlap(furniture, { ...art, y: 1 }), false);
  assert.equal(itemsOverlap(furniture, { ...art, y: .99 }), true);
});

test('boundary validation uses rotated edges, allows touching and checks ceiling', () => {
  const room = { width: 4, depth: 4, height: 2.7 };
  assert.deepEqual(wallViolations(fixture({ x: 1 }), room), []);
  assert.deepEqual(wallViolations(fixture({ x: 1.01 }), room), ['right']);
  assert.deepEqual(wallViolations(fixture({ x: .6, rotation: Math.PI / 4 }), room), ['right']);
  assert.deepEqual(wallViolations(fixture({ y: 1.8 }), room), ['ceiling']);
  assert.deepEqual(wallViolations(fixture({ x: -2, z: 2 }), room), ['left', 'front']);
});

test('selected clearances measure signed wall gaps and the closest item', () => {
  const a = fixture(), b = fixture({ id: 'b', name: 'Neighbor', x: 2.75 });
  const gap = clearanceForItem(a, { id: 'A', name: 'Test', room: { width: 6, depth: 4, height: 2.7 }, items: [a, b] });
  assert.deepEqual(gap.walls, { left: 2, right: 2, back: 1, front: 1 });
  assert.deepEqual(gap.closest, { id: 'b', name: 'Neighbor', distance: .75 });
  assert.equal(formatDistance(.749), '75 cm');
  assert.equal(formatDistance(-.00001), '0 cm');
  assert.equal(formatDistance(Number.NaN), '—');
});

test('loading rejects nonfinite numbers, duplicate IDs, impossible counts and unsupported schema', () => {
  const state = fresh();
  state.layouts[0].items[0].x = Number.NaN;
  assert.equal(validateState(state), false);
  assert.equal(deserializeState(JSON.stringify({ version: 1, state })), null);
  const valid = serializeState(initialState);
  assert.equal(deserializeState(valid.replace('"width":5.4', '"width":1e999')), null);
  const duplicates = fresh();
  duplicates.layouts[0].items[1].id = duplicates.layouts[0].items[0].id;
  assert.equal(validateState(duplicates), false);
  const many = fresh();
  many.layouts[0].items = Array.from({ length: 13 }, (_, index) => fixture({ id: `test-${index}` }));
  many.selectionId = null;
  assert.equal(validateState(many), false);
  assert.equal(deserializeState('{"version":2,"state":{}}'), null);
  assert.equal(deserializeState('not json'), null);
});

test('photos must have a supported raster MIME, matching signature and bounded data', () => {
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5x8AAAAASUVORK5CYII=';
  const art = fixture({ kind: 'art', photo: png });
  assert.equal(validateItem(art), true);
  assert.equal(validateItem({ ...art, photo: 'data:image/svg+xml;base64,PHN2Zz4=' }), false);
  assert.equal(validateItem({ ...art, photo: png.replace('image/png', 'image/jpeg') }), false);
  assert.equal(validateItem({ ...art, photo: 'data:image/png;base64,aW52YWxpZA==' }), false);
  assert.equal(validateItem({ ...art, photo: 'data:image/png;base64,' + 'A'.repeat(MAX_PHOTO_LENGTH) }), false);
  assert.equal(validateItem({ ...art, kind: 'table' }), false);
});

test('store enforces the twelve-item cap and rejects invalid dimensions atomically', () => {
  const store = createPlannerStore();
  for (let index = activeLayout(store.getState()).items.length; index < MAX_ITEMS; index++) assert.ok(store.addItem('chair'));
  assert.equal(activeLayout(store.getState()).items.length, MAX_ITEMS);
  assert.equal(store.addItem('table'), null);
  const before = store.getState();
  assert.equal(store.patchItem('sofa-1', { width: 0, x: 1 }), false);
  assert.equal(store.setRoom({ width: Number.POSITIVE_INFINITY }), false);
  assert.equal(store.getState(), before);
  assert.throws(() => { store.getState().layouts[0].room.width = 9; }, TypeError);
});

test('drag transactions have one undo entry; selection does not alter history', () => {
  const store = createPlannerStore();
  store.select('chair-1');
  assert.equal(store.canUndo(), false);
  const original = activeLayout(store.getState()).items.find(item => item.id === 'sofa-1')!.x;
  store.beginEdit();
  assert.equal(store.patchItem('sofa-1', { x: original + .1 }), true);
  assert.equal(store.patchItem('sofa-1', { x: original + .2 }), true);
  assert.equal(store.patchItem('sofa-1', { x: original + .3 }), true);
  assert.equal(store.endEdit(), true);
  assert.equal(store.undo(), true);
  closeTo(activeLayout(store.getState()).items.find(item => item.id === 'sofa-1')!.x, original);
  assert.equal(store.canUndo(), false);
  assert.equal(store.redo(), true);
  closeTo(activeLayout(store.getState()).items.find(item => item.id === 'sofa-1')!.x, original + .3);
  store.beginEdit();
  store.patchItem('sofa-1', { x: original + 1 });
  store.cancelEdit();
  closeTo(activeLayout(store.getState()).items.find(item => item.id === 'sofa-1')!.x, original + .3);
});

test('saved layouts round trip, copy only geometry and corrupt loads leave current work intact', () => {
  const storage = new MemoryStorage(), store = createPlannerStore(initialState, storage);
  store.patchItem('sofa-1', { x: -.75 });
  assert.equal(store.copyActiveToOther(), true);
  const copied = store.getState().layouts[1];
  assert.equal(copied.name, 'Open floor');
  assert.deepEqual(copied.items, store.getState().layouts[0].items);
  assert.equal(store.save(), true);
  const restored = createPlannerStore(initialState, storage);
  assert.equal(restored.load(), true);
  assert.deepEqual(restored.getState(), store.getState());
  assert.equal(restored.canUndo(), false);
  const before = restored.getState();
  storage.setItem(STORAGE_KEY, '{"version":1,"state":null}');
  assert.equal(restored.load(), false);
  assert.equal(restored.getState(), before);
  const forbidden: StorageLike = { getItem() { throw Error('blocked'); }, setItem() { throw Error('quota'); } };
  assert.equal(createPlannerStore(initialState, forbidden).save(), false);
  assert.equal(createPlannerStore(initialState, forbidden).load(), false);
});

test('redo is unavailable during a changed drag and restored when the drag is cancelled', () => {
  const store = createPlannerStore();
  store.patchItem('sofa-1', { x: -.75 });
  store.undo();
  assert.equal(store.canRedo(), true);
  store.beginEdit();
  store.patchItem('sofa-1', { x: -.5 });
  assert.equal(store.canRedo(), false);
  store.cancelEdit();
  assert.equal(store.canRedo(), true);
  store.beginEdit();
  store.patchItem('sofa-1', { x: -.5 });
  store.endEdit();
  assert.equal(store.canRedo(), false);
});

test('both arrangements share one measured room and room changes undo as one edit', () => {
  const store = createPlannerStore();
  const positions = store.getState().layouts.map(layout => layout.items.map(item => [item.x, item.z]));
  assert.equal(store.setRoom({ width: 6, depth: 5, height: 3 }), true);
  for (const layout of store.getState().layouts) assert.deepEqual(layout.room, { width: 6, depth: 5, height: 3 });
  assert.deepEqual(store.getState().layouts.map(layout => layout.items.map(item => [item.x, item.z])), positions);
  assert.equal(store.undo(), true);
  assert.equal(store.canUndo(), false);
  for (const layout of store.getState().layouts) assert.deepEqual(layout.room, initialState.layouts[0].room);
  const mismatched = fresh();
  mismatched.layouts[1].room.width = 6;
  assert.equal(validateState(mismatched), false);
  assert.equal(deserializeState(JSON.stringify({ version: 1, state: mismatched })), null);
});

test('removing selection and photo clearing remain undoable', () => {
  const store = createPlannerStore();
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5x8AAAAASUVORK5CYII=';
  assert.equal(store.patchItem('art-1', { photo: png }), true);
  assert.equal(store.patchItem('art-1', { photo: undefined }), true);
  assert.equal(activeLayout(store.getState()).items.find(item => item.id === 'art-1')!.photo, undefined);
  assert.equal(store.undo(), true);
  assert.equal(activeLayout(store.getState()).items.find(item => item.id === 'art-1')!.photo, png);
  store.select('sofa-1');
  assert.equal(store.removeItem('sofa-1'), true);
  assert.equal(store.getState().selectionId, null);
  assert.equal(store.undo(), true);
  assert.equal(store.getState().selectionId, 'sofa-1');
});

test('SVG contains measured geometry and safely escapes names and XML attributes', () => {
  const layout = fresh().layouts[0];
  layout.name = 'A & <draft>';
  layout.items[0].name = '<script>x</script> & "oak"';
  const svg = exportPlanSvg(layout);
  assert.ok(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"'));
  assert.match(svg, /A &amp; &lt;draft&gt;/);
  assert.match(svg, /&lt;script&gt;x&lt;\/script&gt; &amp; &quot;oak&quot;/);
  assert.ok(!svg.includes('<script>'));
  assert.match(svg, /540 cm × 420 cm/);
  assert.match(svg, /210 cm × 85 cm × 78 cm/);
  assert.match(svg, /x -60 cm, z -85 cm/);
  assert.equal((svg.match(/<polygon /g) ?? []).length, 6);
});

test('autosave preserves corrupt, empty and newer-schema storage until an explicit external reset', () => {
  for (const original of ['{broken', '', '{"version":2,"state":{}}']) {
    const storage = new MemoryStorage();
    storage.setItem(STORAGE_KEY, original);
    const store = createPlannerStore(initialState, storage);
    assert.equal(store.load(), false);
    store.setRoom({ width: 6.2 });
    assert.equal(store.save(), false);
    assert.equal(storage.getItem(STORAGE_KEY), original);
    assert.ok(exportPlanSvg(activeLayout(store.getState())).includes('620'));
    const restarted = createPlannerStore(initialState, storage);
    assert.equal(restarted.load(), false);
    assert.equal(restarted.save(), false);
    assert.equal(storage.getItem(STORAGE_KEY), original);
    // Only the owner removing/replacing the unreadable entry permits saving again.
    storage.values.delete(STORAGE_KEY);
    assert.equal(store.save(), true);
    assert.equal(deserializeState(storage.getItem(STORAGE_KEY)!)?.layouts[0].room.width, 6.2);
  }
});

test('a failed storage read never permits autosave to replace unseen data', () => {
  let writes = 0;
  const storage: StorageLike = { getItem() { throw Error('unavailable'); }, setItem() { writes++; } };
  const store = createPlannerStore(initialState, storage);
  assert.equal(store.load(), false);
  assert.equal(store.save(), false);
  assert.equal(writes, 0);
});

test('a transient startup read failure cannot overwrite a valid saved plan after storage recovers', () => {
  const storage = new MemoryStorage();
  const saved = fresh();
  saved.layouts[0].room.width = 6.2;
  saved.layouts[1].room.width = 6.2;
  const original = serializeState(saved);
  storage.setItem(STORAGE_KEY, original);
  let unavailable = true;
  const transient: StorageLike = {
    getItem(key) { if (unavailable) throw Error('temporarily blocked'); return storage.getItem(key); },
    setItem(key, value) { storage.setItem(key, value); },
  };
  const store = createPlannerStore(initialState, transient);
  assert.equal(store.load(), false);
  unavailable = false;
  assert.equal(store.save(), false);
  assert.equal(storage.getItem(STORAGE_KEY), original);
  assert.equal(store.load(), true);
  assert.equal(store.getState().layouts[0].room.width, 6.2);
  assert.equal(store.save(), true);
});

test('quota failures preserve saved work and permit a later retry', () => {
  const storage = new MemoryStorage();
  const store = createPlannerStore(initialState, storage);
  assert.equal(store.save(), true);
  const original = storage.getItem(STORAGE_KEY);
  let full = true;
  const limited: StorageLike = { getItem: key => storage.getItem(key), setItem(key, value) { if (full) throw Error('quota'); storage.setItem(key, value); } };
  const editing = createPlannerStore(initialState, limited);
  assert.equal(editing.load(), true);
  editing.setRoom({ width: 6.2 });
  assert.equal(editing.save(), false);
  assert.equal(storage.getItem(STORAGE_KEY), original);
  full = false;
  assert.equal(editing.save(), true);
  assert.equal(deserializeState(storage.getItem(STORAGE_KEY)!)?.layouts[0].room.width, 6.2);
});

test('a recovered empty store permits repeated saves after a failed startup read', () => {
  const storage = new MemoryStorage();
  let blocked = true;
  const transient: StorageLike = { getItem(key) { if (blocked) throw Error('blocked'); return storage.getItem(key); }, setItem(key, value) { storage.setItem(key, value); } };
  const store = createPlannerStore(initialState, transient);
  assert.equal(store.load(), false);
  blocked = false;
  assert.equal(store.save(), true);
  store.setRoom({ width: 6.3 });
  assert.equal(store.save(), true);
  assert.equal(deserializeState(storage.getItem(STORAGE_KEY)!)?.layouts[0].room.width, 6.3);
});
