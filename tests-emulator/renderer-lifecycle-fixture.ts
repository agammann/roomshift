import { ArrayCamera, CanvasTexture, DepthTexture, Mesh, MeshBasicMaterial, OrthographicCamera, PlaneGeometry, Scene, Vector4, WebGLRenderer } from 'three';
import { WebGLMultiviewRenderTarget } from 'three/src/renderers/WebGLMultiviewRenderTarget.js';

function rendererFixture() {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64; document.body.appendChild(canvas);
  const gl = canvas.getContext('webgl2', { antialias: false }); if (!gl) throw Error('WebGL2 is unavailable');
  const ovr = gl.getExtension('OVR_multiview2'); if (!ovr) throw Error('OVR_multiview2 is unavailable');
  const getExtension = gl.getExtension.bind(gl);
  // @ts-expect-error Test-only OVR adaptation does not emulate Oculus hardware.
  gl.getExtension = name => name === 'OCULUS_multiview' ? ovr : getExtension(name);
  // @ts-expect-error multiviewStereo is provided by the intentional fork.
  const renderer = new WebGLRenderer({ canvas, context: gl, multiviewStereo: true });
  renderer.setSize(64, 64, false);
  const target = new WebGLMultiviewRenderTarget(64, 64, 2, { samples: 0, depthTexture: new DepthTexture(64, 64) });
  renderer.setRenderTarget(target);
  const eye = () => {
    const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
    camera.position.z = 2; camera.viewport = new Vector4(0, 0, 64, 64); camera.updateMatrixWorld(); return camera;
  };
  const camera = new ArrayCamera([eye(), eye()]); camera.updateMatrixWorld();
  renderer.xr.enabled = true;
  // @ts-expect-error This flag is provided by the intentional fork.
  renderer.xr.isMultiview = true;
  const sample = () => {
    const color = renderer.properties.get(target.texture).__webglTexture;
    renderer.setRenderTarget(null);
    const fb = gl.createFramebuffer(); if (!fb) throw Error('Unable to create test framebuffer');
    renderer.state.bindFramebuffer(gl.FRAMEBUFFER, fb);
    const result = [];
    for (let i = 0; i < 2; i++) {
      gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, color, 0, i);
      const pixel = new Uint8Array(4); gl.readPixels(32, 32, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel); result.push([...pixel]);
    }
    renderer.state.bindFramebuffer(gl.FRAMEBUFFER, null); gl.deleteFramebuffer(fb); renderer.setRenderTarget(target);
    return result;
  };
  return { renderer, gl, target, camera, canvas, sample };
}

export function checkSharedTextureRenderers() {
  const image = document.createElement('canvas'); image.width = image.height = 2;
  const ctx = image.getContext('2d'); if (!ctx) throw Error('2D canvas is unavailable');
  ctx.fillStyle = '#ff0000'; ctx.fillRect(0, 0, 2, 2);
  const texture = new CanvasTexture(image);
  const fixtures = [rendererFixture(), rendererFixture()];
  const scenes = fixtures.map(() => { const scene = new Scene(); scene.add(new Mesh(new PlaneGeometry(2, 2), new MeshBasicMaterial({ map: texture }))); return scene; });
  const draw = () => fixtures.forEach((f, index) => { f.renderer.render(scenes[index], f.camera); f.renderer.render(scenes[index], f.camera); });
  draw();
  const before = fixtures.map(f => f.sample());
  ctx.fillStyle = '#00ff00'; ctx.fillRect(0, 0, 2, 2); texture.needsUpdate = true;
  draw();
  const after = fixtures.map(f => f.sample());
  const versions = fixtures.map(f => f.renderer.properties.get(texture).__version);
  const errors = fixtures.map(f => f.gl.getError());
  fixtures.forEach(f => { f.renderer.dispose(); f.target.dispose(); f.canvas.remove(); });
  return { before, after, versions, expectedVersion: texture.version, errors };
}

export function checkNestedRenderRecovery() {
  const f = rendererFixture();
  const makeTexture = (color: string) => {
    const image = document.createElement('canvas'); image.width = image.height = 2;
    const ctx = image.getContext('2d'); if (!ctx) throw Error('2D canvas is unavailable');
    ctx.fillStyle = color; ctx.fillRect(0, 0, 2, 2); return new CanvasTexture(image);
  };
  const nestedTexture = makeTexture('#0000ff');
  const outerTexture = makeTexture('#ff0000');
  const nested = new Scene();
  const first = new Mesh(new PlaneGeometry(2, 2), new MeshBasicMaterial({ map: nestedTexture })); first.renderOrder = 0;
  const second = new Mesh(new PlaneGeometry(2, 2), new MeshBasicMaterial()); second.renderOrder = 1;
  second.onBeforeRender = () => { throw Error('synthetic nested render failure'); };
  nested.add(first, second);
  const outer = new Scene();
  const plane = new Mesh(new PlaneGeometry(2, 2), new MeshBasicMaterial({ map: outerTexture }));
  let caught = false; let attempted = false;
  plane.onBeforeRender = () => {
    if (!attempted) {
      attempted = true;
      try { f.renderer.render(nested, f.camera); } catch (error) { caught = String(error).includes('synthetic nested render failure'); }
    }
  };
  outer.add(plane);
  f.renderer.render(outer, f.camera); f.renderer.render(outer, f.camera);
  const pixels = f.sample();
  const innerVersion = f.renderer.properties.get(nestedTexture).__version ?? null;
  const outerVersion = f.renderer.properties.get(outerTexture).__version ?? null;
  const glError = f.gl.getError();
  f.renderer.dispose(); f.target.dispose(); f.canvas.remove();
  return { caught, pixels, innerVersion, outerVersion, expectedVersion: outerTexture.version, glError };
}
