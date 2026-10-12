import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ChangeEvent, type CSSProperties } from 'react';
import { activeLayout, clearanceForItem, exportPlanSvg, formatDistance, itemsOverlap, MAX_ITEMS, selectedItem, wallViolations, type Furniture, type ItemKind, type Layout, type PlannerStore } from './model';
import type { SceneController } from './scene';
import { Icon } from './icons';
import { Modal, NumberField, TextField } from './ui-components';
import './styles.css';

type ViewMode = 'tabletop' | 'life-size';
type SceneStatus = { ready: boolean; xrSupported: boolean; inXR: boolean; error?: string; message?: string; view?: ViewMode; compare?: boolean; overlays?: { gaps: boolean; overlaps: boolean } };
type ModalName = 'add' | 'room' | 'help' | 'item' | null;

const ITEM_TYPES: { kind: ItemKind; name: string; detail: string }[] = [
  { kind: 'sofa', name: 'Sofa', detail: 'A seat for a few people' },
  { kind: 'chair', name: 'Armchair', detail: 'A favourite place to sit' },
  { kind: 'table', name: 'Table', detail: 'Coffee, side or dining table' },
  { kind: 'shelf', name: 'Bookshelf', detail: 'Storage with a tall footprint' },
  { kind: 'art', name: 'Wall art', detail: 'A framed piece with an optional photo' },
];

function itemDimensions(item: Furniture) {
  return `${Math.round(item.width * 100)} × ${Math.round(item.depth * 100)} × ${Math.round(item.height * 100)} cm`;
}

function layoutIssues(layout: Layout): string[] {
  const issues: string[] = [];
  for (let i = 0; i < layout.items.length; i++) {
    const item = layout.items[i];
    if (wallViolations(item, layout.room).length > 0) issues.push(`${item.name} extends outside the room.`);
    for (let j = i + 1; j < layout.items.length; j++) {
      if (itemsOverlap(item, layout.items[j])) issues.push(`${item.name} overlaps ${layout.items[j].name}.`);
    }
  }
  return issues;
}

function RoomFields({ layout, store, notify }: { layout: Layout; store: PlannerStore; notify: (message: string) => void }) {
  return <div className="field-grid room-fields">
    <NumberField label="Width (m)" ariaLabel="Room width" value={layout.room.width} min={2} max={20} step={0.1} onCommit={width => store.setRoom({ width })} onInvalid={notify}/>
    <NumberField label="Depth (m)" ariaLabel="Room depth" value={layout.room.depth} min={2} max={20} step={0.1} onCommit={depth => store.setRoom({ depth })} onInvalid={notify}/>
    <NumberField label="Height (m)" ariaLabel="Room height" value={layout.room.height} min={1.8} max={5} step={0.1} onCommit={height => store.setRoom({ height })} onInvalid={notify}/>
  </div>;
}

function RoomRail({ layout, selectionId, store, onAdd, onItemMenu, notify }: {
  layout: Layout; selectionId: string | null; store: PlannerStore; onAdd: () => void; onItemMenu: (id: string) => void; notify: (message: string) => void;
}) {
  return <aside className="room-rail" aria-label="Room and belongings">
    <section className="room-section"><h2>Your room</h2><RoomFields layout={layout} store={store} notify={notify}/></section>
    <section className="belongings-section"><h2>Your belongings</h2><div className="item-list">
      {layout.items.map(item => <div key={item.id} className={`item-row ${selectionId === item.id ? 'selected' : ''}`}>
        <button className="item-select" onClick={() => store.select(item.id)} aria-pressed={selectionId === item.id} aria-label={`Select ${item.name}`}>
          <span className={`item-swatch swatch-${item.kind}`} style={{ '--item-color': item.color } as CSSProperties}>{item.photo ? <img src={item.photo} alt=""/> : null}</span>
          <span className="item-copy"><span className="item-name">{item.name}</span><span className="item-dimensions">{itemDimensions(item)}</span></span>
        </button><button className="item-menu" aria-label={`Actions for ${item.name}`} onClick={() => onItemMenu(item.id)}><span/><span/><span/></button>
      </div>)}
      {layout.items.length === 0 ? <p className="empty-list">Add the things you already own, then enter their measurements.</p> : null}
    </div><button className="button secondary add-button" onClick={onAdd} disabled={layout.items.length >= MAX_ITEMS}><Icon name="plus" size={18}/>Add item</button><p className="item-count">{layout.items.length} of {MAX_ITEMS} items</p></section>
    <button className="rail-help" onClick={() => notify('Measure the room and each item yourself. Enter metres for the room and centimetres for belongings.')}><Icon name="help" size={16}/>About measurements</button>
  </aside>;
}

