# Prebid adapter configuration validator

Shared **JSON Schema** bundles under `schemas/` (manifest + per-bidder files), exposed as an npm package:

- **npm** (`packages/js`): `@ppokyd/pb-validator` — Ajv-based validation; run `npm run build` to copy schemas into the package.

Sources of truth:

- **Prebid.js bidder docs:** [prebid.github.io `dev-docs/bidders`](https://github.com/prebid/prebid.github.io/tree/master/dev-docs/bidders) — `node tools/sync-prebid-client/index.mjs --out schemas` clones that repo, reads `layout: bidder` pages, writes one `schemas/pbjs/<biddercode>.json` per bidder, and updates `schemas/manifest.json` (pinned commit under `sources.prebid_github_io.commit`). Schemas are permissive objects (`additionalProperties: true`) until Bid Params tables are parsed into constraints.
- **Prebid Server adapters:** [prebid-server `static/bidder-params`](https://github.com/prebid/prebid-server/tree/master/static/bidder-params) — `node tools/sync-prebid-server/index.mjs --out schemas` clones that repo, copies the ready-made JSON Schema files (one per adapter) to `schemas/pbs/<code>.json`, and merges `pbs` entries into `schemas/manifest.json` (pinned commit under `sources.prebid_server.commit`) while preserving existing `pbjs` entries. Each adapter schema is normalised with a canonical `$id` and `$schema`.

## Demo

**[ppokyd.github.io/pb-validator](https://ppokyd.github.io/pb-validator/)** — interactive browser playground: browse bidders, inspect schemas, and validate params against the pbjs or pbs schema without installing anything.

## Quick check

```bash
cd packages/js && npm test
```

## CI

GitHub Actions (`.github/workflows/ci.yml`) runs `npm ci` + `npm test` in `packages/js` on pushes and pull requests to `main` (and pushes to `cursor/**` branches).

## Scheduled sync

Two scheduled workflows keep the schemas up to date:

- **`.github/workflows/sync-prebid-docs.yml`** — runs **weekly on Mondays** (and via workflow dispatch): executes `node tools/sync-prebid-client/index.mjs --out schemas` and opens a PR when documentation changes are detected (using [peter-evans/create-pull-request](https://github.com/peter-evans/create-pull-request)).
- **`.github/workflows/sync-prebid-server.yml`** — runs **weekly on Tuesdays** (and via workflow dispatch): executes `node tools/sync-prebid-server/index.mjs --out schemas` and opens a PR when PBS adapter schema changes are detected. Existing `pbjs` entries in the manifest are preserved.
