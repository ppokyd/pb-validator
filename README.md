# Prebid adapter configuration validator

Shared **JSON Schema** bundles under `schemas/` (manifest + per-bidder files) with:

- **Go** (`validator`): `Validate`, `GetSchema`, `ListBidders` — schemas embedded via `schemas/embed.go`.
- **npm** (`packages/js`): `@prebid/adapter-validator` — Ajv-based validation; run `npm run build` to copy schemas into the package.

Sources of truth:

- **Prebid.js bidder docs:** [prebid.github.io `dev-docs/bidders`](https://github.com/prebid/prebid.github.io/tree/master/dev-docs/bidders) — `go run ./tools/sync-prebid-docs -out schemas` clones that repo, reads `layout: bidder` pages, writes one `schemas/pbjs/<biddercode>.json` per bidder, and updates `schemas/manifest.json` (pinned commit under `sources.prebid_github_io.commit`). Schemas are permissive objects (`additionalProperties: true`) until Bid Params tables are parsed into constraints.
- **Prebid Server:** [prebid-server `adapters`](https://github.com/prebid/prebid-server/tree/master/adapters) — not generated yet (`pbs` entries stay `null`).

## Quick check

```bash
go test ./...
cd packages/js && npm test
```

## CI

GitHub Actions (`.github/workflows/ci.yml`) runs `go test ./...`, `go vet ./...`, and `npm ci` + `npm test` in `packages/js` on pushes and pull requests to `main` (and pushes to `cursor/**` branches).

## Scheduled sync

`.github/workflows/sync-prebid-docs.yml` runs **weekly** (and via **workflow dispatch**): executes `go run ./tools/sync-prebid-docs -out schemas` and opens a PR when the documentation clone produces changes (using [peter-evans/create-pull-request](https://github.com/peter-evans/create-pull-request)).