function PhotoField({ item, store, notify }: { item: Furniture; store: PlannerStore; notify: (message: string) => void }) {
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { notify('Choose a JPG, PNG or WebP image.'); return; }
    if (file.size > 5 * 1024 * 1024) { notify('Choose an image smaller than 5 MB.'); return; }
    const targetLayoutId = store.getState().activeId;
    setBusy(true);
    const objectUrl = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = objectUrl;
      await image.decode();
      const scale = Math.min(1, 1000 / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Image processing is unavailable.');
      context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const photo = canvas.toDataURL('image/jpeg', .8);
      if (photo.length > 1_400_000) throw new Error('This image could not be added. Try a smaller image.');
      if (store.getState().activeId !== targetLayoutId) throw new Error('The layout changed while opening the photo. Choose it again in the intended layout.');
      const targetItem = activeLayout(store.getState()).items.find(current => current.id === item.id);
      if (!targetItem) throw new Error('This item was removed while opening the photo.');
      if (targetItem.photo !== photo && !store.patchItem(item.id, { photo })) throw new Error('This image could not be added. Try a smaller image.');
      notify('Photo added to this piece. Its measurements stay as entered.');
    } catch (error) { notify(error instanceof Error ? error.message : 'This image could not be opened.'); }
    finally { URL.revokeObjectURL(objectUrl); setBusy(false); }
  }
  return <section className="inspector-section photo-section"><h3>Art photo <span className="muted">(optional)</span></h3>
    {item.photo ? <div className="photo-preview"><img src={item.photo} alt={`Photo for ${item.name}`}/><button className="icon-button" aria-label="Remove art photo" onClick={() => store.patchItem(item.id, { photo: undefined })}><Icon name="trash" size={16}/></button></div> : null}
    <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={upload} className="visually-hidden" aria-label="Choose art photo"/>
    <button className="button secondary photo-button" disabled={busy} onClick={() => fileRef.current?.click()}><Icon name="image" size={17}/>{busy ? 'Opening image…' : item.photo ? 'Replace photo' : 'Add a photo'}</button><p className="field-note">JPG, PNG or WebP, up to 5 MB. Kept on this device.</p>
  </section>;
}

