import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

export const intentionalFork = Object.freeze({
  sdkVersion: '1.0.1',
  sdkThree: 'npm:super-three@0.181.0',
  version: '0.187.0-roomshift.13',
  archive: 'vendor/super-three-0.187.0-roomshift.13.tgz',
  archiveSha256: 'fe44c9c9cd6e46dad3bd386aabbac66f9831674a06cba2ddca6c67edfe58f124',
  installedTreeSha256: '4567e949187ac46f182dc92cf715cb94ff1b27abb081e8978554d61bd94e9b9d',
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
