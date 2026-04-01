# @ppokyd/pb-validator

Validate Prebid bidder params using JSON Schemas aligned with [prebid.github.io](https://prebid.github.io) and [prebid-server](https://github.com/prebid/prebid-server).

## Installation

```bash
npm install @ppokyd/pb-validator
```

## API

| Method                                  | Description                                                 |
| --------------------------------------- | ----------------------------------------------------------- |
| `validate(runtime, bidderCode, params)` | Validate params for a bidder. Returns `{ valid, errors? }`. |
| `listBidders()`                         | Returns a sorted array of all supported bidder codes.       |
| `getSchema(runtime, bidderCode)`        | Returns the raw JSON Schema for a bidder.                   |
| `loadManifest()`                        | Returns the full manifest (version + bidder index).         |

**`runtime`** is either `"pbjs"` (Prebid.js) or `"pbs"` (Prebid Server).

---

## Node.js

The default export resolves to the Node entry point, which reads schemas from the filesystem using `node:fs`.

### ESM

```js
import { validate, listBidders, getSchema, loadManifest } from '@ppokyd/pb-validator';

// Validate bidder params
const result = await validate('pbjs', 'appnexus', { placementId: 12345 });
if (result.valid) {
  console.log('params are valid');
} else {
  console.error('validation errors:', result.errors);
  // e.g. ["/ must have required property 'placementId'"]
}

// List all supported bidders
const bidders = await listBidders();
console.log(bidders); // ["1accord", "33across", "appnexus", ...]

// Fetch the raw JSON Schema
const schema = await getSchema('pbs', 'appnexus');
console.log(schema.type); // "object"

// Inspect the manifest
const manifest = await loadManifest();
console.log(manifest.version); // "0.1.0"
console.log(manifest.bidders.appnexus); // { pbjs: { schema: "pbjs/appnexus.json" }, pbs: { ... } }
```

### CommonJS

```js
const { validate, listBidders, getSchema, loadManifest } = require('@ppokyd/pb-validator');

async function main() {
  const result = await validate('pbjs', 'appnexus', { placementId: 12345 });
  console.log(result.valid); // true

  const bidders = await listBidders();
  console.log(bidders); // ["1accord", "33across", "appnexus", ...]
}

main();
```

Destructured require works because the CJS entry exports the same named exports as the ESM build. Top-level `await` is not available in CJS, so wrap calls in an `async` function.

### TypeScript (ESM)

```ts
import { validate, listBidders, type Runtime, type ValidationResult } from '@ppokyd/pb-validator';

async function checkBidder(runtime: Runtime, bidder: string, params: unknown): Promise<ValidationResult> {
  return validate(runtime, bidder, params);
}
```

---

## Browser

The browser entry point exports only `createClient` — no Node.js builtins are used. You supply a `SchemaProvider` that tells the client how to load schemas in your environment (bundler, fetch, CDN, etc.).

### Vite / ESBuild — `import.meta.glob`

```js
import { createClient } from '@ppokyd/pb-validator/browser';

// Eagerly import all schemas at build time
const schemaModules = import.meta.glob('./node_modules/@ppokyd/pb-validator/schemas/**/*.json', {
  eager: true,
});

// Strip the path prefix so keys match the manifest's relative paths
// e.g. "pbjs/appnexus.json" or "manifest.json"
const schemasBase = './node_modules/@ppokyd/pb-validator/schemas/';
const files = Object.fromEntries(Object.entries(schemaModules).map(([k, v]) => [k.replace(schemasBase, ''), v]));

const { validate, listBidders, getSchema, loadManifest } = createClient({
  getManifest: async () => files['manifest.json'],
  getSchemaData: async (path) => files[path],
});

const result = await validate('pbjs', 'appnexus', { placementId: 12345 });
console.log(result.valid); // true
```

### webpack — `require.context`

```js
import { createClient } from '@ppokyd/pb-validator/browser';

const ctx = require.context(
  '@ppokyd/pb-validator/schemas',
  true, // recursive
  /\.json$/,
);
const files = Object.fromEntries(ctx.keys().map((k) => [k.replace(/^\.\//, ''), ctx(k)]));

const { validate, listBidders } = createClient({
  getManifest: async () => files['manifest.json'],
  getSchemaData: async (path) => files[path],
});
```

### Fetch (CDN / runtime loading)

Schemas are fetched on demand and cached by the browser. Useful when bundling all schemas is not desirable.

```js
import { createClient } from '@ppokyd/pb-validator/browser';

const BASE = 'https://cdn.example.com/pb-validator/schemas';

const { validate, listBidders } = createClient({
  getManifest: async () => {
    const res = await fetch(`${BASE}/manifest.json`);
    if (!res.ok) throw new Error(`Failed to load manifest: ${res.status}`);
    return res.json();
  },
  getSchemaData: async (path) => {
    const res = await fetch(`${BASE}/${path}`);
    if (!res.ok) throw new Error(`Failed to load schema ${path}: ${res.status}`);
    return res.json();
  },
});

const result = await validate('pbs', 'rubicon', { accountId: 1001, siteId: 1, zoneId: 1 });
console.log(result.valid);
```

### TypeScript (browser)

```ts
import { createClient, type SchemaProvider, type ValidatorClient } from '@ppokyd/pb-validator/browser';

function buildFetchProvider(baseUrl: string): SchemaProvider {
  return {
    getManifest: async () => {
      const res = await fetch(`${baseUrl}/manifest.json`);
      return res.json();
    },
    getSchemaData: async (path: string) => {
      const res = await fetch(`${baseUrl}/${path}`);
      return res.json();
    },
  };
}

const client: ValidatorClient = createClient(buildFetchProvider('/schemas'));
```

---

## Error handling

`validate()` throws only if the bidder code is unknown or the runtime has no schema — it does **not** throw for invalid params, it returns `{ valid: false, errors }` instead.

```js
// Invalid params → no throw, check result.valid
const { valid, errors } = await validate('pbjs', 'appnexus', {});
// valid: false, errors: ["/ must have required property 'placementId'"]

// Unknown bidder → throws
await validate('pbjs', 'not-a-real-bidder', {}).catch((e) => console.error(e.message));
// "unknown bidder: not-a-real-bidder"

// Runtime has no schema for this bidder → throws
await validate('pbs', '1accord', {}).catch((e) => console.error(e.message));
// "no pbs schema for bidder: 1accord"
```

---

## License

Apache-2.0
