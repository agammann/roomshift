import { ACESFilmicToneMapping, HalfFloatType, NoToneMapping, AmbientLight, ArrayCamera, BoxGeometry, CanvasTexture, CubeTexture, DepthTexture, DirectionalLight, HemisphereLight, LightProbe, Mesh, MeshBasicMaterial, MeshPhysicalMaterial, MeshStandardMaterial, OrthographicCamera, PerspectiveCamera, PlaneGeometry, PointLight, RectAreaLight, Scene, SpotLight, UniformsLib, Vector4, WebGLRenderer, WebGLRenderTarget } from 'three';
import { WebGLMultiviewRenderTarget } from 'three/src/renderers/WebGLMultiviewRenderTarget.js';

// This exercises the renderer's multiview path with the browser's real OVR
// extension. The test-only name adapter is not an Oculus headset emulator.
export function runMultiviewFixture(external: boolean, autoDepth: boolean) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  document.body.appendChild(canvas);
  const gl = canvas.getContext('webgl2', { antialias: false });
  if (!gl) throw Error('WebGL2 is unavailable');
  const ovr = gl.getExtension('OVR_multiview2');
  if (!ovr) throw Error('OVR_multiview2 is unavailable');
  const originalGetExtension = gl.getExtension.bind(gl);
  // @ts-expect-error This extension-name adaptation is confined to this test.
  gl.getExtension = name => name === 'OCULUS_multiview' ? ovr : originalGetExtension(name);

  // @ts-expect-error multiviewStereo is provided by the intentional fork.
  const renderer = new WebGLRenderer({ canvas, context: gl, multiviewStereo: true });
  renderer.setSize(64, 64, false);
  const initialError = gl.getError();
  const target = new WebGLMultiviewRenderTarget(64, 64, 2, { samples: 0, depthTexture: new DepthTexture(64, 64) });
  if (autoDepth) target.resolveDepthBuffer = false;
  let color: WebGLTexture | undefined;
  let depth: WebGLTexture | undefined;
  if (external) {
    color = gl.createTexture() ?? undefined;
    depth = gl.createTexture() ?? undefined;
    if (!color || !depth) throw Error('Unable to create external XR fixture textures');
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, color);
    gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, gl.RGBA8, 64, 64, 2);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, depth);
    gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, gl.DEPTH_COMPONENT24, 64, 64, 2);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, null);
    renderer.setRenderTargetTextures(target, color, depth);
  }
  renderer.setRenderTarget(target);
  const setupError = gl.getError();
  const framebuffer = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  color ??= renderer.properties.get(target.texture).__webglTexture;
  if (!color) throw Error('Renderer did not create a color texture');
  const image = document.createElement('canvas');
  image.width = image.height = 2;
  const ctx = image.getContext('2d');
  if (!ctx) throw Error('2D canvas is unavailable');
  ctx.fillStyle = '#ff0000'; ctx.fillRect(0, 0, 2, 2);
  const texture = new CanvasTexture(image);
  const scene = new Scene();
  scene.add(new AmbientLight(0xffffff, Math.PI));
  scene.add(new Mesh(new PlaneGeometry(2, 2), new MeshStandardMaterial({ map: texture, roughness: 0.8, metalness: 0 })));
  const eye = () => {
    const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
    camera.position.z = 2;
    camera.viewport = new Vector4(0, 0, 64, 64);
    camera.updateMatrixWorld();
    return camera;
  };
  const camera = new ArrayCamera([eye(), eye()]);
  camera.updateMatrixWorld();
  renderer.xr.enabled = true;
  // @ts-expect-error This renderer flag is provided by the intentional fork.
  renderer.xr.isMultiview = true;
  const sampleLayers = () => {
    renderer.setRenderTarget(null);
    const fb = gl.createFramebuffer();
    if (!fb) throw Error('Unable to create test framebuffer');
    renderer.state.bindFramebuffer(gl.FRAMEBUFFER, fb);
    const pixels = [];
    for (let i = 0; i < 2; i++) {
      gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, color!, 0, i);
      const pixel = new Uint8Array(4);
      gl.readPixels(32, 32, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      pixels.push([...pixel]);
    }
    renderer.state.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(fb);
    renderer.setRenderTarget(target);
    return pixels;
  };
  renderer.render(scene, camera); renderer.render(scene, camera);
  const before = sampleLayers();
  ctx.fillStyle = '#00ff00'; ctx.fillRect(0, 0, 2, 2); texture.needsUpdate = true;
  renderer.render(scene, camera); renderer.render(scene, camera);
  const after = sampleLayers();
  const renderError = gl.getError();
  renderer.dispose();
  target.dispose();
  canvas.remove();
  return { initialError, setupError, framebuffer, framebufferComplete: gl.FRAMEBUFFER_COMPLETE, before, after, renderError };
}

