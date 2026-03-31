/**
 * Browser adapter for @prebid/adapter-validator.
 *
 * Bridges the package's createClient() API with webpack's require.context,
 * which bundles all schemas from schemas/ at build time so no server
 * round-trips are needed.
 */
import { createClient } from '@prebid/adapter-validator';

// webpack bundles every JSON file under schemas/ into schemaFiles at build time.
const schemaCtx = require.context('../../schemas', true, /\.json$/);
const schemaFiles = {};
schemaCtx.keys().forEach(key => {
  schemaFiles[key.replace(/^\.\//, '')] = schemaCtx(key);
});

export const { loadManifest, listBidders, getSchema, validate } = createClient({
  getManifest: async () => schemaFiles['manifest.json'],
  getSchemaData: async (path) => {
    const data = schemaFiles[path];
    if (!data) throw new Error(`schema file missing: ${path}`);
    return data;
  },
});