function Inspector({ item, layout, store, onItemMenu, notify }: { item: Furniture | null; layout: Layout; store: PlannerStore; onItemMenu: (id: string) => void; notify: (message: string) => void }) {
  if (!item) return <aside className="inspector empty-inspector" aria-label="Item inspector"><h2>Select a belonging</h2><p>Choose an item in your room or the list to edit its dimensions and placement.</p><Icon name="sofa" size={44}/><p className="measurement-note">Measurements come from your inputs.</p></aside>;
  const clearance = clearanceForItem(item, layout);
  const overlapping = layout.items.filter(other => other.id !== item.id && itemsOverlap(item, other));
  const outside = wallViolations(item, layout.room);
  const degrees = item.rotation * 180 / Math.PI;
  const distance = (metres: number) => metres < -0.001 ? `−${formatDistance(-metres)}` : formatDistance(Math.max(0, metres));
  return <aside className="inspector" aria-label="Item inspector">
    <div className="inspector-heading"><h2>{item.name}</h2><button className="item-menu" aria-label={`More actions for ${item.name}`} onClick={() => onItemMenu(item.id)}><span/><span/><span/></button></div>
    <section className="inspector-section name-section"><TextField label="Name" ariaLabel="Item name" value={item.name} onCommit={name => store.patchItem(item.id, { name })}/></section>
    <section className="inspector-section"><h3>Dimensions (cm)</h3><div className="field-grid dimensions-fields">
      <NumberField label="Width (W)" ariaLabel="Item width" value={item.width * 100} min={2} max={1000} onCommit={width => store.patchItem(item.id, { width: width / 100 })} onInvalid={notify}/>
      <NumberField label="Depth (D)" ariaLabel="Item depth" value={item.depth * 100} min={2} max={1000} onCommit={depth => store.patchItem(item.id, { depth: depth / 100 })} onInvalid={notify}/>
      <NumberField label="Height (H)" ariaLabel="Item height" value={item.height * 100} min={2} max={500} onCommit={height => store.patchItem(item.id, { height: height / 100 })} onInvalid={notify}/>
    </div></section>
    <section className="inspector-section position-section"><h3>Position (cm)</h3><div className="field-grid position-fields">
      <NumberField label="X (left/right)" ariaLabel="Item X position" value={item.x * 100} min={-3000} max={3000} step={5} onCommit={x => store.patchItem(item.id, { x: x / 100 })} onInvalid={notify}/>
      <NumberField label="Z (forward/back)" ariaLabel="Item Z position" value={item.z * 100} min={-3000} max={3000} step={5} onCommit={z => store.patchItem(item.id, { z: z / 100 })} onInvalid={notify}/>
    </div>{item.kind === 'art' ? <div className="elevation-field"><NumberField label="Bottom above floor (cm)" ariaLabel="Art elevation" value={item.y * 100} min={0} max={500} step={5} onCommit={y => store.patchItem(item.id, { y: y / 100 })} onInvalid={notify}/></div> : null}
    <div className="rotation-row"><NumberField label="Rotation" ariaLabel="Item rotation" value={degrees} min={-36000} max={36000} step={15} unit="°" onCommit={value => store.patchItem(item.id, { rotation: value * Math.PI / 180 })} onInvalid={notify}/><button className="icon-button outlined" aria-label="Rotate item 15 degrees left" onClick={() => store.patchItem(item.id, { rotation: item.rotation - Math.PI / 12 })}><Icon name="rotate-left"/></button><button className="icon-button outlined" aria-label="Rotate item 15 degrees right" onClick={() => store.patchItem(item.id, { rotation: item.rotation + Math.PI / 12 })}><Icon name="rotate-right"/></button></div></section>
    <section className="inspector-section clearance-section"><h3>Clearance</h3>
      <dl className="clearance-list"><div><dt title={clearance.closest?.name}>Closest item</dt><dd className={overlapping.length ? 'warning-text' : ''}>{clearance.closest ? formatDistance(clearance.closest.distance) : '—'}</dd></div>
      {(['right', 'left', 'back', 'front'] as const).map(wall => <div key={wall}><dt>{wall[0].toUpperCase() + wall.slice(1)} wall</dt><dd className={clearance.walls[wall] < -.001 ? 'warning-text' : ''}>{distance(clearance.walls[wall])}</dd></div>)}</dl>
      {overlapping.length > 0 ? <p className="issue-note">Overlaps {overlapping.map(other => other.name).join(', ')}.</p> : null}
      {outside.length > 0 ? <p className="issue-note">Outside the {outside.join(', ')} boundary.</p> : null}
    </section>
    {item.kind === 'art' ? <PhotoField item={item} store={store} notify={notify}/> : null}
    <p className="measurement-note">Measurements come from your inputs.</p>
  </aside>;
}

function CompareSummary({ layouts, active, onCopy }: { layouts: Layout[]; active: Layout; onCopy: () => void }) {
  return <div className="compare-summary"><div><strong>Comparing layouts</strong><span>Solid: {active.id} · Ghost: {active.id === 'A' ? 'B' : 'A'}</span></div><div className="compare-counts">{layouts.map(layout => <span key={layout.id}>Layout {layout.id}: {layout.items.length} items · {layoutIssues(layout).length} conflicts</span>)}</div><button className="button secondary" onClick={onCopy}>Copy {active.id} to {active.id === 'A' ? 'B' : 'A'}</button></div>;
}