export async function runContextRecovery() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  document.body.appendChild(canvas);
  const renderer = new WebGLRenderer({ canvas, preserveDrawingBuffer: true });
  renderer.setSize(64, 64, false);
  const gl = renderer.getContext();
  const extension = gl.getExtension('WEBGL_lose_context');
  if (!extension) throw Error('WEBGL_lose_context is unavailable');
  const image = document.createElement('canvas');
  image.width = image.height = 2;
  const ctx = image.getContext('2d');
  if (!ctx) throw Error('2D canvas is unavailable');
  ctx.fillStyle = '#ff0000'; ctx.fillRect(0, 0, 2, 2);
  const texture = new CanvasTexture(image);
  const scene = new Scene();
  scene.add(new AmbientLight(0xffffff, Math.PI));
  scene.add(new Mesh(new PlaneGeometry(2, 2), new MeshStandardMaterial({ map: texture, roughness: 0.8, metalness: 0 })));
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
  camera.position.z = 2;
  const sample = () => {
    const pixel = new Uint8Array(4);
    gl.readPixels(32, 32, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    return [...pixel];
  };
  renderer.render(scene, camera);
  const before = sample();
  const lost = new Promise<boolean>(resolve => canvas.addEventListener('webglcontextlost', () => resolve(true), { once: true }));
  extension.loseContext();
  const lostObserved = await Promise.race([lost, new Promise<boolean>(resolve => setTimeout(() => resolve(false), 5000))]);
  if (!lostObserved) throw Error('The context loss event was not observed');
  // The loss-event default action must finish before requesting restoration.
  await new Promise(resolve => setTimeout(resolve, 1000));
  const restored = new Promise<boolean>(resolve => canvas.addEventListener('webglcontextrestored', () => resolve(true), { once: true }));
  extension.restoreContext();
  const restoredObserved = await Promise.race([restored, new Promise<boolean>(resolve => setTimeout(() => resolve(false), 15000))]);
  if (!restoredObserved) throw Error('The context restoration event was not observed');
  ctx.fillStyle = '#00ff00'; ctx.fillRect(0, 0, 2, 2); texture.needsUpdate = true;
  renderer.render(scene, camera);
  const after = sample();
  const glError = gl.getError();
  renderer.dispose();
  canvas.remove();
  return { before, after, glError };
}

