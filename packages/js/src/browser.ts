/**
 * Browser entry point — no Node.js dependencies.
 *
 * Use createClient() with a SchemaProvider that loads schemas via your
 * bundler (webpack require.context, Vite import.meta.glob, fetch, etc.).
 *
 * @example
 * import { createClient } from "@prebid/adapter-validator";
 *
 * const ctx = require.context("./schemas", true, /\.json$/);
 * const files = Object.fromEntries(ctx.keys().map(k => [k.replace(/^\.\//, ""), ctx(k)]));
 *
 * export const { listBidders, getSchema, validate } = createClient({
 *   getManifest: async () => files["manifest.json"],
 *   getSchemaData: async (path) => files[path],
 * });
 */
export { createClient } from "./core.js";
export type {
  Runtime,
  ValidationResult,
  Manifest,
  SchemaProvider,
  ValidatorClient,
} from "./core.js";
