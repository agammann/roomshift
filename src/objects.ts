import {
  BoxGeometry, CanvasTexture, CylinderGeometry, Group, LineBasicMaterial,
  LineSegments, Mesh, MeshStandardMaterial, Object3D, PlaneGeometry,
  Sprite, SpriteMaterial, SRGBColorSpace, BufferGeometry, Float32BufferAttribute,
  type Material, type Texture,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { Furniture, Layout } from './model';

const material = (color: string, roughness = .8) => new MeshStandardMaterial({ color, roughness, metalness: 0 });

function block(group: Group, size: [number, number, number], position: [number, number, number], mat: Material, round = 0) {
  const [w, h, d] = size;
  const mesh = new Mesh(round > 0
    ? new RoundedBoxGeometry(w, h, d, 3, Math.min(round, w / 4, h / 4, d / 4))
    : new BoxGeometry(w, h, d), mat);
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function artTexture(item: Furniture): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 768;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#f6f0df'; ctx.fillRect(0, 0, 768, 512);
  ctx.fillStyle = '#d9a47d'; ctx.beginPath(); ctx.arc(268, 214, 155, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#556d4d'; ctx.beginPath(); ctx.arc(504, 361, 153, Math.PI, 0); ctx.lineTo(657, 478); ctx.lineTo(351, 478); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#344c3d'; ctx.beginPath(); ctx.arc(569, 132, 59, 0, Math.PI * 2); ctx.fill();
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  if (item.photo) {
    const img = new Image();
    let disposed = false;
    texture.addEventListener('dispose', () => { disposed = true; img.onload = null; });
    img.onload = () => {
      if (disposed) return;
      ctx.fillStyle = '#f6f0df'; ctx.fillRect(0, 0, 768, 512);
      const scale = Math.min(768 / img.width, 512 / img.height);
      const w = img.width * scale, h = img.height * scale;
      ctx.drawImage(img, (768 - w) / 2, (512 - h) / 2, w, h);
      texture.needsUpdate = true;
    };
    img.src = item.photo;
  }
  return texture;
}

/** Every generated mesh stays inside the entered furniture dimensions. */
export function buildFurniture(item: Furniture): Group {
  const group = new Group();
  group.name = item.name;
  group.userData.itemId = item.id;
  const w = item.width, d = item.depth, h = item.height;
  const surface = material(item.color);
  const dark = material('#61735d');
  const wood = material('#b58c62', .66);
  const lightWood = material('#d0ab80', .72);

  if (item.kind === 'sofa' || item.kind === 'chair') {
    const base = h * .22, feet = h * .12;
    block(group, [w * .96, base, d * .94], [0, feet + base / 2, 0], surface, .04);
    const arm = Math.min(w * .13, .15);
    block(group, [arm, h * .69, d * .93], [-w / 2 + arm / 2, h * .47, 0], surface, .04);
    block(group, [arm, h * .69, d * .93], [w / 2 - arm / 2, h * .47, 0], surface, .04);
    const backDepth = d * .2;
    block(group, [w * .98, h * .82, backDepth], [0, h * .59, -d / 2 + backDepth / 2], surface, .04);
    const count = item.kind === 'sofa' ? 2 : 1;
    const innerW = w - arm * 2 - w * .006;
    for (let i = 0; i < count; i++) {
      const cushionW = innerW / count;
      const x = -innerW / 2 + cushionW * (i + .5);
      block(group, [cushionW * .98, h * .19, d * .66], [x, h * .44, d * .06], surface, .045);
      block(group, [cushionW * .98, h * .41, d * .18], [x, h * .74, -d * .29], surface, .035);
    }
    for (const x of [-w * .38, w * .38]) for (const z of [-d * .35, d * .35]) {
      block(group, [Math.min(.05, w * .06), feet, Math.min(.05, d * .08)], [x, feet / 2, z], wood, .006);
    }
  } else if (item.kind === 'table') {
    const top = Math.min(h * .15, .055), leg = Math.min(w * .055, d * .1, .05);
    if (w <= .65 && d <= .65) {
      const mesh = new Mesh(new CylinderGeometry(w / 2, w / 2, top, 48), lightWood);
      mesh.scale.z = d / w;
      mesh.position.y = h - top / 2; mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh);
      for (let i = 0; i < 3; i++) {
        const angle = Math.PI * 2 * i / 3;
        block(group, [leg, h - top, leg], [Math.cos(angle) * w * .27, (h - top) / 2, Math.sin(angle) * d * .27], wood, .006);
      }
    } else {
      block(group, [w, top, d], [0, h - top / 2, 0], lightWood, .015);
      for (const x of [-w * .39, w * .39]) for (const z of [-d * .35, d * .35]) {
        block(group, [leg, h - top, leg], [x, (h - top) / 2, z], wood, .006);
      }
    }
  } else if (item.kind === 'shelf') {
    const panel = Math.min(w * .05, d * .14, h * .04, .04);
    block(group, [w, h, panel], [0, h / 2, -d / 2 + panel / 2], dark);
    for (const x of [-w / 2 + panel / 2, w / 2 - panel / 2]) block(group, [panel, h, d], [x, h / 2, 0], surface);
    for (let i = 0; i <= 4; i++) block(group, [w, panel, d], [0, panel / 2 + (h - panel) * i / 4, 0], surface, .006);
    const bookColors = ['#e6d7bd', '#b49a75', '#c6b495', '#7f8d75', '#d6c7ae', '#b97354'];
    for (let row = 0; row < 4; row++) for (let i = 0; i < 5; i++) {
      const bw = w * .075, bh = (h / 4) * (.63 + (i % 3) * .06);
      const bx = -w * .36 + i * w * .1 + (row % 2) * w * .12;
      const by = panel + (h - panel) * row / 4 + bh / 2;
      block(group, [bw, bh, d * .64], [bx, by, d * .06], material(bookColors[(i + row) % bookColors.length]), .003);
    }
  } else {
    const border = Math.min(w, h) * .065;
    block(group, [w, h, d * .12], [0, h / 2, -d * .44], wood);
    for (const x of [-w / 2 + border / 2, w / 2 - border / 2]) block(group, [border, h, d], [x, h / 2, 0], wood, .002);
    for (const y of [border / 2, h - border / 2]) block(group, [w - border * 2, border, d], [0, y, 0], wood, .002);
    const mat = new MeshStandardMaterial({ map: artTexture(item), roughness: .9 });
    const plane = new Mesh(new PlaneGeometry(w - border * 2, h - border * 2), mat);
    plane.position.set(0, h / 2, d * .49); group.add(plane);
  }
  // Materials unused for this furniture type are released here.
  const used = new Set<Material>();
  group.traverse((node) => { if (node instanceof Mesh) for (const mat of Array.isArray(node.material) ? node.material : [node.material]) used.add(mat); });
  for (const mat of [surface, dark, wood, lightWood]) if (!used.has(mat)) mat.dispose();
  return group;
}

export function labelSprite(text: string, color = '#58685f', background = 'rgba(250,250,246,.92)'): Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 96;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = background; ctx.beginPath(); ctx.roundRect(0, 0, 256, 96, 14); ctx.fill();
  ctx.font = '500 42px Arial, sans-serif'; ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 128, 50);
  const texture = new CanvasTexture(canvas); texture.colorSpace = SRGBColorSpace;
  const sprite = new Sprite(new SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
  sprite.scale.set(1.08, .405, 1); sprite.renderOrder = 4;
  return sprite;
}