export async function compareStereoLighting(kind: string) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64; document.body.appendChild(canvas);
  const gl = canvas.getContext('webgl2', { antialias: false });
  if (!gl) throw Error('WebGL2 is unavailable');
  const ovr = gl.getExtension('OVR_multiview2');
  if (!ovr) throw Error('OVR_multiview2 is unavailable');
  const original = gl.getExtension.bind(gl);
  // @ts-expect-error This extension-name adaptation is confined to this test.
  gl.getExtension = name => name === 'OCULUS_multiview' ? ovr : original(name);
  // @ts-expect-error multiviewStereo is provided by the intentional fork.
  const renderer = new WebGLRenderer({ canvas, context: gl, multiviewStereo: true });
  renderer.setSize(64, 64, false);
  const target = new WebGLMultiviewRenderTarget(64, 64, 2, { samples: 0, depthTexture: new DepthTexture(64, 64) });
  const scene = new Scene();
  let material;
  if (kind === 'envmap') {
    const faces = Array.from({ length: 6 }, () => {
      const image = document.createElement('canvas'); image.width = image.height = 64;
      const ctx = image.getContext('2d'); if (!ctx) throw Error('2D canvas is unavailable');
      const gradient = ctx.createLinearGradient(0, 0, 64, 0); gradient.addColorStop(0, '#ff0000'); gradient.addColorStop(1, '#00ff00');
      ctx.fillStyle = gradient; ctx.fillRect(0, 0, 64, 64); return image;
    });
    const envMap = new CubeTexture(faces); envMap.needsUpdate = true;
    material = new MeshBasicMaterial({ color: 0xffffff, envMap });
  } else material = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, metalness: 0 });
  const mesh = new Mesh(new PlaneGeometry(10, 10), material); mesh.frustumCulled = false; scene.add(mesh);
  if (kind === 'shadow') {
    renderer.shadowMap.enabled = true; mesh.receiveShadow = true;
    const occluder = new Mesh(new BoxGeometry(0.35, 0.35, 0.35), new MeshStandardMaterial({ color: 0x888888 }));
    occluder.position.set(0, 0, 0.5); occluder.castShadow = true; scene.add(occluder);
    const light = new DirectionalLight(0xffffff, 2); light.position.set(2, 2, 3); light.castShadow = true;
    light.shadow.mapSize.set(256, 256); scene.add(light); scene.add(new AmbientLight(0xffffff, 0.2));
  }
  if (kind === 'room') {
    scene.add(new HemisphereLight(0xaacfff, 0x663311, 0.8));
    const light = new DirectionalLight(0xffffff, 1.5); light.position.set(2, 2, 3); scene.add(light);
  }
  if (kind === 'point') { const light = new PointLight(0xffffff, 15); light.position.set(1, 1, 3); scene.add(light); }
  if (kind === 'spot') { const light = new SpotLight(0xffffff, 25, 0, 0.8, 0.1); light.position.set(1, 1, 3); scene.add(light); }
  if (kind === 'probe') {
    const light = new LightProbe();
    light.sh.coefficients[0].set(0.5, 0.4, 0.3); light.sh.coefficients[1].set(0.15, 0.12, 0.09); light.sh.coefficients[3].set(-0.2, 0.1, 0.15);
    scene.add(light);
  }
  if (kind === 'area') {
    const { RectAreaLightTexturesLib } = await import('three/addons/lights/RectAreaLightTexturesLib.js');
    RectAreaLightTexturesLib.init();
    for (const key of ['LTC_FLOAT_1', 'LTC_FLOAT_2', 'LTC_HALF_1', 'LTC_HALF_2']) (UniformsLib as any)[key] = (RectAreaLightTexturesLib as any)[key];
    const light = new RectAreaLight(0xffffff, 10, 2, 1); light.position.set(1, 1, 3); light.lookAt(0, 0, 0); scene.add(light);
  }
  const eye = (x: number, yaw: number) => {
    const camera = kind === 'envmap' ? new PerspectiveCamera(60, 1, 0.1, 10) : new OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
    camera.position.set(x, 0, 2); camera.rotation.y = yaw; camera.viewport = new Vector4(0, 0, 64, 64); camera.updateMatrixWorld(); return camera;
  };
  const separation = kind === 'envmap' ? 0.6 : 0.03;
  const eyes = [eye(-separation, -0.12), eye(separation, 0.12)];
  const camera = new ArrayCamera(eyes); camera.position.set(0, 0, 2); camera.updateMatrixWorld();
  renderer.xr.enabled = true;
  // @ts-expect-error This renderer flag is provided by the intentional fork.
  renderer.xr.isMultiview = true;
  renderer.setRenderTarget(target); renderer.render(scene, camera); renderer.render(scene, camera);
  const color = renderer.properties.get(target.texture).__webglTexture;
  renderer.setRenderTarget(null);
  const fb = gl.createFramebuffer(); if (!fb) throw Error('Unable to create test framebuffer');
  renderer.state.bindFramebuffer(gl.FRAMEBUFFER, fb);
  const coords = kind === 'shadow' ? [[16, 16], [16, 32], [16, 48], [32, 16], [32, 32], [32, 48], [48, 16], [48, 32], [48, 48]] : [[32, 32]];
  const sample = () => coords.flatMap(([x, y]) => { const pixel = new Uint8Array(4); gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel); return [...pixel]; });
  const actual = [];
  for (let i = 0; i < 2; i++) { gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, color, 0, i); actual.push(sample()); }
  renderer.state.bindFramebuffer(gl.FRAMEBUFFER, null); gl.deleteFramebuffer(fb);
  // @ts-expect-error This renderer flag is provided by the intentional fork.
  renderer.xr.isMultiview = false;
  const mono = new WebGLRenderTarget(64, 64);
  const reference = [];
  for (const eyeCamera of eyes) { renderer.setRenderTarget(mono); renderer.render(scene, eyeCamera); reference.push(sample()); }
  const glError = gl.getError(); renderer.dispose(); target.dispose(); mono.dispose(); canvas.remove();
  return { actual, reference, glError };
}

