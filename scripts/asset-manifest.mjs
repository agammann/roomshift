import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve('dist');
const assets = [];
async function visit(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) await visit(file);
    else if (entry.isFile()) {
      const data = await readFile(file);
      assets.push({ path: path.relative(root, file).split(path.sep).join('/'), bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') });
    } else throw new Error(`Unexpected non-file asset: ${file}`);
  }
}
await visit(root);
assets.sort((a, b) => a.path.localeCompare(b.path));
if (!assets.some(asset => asset.path === 'index.html')) throw new Error('Missing production entry');
await mkdir('reports', { recursive: true });
await writeFile('reports/asset-manifest.json', JSON.stringify({ schema: 1, sourceSha: process.env.GITHUB_SHA ?? null, scope: 'Production asset identity and byte sizes; not hardware timing or a performance threshold.', totalBytes: assets.reduce((sum, asset) => sum + asset.bytes, 0), assets }, null, 2) + '\n');
console.log(`Recorded ${assets.length} production assets.`);
