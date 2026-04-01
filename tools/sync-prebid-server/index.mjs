#!/usr/bin/env node
/**
 * Sync Prebid Server adapter bid-param schemas.
 *
 * Clones prebid/prebid-server, reads the ready-made JSON Schema files under
 * static/bidder-params/ (one per adapter), normalises them with a canonical
 * $id and $schema, writes them to schemas/pbs/, and merges the pbs entries
 * into schemas/manifest.json while preserving existing pbjs entries.
 *
 * Usage:
 *   node tools/sync-prebid-server/index.mjs [--out schemas] [--ref master] [--keep-temp]
 *                                            [--bidders appnexus,rubicon]
 *
 * --bidders  Comma-separated list of bidder codes to update.  When supplied,
 *            only those schemas are written and the manifest is merged rather
 *            than rebuilt, so all other bidders' entries are preserved.
 *            Cleanup of stale schema files is skipped.
 */

import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync, mkdtempSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { parseArgs } from 'node:util';

const PBS_REPO_URL = 'https://github.com/prebid/prebid-server.git';
const PBS_PARAMS_DIR = 'static/bidder-params';
const PBS_INFO_DIR = 'static/bidder-info';

// ── CLI ──────────────────────────────────────────────────────────────────────

const { values: args } = parseArgs({
  options: {
    out: { type: 'string', default: 'schemas' },
    repo: { type: 'string', default: PBS_REPO_URL },
    ref: { type: 'string', default: 'master' },
    'keep-temp': { type: 'boolean', default: false },
    bidders: { type: 'string', default: '' },
  },
  allowPositionals: true,
  strict: false,
});

/** @type {Set<string>|null} null = process all bidders */
const bidderFilter = args.bidders
  ? new Set(
      args.bidders
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    )
  : null;

const absOut = resolve(process.cwd(), args.out);
const pbsDir = join(absOut, 'pbs');
mkdirSync(pbsDir, { recursive: true });

// ── Clone ────────────────────────────────────────────────────────────────────

const tmpRoot = mkdtempSync(join(tmpdir(), 'prebid-server-'));
const repoDir = join(tmpRoot, 'prebid-server');

try {
  execSync(`git clone --depth 1 --branch ${args.ref} ${args.repo} ${repoDir}`, {
    stdio: 'inherit',
  });

  const pbsCommit = execSync(`git -C "${repoDir}" rev-parse HEAD`).toString().trim();

  // ── Collect adapter schemas ──────────────────────────────────────────────

  const paramsDir = join(repoDir, PBS_PARAMS_DIR);
  const infoDir = join(repoDir, PBS_INFO_DIR);

  if (!existsSync(paramsDir)) {
    throw new Error(`Expected ${PBS_PARAMS_DIR} in the cloned repo – wrong ref or repo?`);
  }

  const jsonFiles = readdirSync(paramsDir)
    .filter((f) => f.toLowerCase().endsWith('.json'))
    .sort();

  /** @type {string[]} */
  const codes = [];

  for (const name of jsonFiles) {
    const code = name.replace(/\.json$/i, '');
    if (bidderFilter && !bidderFilter.has(code)) continue;
    let raw;
    try {
      raw = JSON.parse(readFileSync(join(paramsDir, name), 'utf8'));
    } catch (err) {
      console.warn(`  skip ${name}: JSON parse error – ${err.message}`);
      continue;
    }

    // Optionally read bidder-info YAML for a human-readable title.
    const infoTitle = readBidderInfoTitle(infoDir, code);

    writePbsSchema(pbsDir, code, raw, infoTitle, pbsCommit);
    codes.push(code);
  }

  if (bidderFilter) {
    // Warn about any requested bidder that was never found in the repo.
    for (const req of bidderFilter) {
      if (!codes.includes(req)) console.warn(`  warning: bidder "${req}" not found in prebid-server`);
    }
    mergeManifestPbs(join(absOut, 'manifest.json'), codes);
  } else {
    cleanupPbs(pbsDir, new Set(codes));
    updateManifest(join(absOut, 'manifest.json'), pbsCommit, codes);
  }

  const scope = bidderFilter ? `for ${[...bidderFilter].join(', ')}` : `under ${pbsDir}`;
  console.log(`wrote ${codes.length} pbs schemas ${scope}`);
  console.log(`prebid-server @ ${pbsCommit}`);
} finally {
  if (!args['keep-temp']) {
    rmSync(tmpRoot, { recursive: true, force: true });
  } else {
    console.log(`keeping clone at ${tmpRoot}`);
  }
}

// ── Bidder info YAML reader ───────────────────────────────────────────────────

/**
 * Reads the optional `static/bidder-info/<code>.yaml` and extracts a
 * human-readable maintainer email or endpoint hint to enrich the schema title.
 * Returns a title string, or null if the file is absent or unparseable.
 *
 * @param {string} infoDir
 * @param {string} code
 * @returns {string|null}
 */
function readBidderInfoTitle(infoDir, code) {
  const path = join(infoDir, `${code}.yaml`);
  if (!existsSync(path)) return null;
  try {
    const text = readFileSync(path, 'utf8');
    // Simple line scan – just need the maintainer.email field.
    for (const line of text.split('\n')) {
      const m = line.match(/^\s*email\s*:\s*(.+)/i);
      if (m) return null; // we only wanted to confirm it's a real bidder
    }
  } catch {
    // ignore
  }
  return null;
}

// ── Schema writer ─────────────────────────────────────────────────────────────

