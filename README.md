# pb-validator

Validate Prebid bidder adapter parameters against auto-synced JSON Schemas — for both **Prebid.js** and **Prebid Server**.

[![CI](https://github.com/ppokyd/pb-validator/actions/workflows/ci.yml/badge.svg)](https://github.com/ppokyd/pb-validator/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@ppokyd/pb-validator)](https://www.npmjs.com/package/@ppokyd/pb-validator)
[![License](https://img.shields.io/github/license/ppokyd/pb-validator)](LICENSE)

---

**[Try the live demo](https://ppokyd.github.io/pb-validator/)** — browse bidders, inspect schemas, and validate params directly in the browser.

---

## Overview

This project maintains a canonical set of **JSON Schema** files for every registered Prebid bidder adapter, covering two runtimes:

| Runtime | Source | Schema path |
| ------- | ------ | ----------- |
| **pbjs** (Prebid.js) | [prebid.github.io `dev-docs/bidders`](https://github.com/prebid/prebid.github.io/tree/master/dev-docs/bidders) | `schemas/pbjs/<bidder>.json` |
| **pbs** (Prebid Server) | [prebid-server `static/bidder-params`](https://github.com/prebid/prebid-server/tree/master/static/bidder-params) | `schemas/pbs/<bidder>.json` |

Schemas are indexed by a shared `schemas/manifest.json` (with pinned upstream commits) and published as the npm package **`@ppokyd/pb-validator`**.

## Installation

```bash
npm install @ppokyd/pb-validator
```

## Usage

### Node (ESM)

```js
import { validate, listBidders } from '@ppokyd/pb-validator';

const bidders = await listBidders('pbs');
const result = await validate('appnexus', { placement_id: 123 }, 'pbs');

if (!result.valid) {
  console.error(result.errors);
}
```

### Browser

The browser entry exposes `createClient`, which accepts a custom schema provider (no `fs` dependency):

```js
import { createClient } from '@ppokyd/pb-validator/browser';

const client = createClient({
  async loadManifest() { /* fetch manifest.json */ },
  async loadSchema(path) { /* fetch individual schema */ },
});

const result = await client.validate('appnexus', { placement_id: 123 }, 'pbs');
```

## Project structure

```
.
├── packages/js/        # @ppokyd/pb-validator — TypeScript library (Ajv 8)
├── demo/               # Webpack 5 browser playground (GitHub Pages)
├── schemas/
│   ├── manifest.json   # Bidder index with pinned upstream commits
│   ├── pbjs/           # Prebid.js bidder schemas
│   └── pbs/            # Prebid Server adapter schemas
├── tools/
│   ├── sync-prebid-client/   # Syncs pbjs schemas from prebid.github.io
│   └── sync-prebid-server/   # Syncs pbs schemas from prebid-server
└── .github/workflows/  # CI, publish, and scheduled sync workflows
```

## Development

**Prerequisites:** Node 22+, npm 10+

```bash
# Install all workspace dependencies
npm install

# Run the library tests
npm -w packages/js test

# Start the demo dev server (http://localhost:3000)
npm -w demo start

# Lint & format
npm run lint
npm run format
```

### Sync schemas locally

```bash
# Prebid.js bidder docs → schemas/pbjs/
node tools/sync-prebid-client/index.mjs --out schemas

# Prebid Server adapters → schemas/pbs/
node tools/sync-prebid-server/index.mjs --out schemas
```

## CI / CD

| Workflow | Trigger | What it does |
| -------- | ------- | ------------ |
| **ci.yml** | Push to `main` / `cursor/**`, PRs to `main` | Lint, format check, test (`packages/js`) |
| **publish.yml** | GitHub release published | Test, version bump from tag, `npm publish` |
| **sync-prebid-docs.yml** | Weekly (Mon 06:00 UTC) + manual | Sync pbjs schemas, open PR if changes detected |
| **sync-prebid-server.yml** | Weekly (Tue 06:00 UTC) + manual | Sync pbs schemas, open PR if changes detected |

## License

[Apache 2.0](LICENSE)