export function checkMultiviewMsaaTarget(normalRtt: boolean) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64; document.body.appendChild(canvas);
  const gl = canvas.getContext('webgl2', { antialias: false }); if (!gl) throw Error('WebGL2 is unavailable');
  const ovr = gl.getExtension('OVR_multiview2'); if (!ovr) throw Error('OVR_multiview2 is unavailable');
  let multisampleCalls = 0;
  // OVR in Chromium does not implement Oculus multisampling. The stub checks
  // correct dispatch and framebuffer selection only, not antialiasing quality.
  const oculus = { MAX_VIEWS_OVR: ovr.MAX_VIEWS_OVR,
    framebufferTextureMultiviewOVR: ovr.framebufferTextureMultiviewOVR.bind(ovr),
    framebufferTextureMultisampleMultiviewOVR: (target: number, attachment: number, texture: WebGLTexture, level: number, _samples: number, base: number, views: number) => {
      multisampleCalls++; ovr.framebufferTextureMultiviewOVR(target, attachment, texture, level, base, views);
    } };
  const rtt = { renderbufferStorageMultisampleEXT: gl.renderbufferStorageMultisample.bind(gl),
    framebufferTexture2DMultisampleEXT: (target: number, attachment: number, textarget: number, texture: WebGLTexture, level: number) => gl.framebufferTexture2D(target, attachment, textarget, texture, level) };
  const original = gl.getExtension.bind(gl);
  // @ts-expect-error Extension-name adaptation is confined to this test.
  gl.getExtension = name => name === 'OCULUS_multiview' ? oculus : name === 'WEBGL_multisampled_render_to_texture' && normalRtt ? rtt : original(name);
  // @ts-expect-error multiviewStereo is provided by the intentional fork.
  const renderer = new WebGLRenderer({ canvas, context: gl, multiviewStereo: true });
  const target = new WebGLMultiviewRenderTarget(64, 64, 2, { samples: 4, depthTexture: new DepthTexture(64, 64) });
  const color = gl.createTexture(); const depth = gl.createTexture();
  if (!color || !depth) throw Error('Unable to create XR fixture textures');
  gl.bindTexture(gl.TEXTURE_2D_ARRAY, color); gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, gl.RGBA8, 64, 64, 2);
  gl.bindTexture(gl.TEXTURE_2D_ARRAY, depth); gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, gl.DEPTH_COMPONENT24, 64, 64, 2); gl.bindTexture(gl.TEXTURE_2D_ARRAY, null);
  renderer.setRenderTargetTextures(target, color, depth);
  renderer.setRenderTarget(target);
  const props = renderer.properties.get(target);
  const bound = gl.getParameter(gl.FRAMEBUFFER_BINDING);
  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  const ordinary = new WebGLRenderTarget(64, 64, { depthTexture: new DepthTexture(64, 64) });
  renderer.setRenderTargetTextures(ordinary, gl.createTexture(), gl.createTexture());
  const result = { multisampleCalls, boundMultiview: bound === props.__webglFramebuffer,
    boundOrdinaryMsaa: !!props.__webglMultisampledFramebuffer && bound === props.__webglMultisampledFramebuffer,
    ordinaryDisablesRtt: renderer.properties.get(ordinary).__useRenderToTexture === false,
    status, complete: gl.FRAMEBUFFER_COMPLETE, glError: gl.getError() };
  renderer.dispose(); target.dispose(); ordinary.dispose(); canvas.remove();
  return result;
}

export async function checkXrMsaaNegotiation(supportsMsaa: boolean) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64; document.body.appendChild(canvas);
  const gl = canvas.getContext('webgl2', { antialias: true }); if (!gl) throw Error('WebGL2 is unavailable');
  const ovr = gl.getExtension('OVR_multiview2'); if (!ovr) throw Error('OVR_multiview2 is unavailable');
  const oculus: any = { MAX_VIEWS_OVR: ovr.MAX_VIEWS_OVR, framebufferTextureMultiviewOVR: ovr.framebufferTextureMultiviewOVR.bind(ovr) };
  if (supportsMsaa) oculus.framebufferTextureMultisampleMultiviewOVR = (target: number, attachment: number, texture: WebGLTexture, level: number, _samples: number, base: number, views: number) => ovr.framebufferTextureMultiviewOVR(target, attachment, texture, level, base, views);
  const getExtension = gl.getExtension.bind(gl);
  // @ts-expect-error Extension-name adaptation is confined to this test.
  gl.getExtension = name => name === 'OCULUS_multiview' ? oculus : getExtension(name);
  const getAttributes = gl.getContextAttributes.bind(gl);
  // @ts-expect-error This fixture exposes XR-compatible attributes without a headset.
  gl.getContextAttributes = () => ({ ...getAttributes(), antialias: true, xrCompatible: true });
  const original = Object.getOwnPropertyDescriptor(window, 'XRWebGLBinding');
  const observed: any[] = [];
  class FakeBinding { createProjectionLayer(options: unknown) { observed.push(options); return { textureWidth: 64, textureHeight: 64, ignoreDepthValues: false, fixedFoveation: 0 }; } }
  class FakeSession extends EventTarget {
    updateRenderState(_state: unknown) {}
    async requestReferenceSpace() { return {}; }
    requestAnimationFrame() { return 1; }
    cancelAnimationFrame() {}
  }
  Object.defineProperty(window, 'XRWebGLBinding', { value: FakeBinding, configurable: true, writable: true });
  try {
    // @ts-expect-error multiviewStereo is provided by the intentional fork.
    const renderer = new WebGLRenderer({ canvas, context: gl, multiviewStereo: true });
    await renderer.xr.setSession(new FakeSession() as any);
    const target = renderer.xr.getRenderTarget();
    const result = { samples: target?.samples, isMultiview: (renderer.xr as any).isMultiview,
      textureType: observed[0]?.textureType, glError: gl.getError() };
    renderer.dispose(); canvas.remove(); return result;
  } finally {
    if (original) Object.defineProperty(window, 'XRWebGLBinding', original);
    else delete (window as any).XRWebGLBinding;
  }
}