export function buildRoomScene(layout: Layout, options: { includeFurniture?: boolean } = {}): Group {
  const room = new Group(); room.name = 'Measured room';
  const { width: w, depth: d, height: h } = layout.room;
  const floor = material('#edeee7', .96), wall = material('#faf8f0', .94), trim = material('#deddd5');
  block(room, [w + .15, .12, d + .15], [0, -.065, 0], trim);
  const floorMesh = block(room, [w, .018, d], [0, -.002, 0], floor);
  floorMesh.castShadow = false;
  // Cutaway front and right sides leave the measured room visible in tabletop view.
  block(room, [w + .12, h, .075], [0, h / 2, -d / 2 - .0375], wall).castShadow = false;
  block(room, [.075, h, d + .12], [-w / 2 - .0375, h / 2, 0], wall).castShadow = false;
  block(room, [w, .055, .018], [0, .0275, -d / 2 + .009], trim);
  block(room, [.018, .055, d], [-w / 2 + .009, .0275, 0], trim);

  const points: number[] = [];
  for (let x = -w / 2; x <= w / 2 + .001; x += .25) points.push(x, .008, -d / 2, x, .008, d / 2);
  for (let z = -d / 2; z <= d / 2 + .001; z += .25) points.push(-w / 2, .008, z, w / 2, .008, z);
  const geometry = new BufferGeometry(); geometry.setAttribute('position', new Float32BufferAttribute(points, 3));
  const grid = new LineSegments(geometry, new LineBasicMaterial({ color: '#c9cfc2', transparent: true, opacity: .34 })); room.add(grid);
  const rulerPoints: number[] = [];
  const rulerZ = d / 2 + .2;
  rulerPoints.push(-w / 2, .025, rulerZ, w / 2, .025, rulerZ);
  for (let x = -w / 2; x <= w / 2 + .001; x += .25) rulerPoints.push(x, .025, rulerZ - .04, x, .025, rulerZ + .04);
  const rulerX = w / 2 + .2;
  rulerPoints.push(rulerX, .025, -d / 2, rulerX, .025, d / 2);
  for (let z = -d / 2; z <= d / 2 + .001; z += .25) rulerPoints.push(rulerX - .04, .025, z, rulerX + .04, .025, z);
  const rulerGeometry = new BufferGeometry(); rulerGeometry.setAttribute('position', new Float32BufferAttribute(rulerPoints, 3));
  room.add(new LineSegments(rulerGeometry, new LineBasicMaterial({ color: '#a0aaa0' })));
  const widthLabel = labelSprite(`${w.toFixed(1)} m`); widthLabel.position.set(0, .1, rulerZ + .2); room.add(widthLabel);
  const depthLabel = labelSprite(`${d.toFixed(1)} m`); depthLabel.position.set(rulerX + .3, .1, 0); room.add(depthLabel);
  if (options.includeFurniture !== false) for (const item of layout.items) {
    const object = buildFurniture(item); object.position.set(item.x, item.y, item.z); object.rotation.y = item.rotation; room.add(object);
  }
  return room;
}

export function disposeObject(object: Object3D): void {
  const geometries = new Set<BufferGeometry>(), materials = new Set<Material>(), textures = new Set<Texture>();
  object.traverse((node) => {
    const mesh = node as Mesh;
    if (mesh.geometry) geometries.add(mesh.geometry);
    if (mesh.material) for (const mat of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      materials.add(mat);
      const textured = mat as MeshStandardMaterial;
      if (textured.map) textures.add(textured.map);
    }
  });
  for (const value of textures) value.dispose();
  for (const value of materials) value.dispose();
  for (const value of geometries) value.dispose();
  object.removeFromParent();
}
