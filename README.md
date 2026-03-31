# Prebid adapter configuration validator

Shared **JSON Schema** bundles under `schemas/` (manifest + per-bidder files) with:

- **Go** (`validator`): `Validate`, `GetSchema`, `ListBidders` — schemas embedded via `schemas/embed.go`.
- **npm** (`packages/js`): `@prebid/adapter-validator` — Ajv-based validation; run `npm run build` to copy schemas into the package.

Sources of truth for generated schemas (next step): [prebid.github.io `dev-docs`](https://github.com/prebid/prebid.github.io/tree/master/dev-docs) and [prebid-server `adapters`](https://github.com/prebid/prebid-server/tree/master/adapters).

## Quick check

```bash
go test ./...
cd packages/js && npm test
```

## CI

GitHub Actions (`.github/workflows/ci.yml`) runs `go test ./...`, `go vet ./...`, and `npm ci` + `npm test` in `packages/js` on pushes and pull requests to `main` (and pushes to `cursor/**` branches).