export function checkUnsupportedMultiviewMsaa() {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64; document.body.appendChild(canvas);
  const gl = canvas.getContext('webgl2'); if (!gl) throw Error('WebGL2 is unavailable');
  const ovr = gl.getExtension('OVR_multiview2'); if (!ovr) throw Error('OVR_multiview2 is unavailable');
  const original = gl.getExtension.bind(gl);
  // @ts-expect-error Extension-name adaptation is confined to this test.
  gl.getExtension = name => name === 'OCULUS_multiview' ? ovr : original(name);
  // @ts-expect-error multiviewStereo is provided by the intentional fork.
  const renderer = new WebGLRenderer({ canvas, context: gl, multiviewStereo: true });
  const target = new WebGLMultiviewRenderTarget(64, 64, 2, { samples: 4, depthTexture: new DepthTexture(64, 64) });
  let message = '';
  try { renderer.setRenderTarget(target); } catch (error) { message = String(error); }
  renderer.dispose(); canvas.remove();
  return message;
}

export function checkMultiviewOwnership(autoDepth: boolean, disposeRenderer: boolean) {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2'); if (!gl) throw Error('WebGL2 unavailable');
  const ovr = gl.getExtension('OVR_multiview2'); if (!ovr) throw Error('OVR_multiview2 unavailable');
  const getExtension = gl.getExtension.bind(gl);
  // @ts-expect-error Test-only adapter for the real Chromium multiview extension.
  gl.getExtension = name => name === 'OCULUS_multiview' ? ovr : getExtension(name);
  // @ts-expect-error multiviewStereo is provided by the intentional fork.
  const renderer = new WebGLRenderer({ canvas, context: gl, multiviewStereo: true });
  const created: WebGLTexture[] = []; const deleted: (WebGLTexture | null)[] = [];
  const make = gl.createTexture.bind(gl); const remove = gl.deleteTexture.bind(gl);
  gl.createTexture = () => { const t = make(); if (t) created.push(t); return t; };
  gl.deleteTexture = t => { deleted.push(t); remove(t); };
  const external: WebGLTexture[] = [];
  const createExternal = (size: number, format: number) => {
    const t = gl.createTexture(); if (!t) throw Error('Unable to allocate fixture texture');
    external.push(t); gl.bindTexture(gl.TEXTURE_2D_ARRAY, t);
    gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, format, size, size, 2); return t;
  };
  const target = new WebGLMultiviewRenderTarget(64, 64, 2, { depthTexture: new DepthTexture(64, 64) });
  target.resolveDepthBuffer = !autoDepth;
  const statuses: number[] = [];
  for (const size of [64, 32]) {
    if (size !== 64) target.setSize(size, size);
    const color = createExternal(size, gl.RGBA8); const depth = createExternal(size, gl.DEPTH_COMPONENT24);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, null);
    for (let frame = 0; frame < 2; frame++) {
      renderer.setRenderTargetTextures(target, color, depth); renderer.setRenderTarget(target);
      statuses.push(gl.checkFramebufferStatus(gl.FRAMEBUFFER)); renderer.setRenderTarget(null);
    }
  }
  if (disposeRenderer) renderer.dispose(); else target.dispose();
  const internal = created.filter(t => !external.includes(t));
  const result = { internalCount: internal.length, internalDeleted: internal.map(t => deleted.filter(d => d === t).length),
    internalAlive: internal.map(t => gl.isTexture(t)), externalDeleted: external.map(t => deleted.includes(t)),
    externalAlive: external.map(t => gl.isTexture(t)), statuses, complete: gl.FRAMEBUFFER_COMPLETE, glError: gl.getError() };
  if (!disposeRenderer) renderer.dispose();
  for (const texture of external) remove(texture);
  canvas.remove(); return result;
}

