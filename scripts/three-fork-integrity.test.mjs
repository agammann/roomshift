import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { intentionalFork, verifyIntentionalFork } from './three-fork-integrity.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const requireFromRoot = createRequire(path.join(root, 'package.json'));
const packageRoot = path.resolve(path.dirname(realpathSync(requireFromRoot.resolve('three'))), '..');
const sdkPackageRoot = path.resolve(path.dirname(realpathSync(fileURLToPath(import.meta.resolve('@iwsdk/core')))), '..');
const archivePath = path.join(root, intentionalFork.archive);
const options = () => ({ sdkVersion: intentionalFork.sdkVersion, sdkThree: intentionalFork.sdkThree,
  sdkPackageRoot, runtimeVersion: intentionalFork.version, archivePath, packageRoot });
const temporary = () => {
  const parent = realpathSync(os.tmpdir());
  const directory = mkdtempSync(path.join(parent, 'roomshift-fork-test-'));
  return { directory, cleanup() {
    const resolved = realpathSync(directory);
    if (path.dirname(resolved) !== parent || !path.basename(resolved).startsWith('roomshift-fork-test-')) {
      throw Error('Refusing to remove an unexpected test directory');
    }
    rmSync(resolved, { recursive: true });
  } };
};

test('the installed fork and archive match the explicitly reviewed SDK tuple', () => {
  assert.doesNotThrow(() => verifyIntentionalFork(options()));
});

test('an SDK, SDK declaration, or runtime version change requires a new review', () => {
  assert.throws(() => verifyIntentionalFork({ ...options(), sdkVersion: '1.2.0' }), /only covers IWSDK/);
  assert.throws(() => verifyIntentionalFork({ ...options(), sdkThree: 'npm:super-three@0.181.0' }), /only covers IWSDK/);
  assert.throws(() => verifyIntentionalFork({ ...options(), runtimeVersion: '0.187.0' }), /not the reviewed fork/);
});

test('a changed SDK renderer adapter is rejected', () => {
  const fixture = temporary();
  try {
    const altered = path.join(fixture.directory, intentionalFork.sdkRenderer);
    mkdirSync(path.dirname(altered), { recursive: true });
    writeFileSync(altered, 'changed\n');
    assert.throws(() => verifyIntentionalFork({ ...options(), sdkPackageRoot: fixture.directory }), /adapter differs/);
  } finally { fixture.cleanup(); }
});

test('a changed renderer archive is rejected', () => {
  const fixture = temporary();
  try {
    const altered = path.join(fixture.directory, 'altered.tgz');
    const original = readFileSync(archivePath);
    original[original.length - 1] ^= 1;
    writeFileSync(altered, original);
    assert.throws(() => verifyIntentionalFork({ ...options(), archivePath: altered }), /archive changed/);
  } finally { fixture.cleanup(); }
});

test('a changed installed entry point is rejected without modifying the package store', () => {
  const fixture = temporary();
  try {
    const copy = path.join(fixture.directory, 'renderer');
    cpSync(packageRoot, copy, { recursive: true, errorOnExist: true });
    writeFileSync(path.join(copy, 'build-port-v13', 'three.module.js'), 'changed\n');
    assert.throws(() => verifyIntentionalFork({ ...options(), packageRoot: copy }), /installed renderer differs/);
  } finally { fixture.cleanup(); }
});
