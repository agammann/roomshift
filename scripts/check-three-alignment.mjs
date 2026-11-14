import { spawnSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveConfig } from 'vite';
import { intentionalFork, verifyIntentionalFork } from './three-fork-integrity.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const config = await resolveConfig({ root }, 'build');
const resolve = config.createResolver();
const appEntry = path.join(root, 'src', 'scene.ts');
const sdkEntry = await resolve('@iwsdk/core', appEntry);
if (!sdkEntry) throw Error('Unable to resolve IWSDK through the production Vite configuration.');
const appThree = await resolve('three', appEntry);
const sdkThreeEntry = await resolve('three', sdkEntry);
if (!appThree || !sdkThreeEntry) throw Error('Unable to resolve Three through the production Vite configuration.');
const appRuntime = realpathSync(appThree);
const sdkRuntime = realpathSync(sdkThreeEntry);

if (appRuntime !== sdkRuntime) {
  throw Error('Roomshift and IWSDK resolve different Three runtimes; align the super-three override.');
}

// The alias is named `three` in imports, but its installed package is super-three.
const runtimePackage = JSON.parse(readFileSync(path.join(path.dirname(appRuntime), '..', 'package.json'), 'utf8'));
if (runtimePackage.name !== 'super-three') {
  throw Error(`Expected the IWSDK super-three runtime; found ${runtimePackage.name}.`);
}
const sdkPackage = JSON.parse(readFileSync(path.join(path.dirname(sdkEntry), '..', 'package.json'), 'utf8'));
const sdkThree = sdkPackage.dependencies?.three;
const isIntentionalFork = runtimePackage.version === intentionalFork.version;
if (isIntentionalFork) {
  verifyIntentionalFork({ sdkVersion: sdkPackage.version, sdkThree, runtimeVersion: runtimePackage.version,
    archivePath: path.join(root, intentionalFork.archive), packageRoot: path.resolve(path.dirname(appRuntime), '..') });
  console.log(`Using Roomshift's intentional ${intentionalFork.version} renderer override for IWSDK ${sdkPackage.version}.`);
} else if (sdkThree !== `npm:super-three@${runtimePackage.version}`) {
  throw Error(`IWSDK declares ${sdkThree ?? 'no Three runtime'}, but the installed override is super-three ${runtimePackage.version}; review SDK compatibility.`);
}

// Inspect the files TypeScript actually includes, not only the root manifest.
const compiler = path.join(root, 'node_modules', 'typescript', 'bin', 'tsc');
const result = spawnSync(process.execPath, [compiler, '--listFilesOnly', '--pretty', 'false'], {
  cwd: root,
  encoding: 'utf8',
  maxBuffer: 16 * 1024 * 1024,
});
if (result.error || result.status !== 0) {
  throw Error(`Unable to inspect TypeScript's resolved files: ${result.error ?? result.stderr ?? result.stdout}`);
}

const typeRoots = new Set();
for (const file of result.stdout.split(/\r?\n/)) {
  const normalized = file.replaceAll('\\', '/');
  const marker = '/node_modules/@types/three/';
  const index = normalized.lastIndexOf(marker);
  if (index !== -1) typeRoots.add(normalized.slice(0, index + marker.length - 1));
}
if (typeRoots.size === 0) throw Error('TypeScript did not resolve @types/three; review the Three type alignment check.');

const releaseLine = (version) => {
  const match = /^(\d+)\.(\d+)\.\d+$/.exec(version);
  if (!match) throw Error(`Cannot determine the Three release line from ${version}.`);
  return `${match[1]}.${match[2]}`;
};
const runtimeLine = isIntentionalFork ? '0.187' : releaseLine(runtimePackage.version);
for (const typeRoot of typeRoots) {
  const types = JSON.parse(readFileSync(path.join(typeRoot, 'package.json'), 'utf8'));
  if (types.name !== '@types/three' || releaseLine(types.version) !== runtimeLine) {
    throw Error(`Three runtime ${runtimePackage.version} and resolved types ${types.version} do not match; update them together.`);
  }
  console.log(`Three runtime ${runtimePackage.version} and resolved types ${types.version} share release line ${runtimeLine}.`);
}