export async function checkMultiviewOwnershipAfterContextLoss() {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64; document.body.appendChild(canvas);
  const gl = canvas.getContext('webgl2'); if (!gl) throw Error('WebGL2 unavailable');
  const getExtension = gl.getExtension.bind(gl);
  if (!getExtension('OVR_multiview2')) throw Error('OVR_multiview2 unavailable');
  // @ts-expect-error Test-only adapter reacquires the extension after restoration.
  gl.getExtension = name => name === 'OCULUS_multiview' ? getExtension('OVR_multiview2') : getExtension(name);
  // @ts-expect-error multiviewStereo is provided by the intentional fork.
  const renderer = new WebGLRenderer({ canvas, context: gl, multiviewStereo: true });
  const loss = getExtension('WEBGL_lose_context'); if (!loss) throw Error('Context loss unavailable');
  const made: WebGLTexture[] = []; const deleted: (WebGLTexture | null)[] = [];
  const create = gl.createTexture.bind(gl); const del = gl.deleteTexture.bind(gl);
  gl.createTexture = () => { const t = create(); if (t) made.push(t); return t; };
  gl.deleteTexture = t => { deleted.push(t); del(t); };
  const external: WebGLTexture[] = [];
  const fixtureTexture = (format: number) => { const t = gl.createTexture(); if (!t) throw Error('Texture unavailable'); external.push(t);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, t); gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, format, 64, 64, 2); return t; };
  const target = new WebGLMultiviewRenderTarget(64, 64, 2, { depthTexture: new DepthTexture(64, 64) }); target.resolveDepthBuffer = false;
  const setup = () => { const color = fixtureTexture(gl.RGBA8); const depth = fixtureTexture(gl.DEPTH_COMPONENT24); gl.bindTexture(gl.TEXTURE_2D_ARRAY, null);
    renderer.setRenderTargetTextures(target, color, depth); renderer.setRenderTarget(target); const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER); renderer.setRenderTarget(null); return status; };
  const before = setup(); const errBefore = gl.getError();
  const firstOwned = renderer.properties.get(target).__ownedMultiviewDepthTexture;
  const lost = new Promise<void>(resolve => canvas.addEventListener('webglcontextlost', () => resolve(), { once: true })); loss.loseContext(); await lost;
  await new Promise(resolve => setTimeout(resolve, 1000));
  const restored = new Promise<void>(resolve => canvas.addEventListener('webglcontextrestored', () => resolve(), { once: true })); loss.restoreContext(); await restored;
  const errRestored = gl.getError(); const after = setup(); const errAfter = gl.getError(); const secondOwned = renderer.properties.get(target).__ownedMultiviewDepthTexture; target.dispose();
  const internal = [firstOwned, secondOwned];
  const result = { before, after, errBefore, errRestored, errAfter, complete: gl.FRAMEBUFFER_COMPLETE, internalCount: internal.length,
    newInternalDistinct: internal[0] !== internal[1], newInternalAlive: gl.isTexture(internal[1]), newInternalDeletes: deleted.filter(t => t === internal[1]).length,
    externalDeletes: external.map(t => deleted.includes(t)), restoredExternalAlive: external.slice(2).map(t => gl.isTexture(t)), glError: gl.getError() };
  renderer.dispose(); for (const texture of external.slice(2)) del(texture); canvas.remove(); return result;
}

