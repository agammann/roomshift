import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

export const intentionalFork = Object.freeze({
  sdkVersion: '1.0.1',
  sdkThree: 'npm:super-three@0.181.0',
  version: '0.187.0-roomshift.9',
  archive: 'vendor/super-three-0.187.0-roomshift.9.tgz',
  archiveSha256: 'ecf3117509a00a7b1e08a5fcf1ffc89a08cf417775cfe2cf171b1fa312215cb5',
  installedTreeSha256: 'd28a8db3d07bfe2185ab9133d3345d11e863ec8159c73829e53f4e008b711280',
});

// This exception deliberately applies only to one exact reviewed override.
// A new SDK, a changed archive, or changed installed files requires review.
export function verifyIntentionalFork({ sdkVersion, sdkThree, runtimeVersion, archivePath, packageRoot }) {
  if (runtimeVersion !== intentionalFork.version) throw Error('The renderer is not the reviewed fork version.');
  if (sdkVersion !== intentionalFork.sdkVersion || sdkThree !== intentionalFork.sdkThree) {
    throw Error(`The reviewed renderer fork only covers IWSDK ${intentionalFork.sdkVersion} declaring ${intentionalFork.sdkThree}; review this SDK update.`);
  }
  const digest = bytes => createHash('sha256').update(bytes).digest('hex');
  if (digest(readFileSync(archivePath)) !== intentionalFork.archiveSha256) {
    throw Error('The reviewed renderer archive changed; verify provenance and update its pinned digest.');
  }
  const files = [];
  const visit = directory => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw Error(`Unexpected symlink in renderer package: ${file}`);
      if (entry.isDirectory()) visit(file);
      else if (entry.isFile()) files.push(path.relative(packageRoot, file).replaceAll('\\', '/'));
      else throw Error(`Unexpected renderer package entry: ${file}`);
    }
  };
  visit(packageRoot);
  const tree = createHash('sha256');
  for (const file of files.sort()) {
    tree.update(`${file}\0${digest(readFileSync(path.join(packageRoot, ...file.split('/'))))}\n`);
  }
  if (tree.digest('hex') !== intentionalFork.installedTreeSha256) {
    throw Error('The installed renderer differs from the reviewed fork; reinstall and verify its contents.');
  }
}
