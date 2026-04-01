import { copyFile, mkdir, readdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const fromRoot = join(root, 'schemas');
const toRoot = join(dirname(fileURLToPath(import.meta.url)), '..', 'schemas');

/** Only ship JSON schema files in the npm package (no Go sources or tests). */
async function copyJsonDir(sub) {
  const fromDir = join(fromRoot, sub);
  const toDir = join(toRoot, sub);
  await mkdir(toDir, { recursive: true });
  let names;
  try {
    names = await readdir(fromDir);
  } catch (e) {
    if (e && e.code === 'ENOENT') return;
    throw e;
  }
  for (const name of names) {
    if (!name.endsWith('.json')) continue;
    await copyFile(join(fromDir, name), join(toDir, name));
  }
}

await rm(toRoot, { recursive: true, force: true });
await mkdir(toRoot, { recursive: true });
await copyFile(join(fromRoot, 'manifest.json'), join(toRoot, 'manifest.json'));
await copyJsonDir('pbjs');
await copyJsonDir('pbs');