export async function checkXrExtensionsAfterContextLoss(availableAfter: boolean) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64; document.body.appendChild(canvas);
  const gl = canvas.getContext('webgl2', { antialias: true }); if (!gl) throw Error('WebGL2 unavailable');
  const get = gl.getExtension.bind(gl); if (!get('OVR_multiview2')) throw Error('OVR unavailable');
  let available = !availableAfter;
  // @ts-expect-error Synthetic changing extension availability is confined to this test.
  gl.getExtension = name => name === 'OCULUS_multiview' ? (available ? get('OVR_multiview2') : null) : get(name);
  const attrs = gl.getContextAttributes.bind(gl);
  // @ts-expect-error Fixture exposes XR-compatible context attributes.
  gl.getContextAttributes = () => ({ ...attrs(), xrCompatible: true });
  const previous = Object.getOwnPropertyDescriptor(window, 'XRWebGLBinding');
  const observed: any[] = [];
  class FakeBinding { createProjectionLayer(options: unknown) { observed.push(options); return { textureWidth: 64, textureHeight: 64, ignoreDepthValues: false, fixedFoveation: 0 }; } }
  class FakeSession extends EventTarget { updateRenderState(_state: unknown) {} async requestReferenceSpace() { return {}; } requestAnimationFrame() { return 1; } cancelAnimationFrame() {} }
  Object.defineProperty(window, 'XRWebGLBinding', { value: FakeBinding, configurable: true, writable: true });
  try {
    // @ts-expect-error multiviewStereo is provided by the intentional fork.
    const renderer = new WebGLRenderer({ canvas, context: gl, multiviewStereo: true });
    const before = renderer.extensions.has('OCULUS_multiview');
    const loss = get('WEBGL_lose_context'); if (!loss) throw Error('Context loss unavailable');
    const lost = new Promise<void>(resolve => canvas.addEventListener('webglcontextlost', () => resolve(), { once: true })); loss.loseContext(); await lost;
    available = availableAfter; await new Promise(resolve => setTimeout(resolve, 1000));
    const restored = new Promise<void>(resolve => canvas.addEventListener('webglcontextrestored', () => resolve(), { once: true })); loss.restoreContext(); await restored;
    await renderer.xr.setSession(new FakeSession() as any);
    const result = { before, after: (renderer.xr as any).isMultiview, textureType: observed[0]?.textureType, glError: gl.getError() };
    renderer.dispose(); canvas.remove(); return result;
  } finally { if (previous) Object.defineProperty(window, 'XRWebGLBinding', previous); else delete (window as any).XRWebGLBinding; }
}

export function checkDefaultMultiviewTarget() {
  const canvas = document.createElement('canvas'); const gl = canvas.getContext('webgl2'); if (!gl) throw Error('WebGL2 unavailable');
  const original = gl.getExtension.bind(gl); const ovr = original('OVR_multiview2'); if (!ovr) throw Error('OVR unavailable');
  // @ts-expect-error Test-only adapter for Chromium's real multiview extension.
  gl.getExtension = name => name === 'OCULUS_multiview' ? ovr : original(name);
  // @ts-expect-error multiviewStereo is provided by the intentional fork.
  const renderer = new WebGLRenderer({ canvas, context: gl, multiviewStereo: true });
  const target = new WebGLMultiviewRenderTarget(64, 64, 2);
  renderer.setRenderTarget(target); const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  const owned = renderer.properties.get(target).__ownedMultiviewDepthTexture; renderer.setRenderTarget(null); target.dispose();
  const result = { status, complete: gl.FRAMEBUFFER_COMPLETE, owned: !!owned, alive: gl.isTexture(owned), glError: gl.getError() };
  renderer.dispose(); return result;
}

export function checkMultiviewHdrRejected(effect: boolean, hasTarget: boolean) {
  const canvas = document.createElement('canvas'); const gl = canvas.getContext('webgl2'); if (!gl) throw Error('WebGL2 unavailable');
  // @ts-expect-error multiviewStereo is provided by the intentional fork.
  const renderer = new WebGLRenderer({ canvas, context: gl, multiviewStereo: true, outputBufferType: HalfFloatType });
  const target = new WebGLRenderTarget(16, 16); if (hasTarget) renderer.setRenderTarget(target);
  renderer.toneMapping = effect ? NoToneMapping : ACESFilmicToneMapping;
  if (effect) renderer.setEffects([{ enabled: true, render() {} }] as any);
  const originalTarget = renderer.getRenderTarget();
  (renderer.xr as any).getRenderTarget = () => target;
  renderer.xr.enabled = true; renderer.xr.isPresenting = true;
  // @ts-expect-error isMultiview is provided by the intentional fork.
  renderer.xr.isMultiview = true;
  const scene = new Scene(), camera = new PerspectiveCamera(); let message = '';
  try { renderer.render(scene, camera); } catch (e) { message = String(e); }
  const preservedTarget = renderer.getRenderTarget() === originalTarget;
  const preservedToneMapping = renderer.toneMapping === (effect ? NoToneMapping : ACESFilmicToneMapping);
  renderer.xr.isPresenting = false; renderer.xr.enabled = false; if (effect) renderer.setEffects([]);
  let recovered = true; try { renderer.setRenderTarget(null); renderer.render(scene, camera); } catch { recovered = false; }
  const glError = gl.getError(); renderer.dispose(); target.dispose(); return { message, preservedTarget, preservedToneMapping, recovered, glError };
}