/**
 * Normalises a raw bidder-params JSON Schema from the Prebid Server repo and
 * writes it to the output directory with a canonical $id and $schema.
 *
 * The upstream files are already valid JSON Schema (draft-04 or draft-07).
 * We preserve all properties, required, etc. and only add/overwrite:
 *   - $schema       → http://json-schema.org/draft-07/schema#
 *   - $id           → https://prebid.org/schemas/pbs/<code>.json
 *   - title         → "<Title> bidder params (Prebid Server)" when absent
 *   - x-source-url  → permalink to the upstream file on GitHub
 *
 * @param {string} dir
 * @param {string} code
 * @param {Record<string,unknown>} raw
 * @param {string|null} _infoTitle
 * @param {string} commit - the resolved HEAD commit of the cloned repo
 */
function writePbsSchema(dir, code, raw, _infoTitle, commit) {
  const upstreamTitle = typeof raw.title === 'string' ? raw.title.trim() : '';
  // Normalise title: strip trailing "(Prebid Server)" variants to re-add consistently.
  const baseTitle =
    upstreamTitle
      .replace(/\s*\(Prebid\s*Server\)$/i, '')
      .replace(/\s*Adapter\s*Params?$/i, '')
      .trim() || code;

  // Destructure the fields we control so the spread below doesn't re-insert
  // them at the wrong position (preserving key-insertion order in the output).
  const { $schema: _s, $id: _i, title: _t, description: _d, 'x-source-url': _x, ...rest } = raw;

  const schema = {
    $schema: 'http://json-schema.org/draft-07/schema#',
    $id: `https://prebid.org/schemas/pbs/${code}.json`,
    title: `${baseTitle} bidder params (Prebid Server)`,
    description: raw.description ?? `Adapter params schema for the Prebid Server "${code}" adapter.`,
    'x-source-url': `https://github.com/prebid/prebid-server/blob/${commit}/${PBS_PARAMS_DIR}/${code}.json`,
    ...rest,
  };

  writeFileSync(join(dir, `${code}.json`), JSON.stringify(schema, null, 2) + '\n');
}

// ── Cleanup ───────────────────────────────────────────────────────────────────

/**
 * Removes pbs schema files that are no longer generated (stale adapters).
 *
 * @param {string} dir
 * @param {Set<string>} keep
 */
function cleanupPbs(dir, keep) {
  for (const f of readdirSync(dir)) {
    if (!f.toLowerCase().endsWith('.json')) continue;
    const base = f.replace(/\.json$/i, '');
    if (!keep.has(base)) {
      rmSync(join(dir, f));
      console.log(`  removed stale schema pbs/${f}`);
    }
  }
}

// ── Manifest update ───────────────────────────────────────────────────────────

/**
 * Merges pbs entries for a filtered subset of bidders into the existing
 * manifest.json without touching any other bidder or the source commit.
 *
 * @param {string} path
 * @param {string[]} codes - only the processed bidder codes
 */
function mergeManifestPbs(path, codes) {
  /** @type {Record<string,unknown>} */
  let manifest = {};
  try {
    manifest = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    // Start fresh if missing.
  }
  manifest.bidders ??= {};

  for (const code of codes) {
    const existing = /** @type {any} */ (manifest.bidders[code] ?? {});
    manifest.bidders[code] = {
      ...existing,
      pbs: { schema: `pbs/${code}.json` },
    };
  }

  manifest.bidders = Object.fromEntries(Object.entries(manifest.bidders).sort(([a], [b]) => a.localeCompare(b)));

  writeFileSync(path, JSON.stringify(manifest, null, 2) + '\n');
}

/**
 * Merges pbs entries into the existing manifest.json, preserving pbjs data.
 *
 * Strategy:
 *   - Existing bidders keep their pbjs entry as-is.
 *   - Bidders present in PBS gain a `pbs` entry; those absent get `pbs: null`.
 *   - New PBS-only bidders (not in manifest) are added with `pbjs: null`.
 *   - sources.prebid_server.commit is updated.
 *
 * @param {string} path
 * @param {string} pbsCommit
 * @param {string[]} codes
 */
function updateManifest(path, pbsCommit, codes) {
  /** @type {Record<string,unknown>} */
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    // Bootstrap a minimal manifest if none exists yet.
    manifest = {
      version: '0.1.0',
      sources: {},
      bidders: {},
    };
  }

  // Ensure sources block exists.
  manifest.sources ??= {};
  manifest.sources.prebid_server ??= {};
  manifest.sources.prebid_server = {
    repo: 'https://github.com/prebid/prebid-server',
    path: PBS_PARAMS_DIR,
    commit: pbsCommit,
    note: 'Updated by tools/sync-prebid-server from static/bidder-params.',
  };

  manifest.bidders ??= {};

  const pbsSet = new Set(codes);

  // Update pbs entries for existing bidders.
  for (const [code, entry] of Object.entries(manifest.bidders)) {
    /** @type {any} */
    const e = entry;
    if (pbsSet.has(code)) {
      e.pbs = { schema: `pbs/${code}.json` };
    } else {
      // Bidder exists in manifest (from pbjs sync) but not in PBS – keep null.
      e.pbs = null;
    }
  }

  // Add bidders that are PBS-only (not yet in manifest from pbjs sync).
  for (const code of codes) {
    if (!manifest.bidders[code]) {
      manifest.bidders[code] = {
        pbjs: null,
        pbs: { schema: `pbs/${code}.json` },
      };
    }
  }

  // Re-sort bidder keys alphabetically for deterministic diffs.
  manifest.bidders = Object.fromEntries(Object.entries(manifest.bidders).sort(([a], [b]) => a.localeCompare(b)));

  writeFileSync(path, JSON.stringify(manifest, null, 2) + '\n');
}
