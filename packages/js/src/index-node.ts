import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createClient } from './core.js';

export type { Runtime, ValidationResult, Manifest, SchemaProvider, ValidatorClient } from './core.js';
export { createClient } from './core.js';
export * from './generated/index.js';

/**
 * CJS-compatible Node entry point. Uses the CommonJS __dirname global instead
 * of import.meta.url so this file can be compiled with "module": "CommonJS".
 * The public API is identical to the ESM index.ts.
 */
function schemasRoot(): string {
  // CJS output lives in dist/cjs/, so climb two levels to reach schemas/
  return join(__dirname, '..', '..', 'schemas');
}

const _client = createClient({
  async getManifest() {
    const raw = await readFile(join(schemasRoot(), 'manifest.json'), 'utf8');
    return JSON.parse(raw);
  },
  async getSchemaData(path: string) {
    const raw = await readFile(join(schemasRoot(), path), 'utf8');
    return JSON.parse(raw);
  },
});

export const { loadManifest, listBidders, getSchema, validate } = _client;