export function checkMultiviewViewCountVariants() {
  const canvas = document.createElement('canvas'); const gl = canvas.getContext('webgl2'); if (!gl) throw Error('WebGL2 unavailable');
  const original = gl.getExtension.bind(gl), ovr = original('OVR_multiview2'); if (!ovr) throw Error('OVR unavailable');
  // @ts-expect-error Test-only real OVR adapter.
  gl.getExtension = name => name === 'OCULUS_multiview' ? ovr : original(name);
  // @ts-expect-error multiviewStereo is provided by the fork.
  const renderer = new WebGLRenderer({ canvas, context: gl, multiviewStereo: true });
  renderer.xr.enabled = true; (renderer.xr as any).isMultiview = true;
  const scene = new Scene(); scene.add(new Mesh(new PlaneGeometry(2, 2), new MeshBasicMaterial({ color: 0xff0000 })));
  const eye = () => { const c = new OrthographicCamera(-1, 1, 1, -1, 0.1, 10); c.position.z = 2; c.viewport = new Vector4(0, 0, 32, 32); c.updateMatrixWorld(); return c; };
  const targets = [1, 2].map(count => new WebGLMultiviewRenderTarget(32, 32, count));
  const observed: number[] = [];
  for (const index of [0, 1, 0]) {
    const target = targets[index]; const camera = new ArrayCamera(Array.from({ length: target.numViews }, eye)); camera.updateMatrixWorld();
    renderer.setRenderTarget(target); renderer.render(scene, camera);
    const program = (renderer.info.programs as any[]).find(p => p === renderer.properties.get((scene.children[0] as Mesh).material).currentProgram);
    observed.push(program?.numMultiviewViews ?? -1);
  }
  const versions = (renderer.info.programs as any[]).map(p => p.numMultiviewViews).sort();
  const glError = gl.getError(); renderer.setRenderTarget(null); targets.forEach(t => t.dispose()); renderer.dispose(); return { observed, versions, glError };
}

export function checkMultiviewTransmissionRejected(override: boolean, grouped: boolean, callback: boolean) {
  const canvas = document.createElement('canvas'); const gl = canvas.getContext('webgl2'); if (!gl) throw Error('WebGL2 unavailable');
  const original = gl.getExtension.bind(gl), ovr = original('OVR_multiview2'); if (!ovr) throw Error('OVR unavailable');
  // @ts-expect-error Test-only real OVR adapter.
  gl.getExtension = name => name === 'OCULUS_multiview' ? ovr : original(name);
  // @ts-expect-error multiviewStereo is provided by the fork.
  const renderer = new WebGLRenderer({ canvas, context: gl, multiviewStereo: true });
  renderer.xr.enabled = true; (renderer.xr as any).isMultiview = true;
  const scene = new Scene(), glass = new MeshPhysicalMaterial({ transmission: callback ? 0 : 0.8 });
  const opaque = new MeshBasicMaterial({ color: 0xff0000 });
  const base = grouped ? [opaque, glass] : override ? opaque : glass;
  const geometry = new PlaneGeometry(2, 2); if (grouped) { geometry.addGroup(0, 3, 0); geometry.addGroup(3, 3, 1); }
  const mesh = new Mesh(geometry, base); if (callback) mesh.onBeforeRender = () => { glass.transmission = 0.8; };
  scene.add(mesh); if (override) scene.overrideMaterial = glass;
  const eye = () => { const c = new OrthographicCamera(-1, 1, 1, -1, 0.1, 10); c.position.z = 2; c.viewport = new Vector4(0, 0, 32, 32); c.updateMatrixWorld(); return c; };
  const camera = new ArrayCamera([eye(), eye()]); camera.updateMatrixWorld();
  const target = new WebGLMultiviewRenderTarget(32, 32, 2); renderer.setRenderTarget(target);
  let message = ''; try { renderer.render(scene, camera); } catch (e) { message = String(e); }
  const preservedTarget = renderer.getRenderTarget() === target;
  scene.overrideMaterial = null; mesh.onBeforeRender = () => {}; glass.transmission = 0;
  let recovered = true; try { renderer.render(scene, camera); } catch { recovered = false; }
  renderer.xr.enabled = false; (renderer.xr as any).isMultiview = false; renderer.setRenderTarget(null);
  glass.transmission = 0.8; (scene.children[0] as Mesh).material = glass;
  let mono = true; try { renderer.render(scene, eye()); } catch { mono = false; }
  const glError = gl.getError(); target.dispose(); renderer.dispose(); return { message, preservedTarget, recovered, mono, glError };
}
