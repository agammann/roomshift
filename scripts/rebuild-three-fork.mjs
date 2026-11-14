import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('..', import.meta.url));
const [archiveArgument, outputArgument] = process.argv.slice(2);
if (!archiveArgument || !outputArgument || process.argv.length !== 4) {
  throw Error('Usage: node scripts/rebuild-three-fork.mjs <three-0.187.0.tgz> <new-output-directory>');
}
const archive = path.resolve(archiveArgument);
const output = path.resolve(outputArgument);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const originalHash = 'ff540832ded0cfe919764d24a3d88f3e2a05f23303f876423e4f893841e90728';
if (digest(readFileSync(archive)) !== originalHash) throw Error('Upstream Three 0.187.0 tarball SHA-256 does not match');
// mkdir without recursive or force refuses an existing directory; never delete
// or overwrite an existing source tree during a rebuild.
mkdirSync(output);
const command = (program, args, options = {}) => {
  const result = spawnSync(program, args, { encoding: 'utf8', ...options });
  if (result.error || result.status !== 0) throw Error(`${program} failed: ${result.error ?? result.stderr ?? result.stdout}`);
};
command('tar', ['-xzf', archive, '-C', output, '--strip-components=1']);
command('git', ['-c', 'core.autocrlf=false', 'apply', '--whitespace=error-all', path.join(root, 'vendor', 'three-r187-roomshift.patch')], { cwd: output });

const requireFromVite = createRequire(createRequire(path.join(root, 'package.json')).resolve('vite/package.json'));
const rollupVersion = JSON.parse(readFileSync(requireFromVite.resolve('rollup/package.json'), 'utf8')).version;
if (rollupVersion !== '4.64.5') throw Error(`Renderer rebuild requires locked Rollup 4.64.5; found ${rollupVersion}`);
const { rollup } = requireFromVite('rollup');
const source = (...parts) => path.join(output, 'src', ...parts);
const warnings = [];
const onwarn = warning => warnings.push(`${warning.code}: ${warning.message}`);
const esm = await rollup({ input: { 'three.module': source('Three.js'), 'three.webgpu': source('Three.WebGPU.js'), 'three.tsl': source('Three.TSL.js') }, onwarn });
await esm.write({ dir: path.join(output, 'build-port-v11'), format: 'es', entryFileNames: '[name].js', chunkFileNames: 'chunks/[name]-[hash].js' });
await esm.close();
const cjs = await rollup({ input: source('Three.js'), onwarn });
await cjs.write({ file: path.join(output, 'build-port-v11', 'three.cjs'), format: 'cjs', exports: 'named' });
await cjs.close();
if (warnings.length) throw Error(`Renderer build emitted warnings:\n${warnings.join('\n')}`);

const manifestPath = path.join(output, 'package.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
manifest.name = 'super-three';
manifest.version = '0.187.0-roomshift.11';
manifest.description = 'Experimental Roomshift Three.js/Super Three port; not an upstream release';
manifest.main = './build-port-v11/three.cjs';
manifest.module = './build-port-v11/three.module.js';
manifest.exports['.'] = { import: manifest.module, require: manifest.main };
manifest.exports['./webgpu'] = './build-port-v11/three.webgpu.js';
manifest.exports['./tsl'] = './build-port-v11/three.tsl.js';
manifest.files = [...new Set([...manifest.files.filter(x => x !== 'build'), 'PROVENANCE.md', 'build-port-v11'])];
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
const files = ['src/renderers/webgl/WebGLTextures.js', 'src/renderers/shaders/ShaderChunk/common.glsl.js', 'src/renderers/shaders/ShaderChunk/transmission_pars_fragment.glsl.js', 'src/renderers/WebGLRenderer.js'];
const provenance = '# Experimental renderer provenance\n\nBased on three 0.187.0 (npm tarball SHA-256 FF540832DED0CFE919764D24A3D88F3E2A05F23303F876423E4F893841E90728)\nand renderer modifications from super-three 0.185.0 (npm tarball SHA-256 82EEB665094F127BA02AB212E7540F00C860BCDE24E9887521121D48E87C0919).\nBoth upstream packages carry the included MIT license. Local modifications port the renderer, change texture-upload queuing, and fix multiview targets, multisampling, per-eye lighting and shader collisions.\nThis package is an experiment, is not an upstream release and has not been validated on actual Oculus multiview hardware.\n\nSelected source SHA-256 values:\n\n';
writeFileSync(path.join(output, 'PROVENANCE.md'), provenance + files.map(file => `- ${file}: ${digest(readFileSync(path.join(output, file)))}`).join('\n') + '\n');
console.log(`Rebuilt renderer source and entry points in ${output}; run pnpm pack there and verify the documented tarball digest.`);
