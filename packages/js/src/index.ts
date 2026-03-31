import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "./core.js";

export type {
  Runtime,
  ValidationResult,
  Manifest,
  SchemaProvider,
  ValidatorClient,
} from "./core.js";
export { createClient } from "./core.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Schemas live next to dist/ after `npm run build`. */
function schemasRoot(): string {
  return join(__dirname, "..", "schemas");
}

const _client = createClient({
  async getManifest() {
    const raw = await readFile(join(schemasRoot(), "manifest.json"), "utf8");
    return JSON.parse(raw);
  },
  async getSchemaData(path: string) {
    const raw = await readFile(join(schemasRoot(), path), "utf8");
    return JSON.parse(raw);
  },
});

export const { loadManifest, listBidders, getSchema, validate } = _client;