export default function App({ store }: { store: PlannerStore }) {
  const state = useSyncExternalStore(store.subscribe, store.getState, store.getState);
  const layout = activeLayout(state);
  const item = selectedItem(state);
  const [view, setView] = useState<ViewMode>('tabletop');
  const [compare, setCompare] = useState(false);
  const [gaps, setGaps] = useState(true);
  const [overlaps, setOverlaps] = useState(true);
  const [modal, setModal] = useState<ModalName>(null);
  const [menuItemId, setMenuItemId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'saving' | 'saved' | 'error'>('saving');
  const [sceneStatus, setSceneStatus] = useState<SceneStatus>({ ready: false, xrSupported: false, inXR: false });
  const [sceneRetry, setSceneRetry] = useState(0);
  const [enteringXR, setEnteringXR] = useState(false);
  const sceneElement = useRef<HTMLDivElement>(null);
  const controller = useRef<SceneController | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sceneOptions = useRef({ view, compare, gaps, overlaps });
  sceneOptions.current = { view, compare, gaps, overlaps };
  const issues = useMemo(() => layoutIssues(layout), [layout]);
  const menuItem = layout.items.find(belonging => belonging.id === menuItemId) ?? null;

  function notify(message: string) {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 5500);
  }

  useEffect(() => {
    setSaveStatus('saving');
    const timer = setTimeout(() => setSaveStatus(store.save() ? 'saved' : 'error'), 300);
    return () => clearTimeout(timer);
  }, [store, state.layouts]);

  useEffect(() => {
    const host = sceneElement.current;
    if (!host) return;
    let cancelled = false;
    let mounted: SceneController | null = null;
    setSceneStatus({ ready: false, xrSupported: false, inXR: false });
    import('./scene').then(({ mountScene }) => {
      if (cancelled) return null;
      return mountScene(host, { store, onStatus: status => {
        if (cancelled) return;
        setSceneStatus(status);
        if (mounted) {
          if (status.view) setView(status.view);
          if (status.compare !== undefined) setCompare(status.compare);
          if (status.overlays) { setGaps(status.overlays.gaps); setOverlaps(status.overlays.overlaps); }
        }
      } });
    }).then(instance => {
      if (!instance) return;
      if (cancelled) { instance.dispose(); return; }
      mounted = instance; controller.current = instance;
      const options = sceneOptions.current;
      instance.setView(options.view); instance.setCompare(options.compare); instance.setOverlays({ gaps: options.gaps, overlaps: options.overlaps });
    }).catch(error => { if (!cancelled) setSceneStatus({ ready: false, xrSupported: false, inXR: false, error: error instanceof Error ? error.message : 'The 3D view could not start.' }); });
    return () => { cancelled = true; mounted?.dispose(); if (controller.current === mounted) controller.current = null; };
    // The scene owns its subscription; view controls update it without remounting.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, sceneRetry]);

  useEffect(() => { controller.current?.setView(view); }, [view]);
  useEffect(() => { controller.current?.setCompare(compare); }, [compare]);
  useEffect(() => { controller.current?.setOverlays({ gaps, overlaps }); }, [gaps, overlaps]);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (modal || target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); if (event.shiftKey) store.redo(); else store.undo(); }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') { event.preventDefault(); store.redo(); }
      if (event.key === 'Delete' || event.key === 'Backspace') { const selected = store.getState().selectionId; if (selected) { event.preventDefault(); store.removeItem(selected); } }
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [store, modal]);

  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  async function enterXR() {
    if (!controller.current || !sceneStatus.xrSupported || enteringXR) return;
    setEnteringXR(true);
    try { await controller.current.enterXR(); }
    catch (error) { notify(error instanceof Error ? error.message : 'VR could not start. Check your headset or emulator connection.'); }
    finally { setEnteringXR(false); }
  }

  function exportPlan() {
    const blob = new Blob([exportPlanSvg(layout)], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = `roomshift-layout-${layout.id.toLowerCase()}.svg`;
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify(`Layout ${layout.id} exported as a measured 2D plan.`);
  }

  function openItemMenu(id: string) { setMenuItemId(id); setModal('item'); }
  function copyLayout() { store.copyActiveToOther(); notify(`Layout ${layout.id} copied to Layout ${layout.id === 'A' ? 'B' : 'A'}. Undo restores the previous layout.`); }
  function retrySave() {
    const saved = store.save();
    setSaveStatus(saved ? 'saved' : 'error');
    notify(saved ? 'Both layouts saved on this device.' : 'Storage is unavailable or full. Export your plan to keep a copy.');
  }
  const xrTitle = sceneStatus.xrSupported ? 'Enter an immersive room view' : 'VR is available in Quest Browser or with a WebXR emulator.';

  return <div className="app-shell">
    <header className="topbar"><a className="brand" href="#" onClick={event => { event.preventDefault(); setModal('help'); }} aria-label="Roomshift help"><Icon name="room" size={40}/><span>Roomshift</span></a><span className="header-divider"/><button className="room-title" onClick={() => setModal('room')}>My living room<Icon name="chevron" size={17}/></button><button className={`save-status ${saveStatus === 'error' ? 'save-error' : ''}`} onClick={() => { const saved = store.save(); setSaveStatus(saved ? 'saved' : 'error'); notify(saved ? 'Both layouts saved on this device.' : 'Storage is unavailable or full. Export your plan to keep a copy.'); }} title="Save both layouts in this browser">{saveStatus === 'saving' ? 'Saving…' : saveStatus === 'saved' ? 'Saved on this device' : 'Changes not saved'}</button><div className="header-actions"><button className="button secondary export-button" onClick={exportPlan}><Icon name="export"/>Export 2D plan</button><button className="button primary vr-button" onClick={enterXR} disabled={!sceneStatus.ready || !sceneStatus.xrSupported || enteringXR || sceneStatus.inXR} title={xrTitle}><Icon name="headset"/>{enteringXR ? 'Entering VR…' : sceneStatus.inXR ? 'VR active' : 'Enter VR'}</button></div></header>
    <main className="editor-layout">
      <RoomRail layout={layout} selectionId={state.selectionId} store={store} onAdd={() => setModal('add')} onItemMenu={openItemMenu} notify={notify}/>
      <section className={`workspace ${view === 'life-size' ? 'life-size-workspace' : ''}`} aria-label="Room layout workspace">
        <div className="workspace-intro"><h1>Make room for a better layout.</h1><p>Rearrange your actual belongings before moving anything heavy.</p><div className="workspace-controls"><div className="segmented-control view-control" aria-label="View mode"><button className={view === 'tabletop' ? 'active' : ''} aria-pressed={view === 'tabletop'} onClick={() => setView('tabletop')}>Tabletop</button><button className={view === 'life-size' ? 'active' : ''} aria-pressed={view === 'life-size'} onClick={() => setView('life-size')}>Life-size</button></div><label className="checkbox-label"><input type="checkbox" checked={gaps} onChange={event => setGaps(event.target.checked)}/><span>Show gaps</span></label><label className="checkbox-label"><input type="checkbox" checked={overlaps} onChange={event => setOverlaps(event.target.checked)}/><span>Show overlaps</span></label></div></div>
        <div className="scene-area"><div className="scene-host" ref={sceneElement} aria-label="Interactive three-dimensional room"/>
          {!sceneStatus.ready ? <div className="scene-message" role="status">{sceneStatus.error ? <><strong>The 3D view could not start.</strong><p>{sceneStatus.error}</p><button className="button secondary" onClick={() => setSceneRetry(value => value + 1)}>Try again</button></> : <><span className="loading-room"><Icon name="room" size={32}/></span><span>Opening your room…</span></>}</div> : null}
          {view === 'life-size' && sceneStatus.ready ? <div className="view-note">Life-size preview · Drag to look around</div> : null}
          {compare ? <CompareSummary layouts={state.layouts} active={layout} onCopy={copyLayout}/> : null}
          {issues.length > 0 && overlaps && !compare ? <button className="scene-issue" title={issues.join('\n')} onClick={() => notify(issues.join(' '))}>{issues.length} {issues.length === 1 ? 'placement conflict' : 'placement conflicts'}</button> : null}
        </div>
        <div className="workspace-bottom"><div className="floating-toolbar"><div className="history-controls"><button onClick={() => store.undo()} disabled={!store.canUndo()} title="Undo (Ctrl+Z)"><Icon name="undo"/>Undo</button><button onClick={() => store.redo()} disabled={!store.canRedo()} title="Redo (Ctrl+Shift+Z)"><Icon name="redo"/>Redo</button></div><span className="toolbar-divider"/><div className="segmented-control layout-control" aria-label="Saved layouts">{state.layouts.map(saved => <button key={saved.id} className={state.activeId === saved.id ? 'active' : ''} aria-pressed={state.activeId === saved.id} onClick={() => store.setActive(saved.id)} title={saved.name}><span>Layout {saved.id}</span><small>{saved.name}</small></button>)}</div><button className={`compare-button ${compare ? 'is-active' : ''}`} aria-pressed={compare} onClick={() => setCompare(value => !value)}><Icon name="compare"/>Compare layouts</button></div><p className="workspace-hint"><span className="desktop-hint">Drag to move · Scroll to zoom · Rotate with the inspector</span><span className="mobile-hint">Touch to move · Use the fields for precise placement</span><button className="hint-help" aria-label="Interaction guide" onClick={() => setModal('help')}><Icon name="help" size={15}/></button></p>{saveStatus === 'error' ? <div className="mobile-save-error" role="alert"><span>Changes could not be saved.</span><button onClick={retrySave}>Retry save</button></div> : null}</div>
      </section>
      <Inspector item={item} layout={layout} store={store} onItemMenu={openItemMenu} notify={notify}/>
    </main>
    {toast ? <div className="toast" role="status"><Icon name="check" size={18}/><span>{toast}</span><button className="icon-button" aria-label="Dismiss message" onClick={() => setToast(null)}><Icon name="close" size={16}/></button></div> : null}
    {modal === 'add' ? <Modal title="Add a belonging" onClose={() => setModal(null)}><p className="modal-description">Choose a simple shape. Then enter the measurements of your own piece.</p><div className="add-type-list">{ITEM_TYPES.map(type => <button key={type.kind} className="add-type" onClick={() => { const id = store.addItem(type.kind); setModal(null); if (!id) notify('This room already has 12 items. Remove an item to add another.'); }} disabled={layout.items.length >= MAX_ITEMS}><span className="type-icon"><Icon name={type.kind} size={27}/></span><span><strong>{type.name}</strong><small>{type.detail}</small></span><Icon name="plus" size={18}/></button>)}</div><p className="field-note">One room, up to 12 belongings. Dimensions can be changed any time.</p></Modal> : null}
    {modal === 'room' ? <Modal title="Your room & layouts" onClose={() => setModal(null)}><p className="modal-description">A rectangular room using measurements you enter.</p><RoomFields layout={layout} store={store} notify={notify}/><div className="modal-section"><TextField label={`Layout ${layout.id} name`} value={layout.name} onCommit={name => store.renameLayout(name)}/><p className="field-note">Both layouts share the room dimensions. Each saves its own item arrangement.</p></div><div className="modal-section"><h3>Start with the same belongings</h3><p>Copy this arrangement to the other layout, then try a different placement.</p><button className="button secondary" onClick={copyLayout}><Icon name="compare" size={18}/>Copy Layout {layout.id} to {layout.id === 'A' ? 'B' : 'A'}</button></div><p className="field-note">Layouts and art photos are kept in this browser. Export a plan before clearing browser storage.</p></Modal> : null}
    {modal === 'item' && menuItem ? <Modal title={menuItem.name} onClose={() => setModal(null)}><p className="modal-description">{itemDimensions(menuItem)} · Measurements you entered</p><div className="item-actions"><button className="button secondary" onClick={() => { store.select(menuItem.id); setModal(null); }}>Edit this item</button><button className="button danger" onClick={() => { store.removeItem(menuItem.id); setModal(null); notify(`${menuItem.name} removed. Undo brings it back.`); }}><Icon name="trash" size={18}/>Remove item</button></div></Modal> : null}
    {modal === 'help' ? <Modal title="A little planning. A lighter move." onClose={() => setModal(null)} className="help-modal"><p className="modal-description">Roomshift helps you try arrangements with the belongings you already own.</p><ol className="help-steps"><li><strong>Measure once.</strong><span>Enter the room in metres and your furniture in centimetres. X and Z positions are measured from the centre of the room.</span></li><li><strong>Move before you lift.</strong><span>In tabletop view, drag a piece to move it. Drag an empty area to orbit, and scroll to zoom. Use the inspector to rotate or place it precisely.</span></li><li><strong>Check the fit.</strong><span>Show gaps for the selected item. Highlighted overlaps and negative wall clearances need another look. Life-size preview helps judge the arrangement.</span></li><li><strong>Try another arrangement.</strong><span>Switch between Layout A and B. Compare overlays the other layout as a ghost. Copy your current layout before changing it if you want matching belongings.</span></li><li><strong>Take a plan with you.</strong><span>Export a dimensioned SVG plan. Open it in a browser to print or save a PDF.</span></li></ol><div className="modal-section"><h3>Hands in VR</h3><p>Open Roomshift in Quest Browser or a WebXR hand emulator, then choose Enter VR. Pinch and move a belonging in the tabletop room. Use the in-room panel for view, layout, undo and export controls.</p><p className="field-note">Browser previews and simulated hands help test interaction. Real-headset comfort and performance still need testing. Photos are for art appearance; they do not supply measurements.</p></div></Modal> : null}
  </div>;
}
