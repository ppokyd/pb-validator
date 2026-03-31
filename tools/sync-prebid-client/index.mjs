#!/usr/bin/env node
/**
 * Sync Prebid.js bidder schemas from prebid.github.io.
 *
 * Clones the docs repo, parses each bidder markdown file's YAML front matter
 * and "### Bid Params" table, then writes typed JSON Schema files under
 * schemas/pbjs/ and updates schemas/manifest.json.
 *
 * Usage:
 *   node tools/sync-prebid-client/index.mjs [--out schemas] [--ref master] [--keep-temp]
 *                                            [--bidders appnexus,rubicon]
 *
 * --bidders  Comma-separated list of bidder codes to update.  When supplied,
 *            only those schemas are written and the manifest is merged rather
 *            than rebuilt, so all other bidders' entries are preserved.
 *            Cleanup of stale schema files is skipped.
 */

import { execSync } from "node:child_process";
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  rmSync,
  mkdtempSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { parseArgs } from "node:util";

const DOCS_REPO_URL = "https://github.com/prebid/prebid.github.io.git";
const DOCS_SUBDIR = "dev-docs/bidders";

// ── CLI ──────────────────────────────────────────────────────────────────────

const { values: args } = parseArgs({
  options: {
    out: { type: "string", default: "schemas" },
    repo: { type: "string", default: DOCS_REPO_URL },
    ref: { type: "string", default: "master" },
    "keep-temp": { type: "boolean", default: false },
    bidders: { type: "string", default: "" },
  },
  allowPositionals: true,
  strict: false,
});

/** @type {Set<string>|null} null = process all bidders */
const bidderFilter = args.bidders
  ? new Set(
      args.bidders
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    )
  : null;

const absOut = resolve(process.cwd(), args.out);
const pbjsDir = join(absOut, "pbjs");
mkdirSync(pbjsDir, { recursive: true });

// ── Clone ────────────────────────────────────────────────────────────────────

const tmpRoot = mkdtempSync(join(tmpdir(), "prebid-docs-"));
const repoDir = join(tmpRoot, "prebid.github.io");

try {
  execSync(`git clone --depth 1 --branch ${args.ref} ${args.repo} ${repoDir}`, {
    stdio: "inherit",
  });

  const docsCommit = execSync(`git -C "${repoDir}" rev-parse HEAD`)
    .toString()
    .trim();

  // ── Walk bidder docs ────────────────────────────────────────────────────

  const biddersDir = join(repoDir, DOCS_SUBDIR);
  const mdFiles = readdirSync(biddersDir)
    .filter((f) => f.toLowerCase().endsWith(".md"))
    .sort();

  /** @type {Map<string, {title:string, file:string, params:BidParam[]}>} */
  const seen = new Map();
  let skipped = 0;

  for (const name of mdFiles) {
    const content = readFileSync(join(biddersDir, name), "utf8");
    const fm = parseYAMLFrontMatter(content);
    if (!fm) {
      skipped++;
      continue;
    }
    if (fm["layout"]?.toLowerCase() !== "bidder") {
      skipped++;
      continue;
    }
    const code = normalizeBidderCode(fm["biddercode"]);
    if (!code) {
      skipped++;
      continue;
    }
    if (bidderFilter && !bidderFilter.has(code)) {
      skipped++;
      continue;
    }
    if (seen.has(code)) {
      console.log(
        `duplicate biddercode "${code}": keeping ${seen.get(code).file}, skipping ${name}`,
      );
      skipped++;
      continue;
    }
    const title = fm["title"] != null ? String(fm["title"]).trim() : "";
    const params = parseBidParams(content);
    seen.set(code, { title, file: name, params });
  }

  // ── Write schemas ───────────────────────────────────────────────────────

  const RESERVED = new Set(["ci_fixture"]);
  const codes = [...seen.keys()].sort();

  /** Codes for which a pbjs schema file was actually written. */
  const codesWithSchema = new Set(["ci_fixture"]);

  for (const code of codes) {
    if (RESERVED.has(code)) {
      console.error(
        `generated bidder code "${code}" conflicts with reserved name`,
      );
      process.exit(1);
    }
    if (writePbjsSchema(pbjsDir, code, seen.get(code))) {
      codesWithSchema.add(code);
    }
  }

  if (bidderFilter) {
    // Warn about any requested bidder that was never found in the docs.
    for (const req of bidderFilter) {
      if (!seen.has(req))
        console.warn(`  warning: bidder "${req}" not found in docs`);
    }
    mergeManifestPbjs(join(absOut, "manifest.json"), codes, codesWithSchema);
  } else {
    cleanupPbjs(pbjsDir, codesWithSchema);
    writeManifest(
      join(absOut, "manifest.json"),
      docsCommit,
      codes,
      codesWithSchema,
    );
  }

  const noSchema = codes.length - (codesWithSchema.size - 1); // exclude ci_fixture
  const scope = bidderFilter
    ? `for ${[...bidderFilter].join(", ")}`
    : `under ${pbjsDir}`;
  console.log(
    `wrote ${codesWithSchema.size - 1} pbjs schemas ${scope} (${noSchema} skipped – no params; ${skipped} non-bidder files ignored)`,
  );
  console.log(`prebid.github.io @ ${docsCommit}`);
} finally {
  if (!args["keep-temp"]) {
    rmSync(tmpRoot, { recursive: true, force: true });
  } else {
    console.log(`keeping clone at ${tmpRoot}`);
  }
}

// ── YAML front-matter parser ─────────────────────────────────────────────────

/**
 * Extracts key-value pairs from the opening YAML front-matter block.
 * Handles the simple flat key: value format used in prebid.github.io docs.
 *
 * @param {string} src
 * @returns {Record<string,unknown>|null}
 */
function parseYAMLFrontMatter(src) {
  const s = src.trimStart();
  if (!s.startsWith("---")) return null;
  const rest = s.slice(3);
  const end = rest.indexOf("\n---");
  if (end < 0) return null;
  const block = rest.slice(0, end);
  const doc = {};
  for (const line of block.split("\n")) {
    const m = line.match(/^([\w-]+)\s*:\s*(.*)/);
    if (!m) continue;
    const [, key, raw] = m;
    doc[key] = coerceYAMLScalar(raw.trim());
  }
  return doc;
}

/** @param {string} v */
function coerceYAMLScalar(v) {
  if (v === "true") return true;
  if (v === "false") return false;
  if (v === "null" || v === "~") return null;
  if (/^-?\d+$/.test(v)) return parseInt(v, 10);
  if (/^-?\d+\.\d+$/.test(v)) return parseFloat(v);
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    return v.slice(1, -1);
  }
  return v;
}

/** @param {unknown} v @returns {string|null} */
function normalizeBidderCode(v) {
  if (v == null) return null;
  if (typeof v === "number") return String(Math.round(v));
  const s = String(v).trim();
  return s || null;
}

// ── Bid Params table parser ──────────────────────────────────────────────────

/**
 * @typedef {{ name:string, required:boolean, description:string, type:string }} BidParam
 */

/**
 * Locates the "### Bid Params" section in a prebid.github.io markdown file and
 * extracts each row of the params table.
 *
 * @param {string} src
 * @returns {BidParam[]}
 */
function parseBidParams(src) {
  // Match section starting at "### Bid Params" (or "### Bidder Params"),
  // up to the next markdown heading (any level) or end of file.
  const sectionRe = /###\s+Bid(?:der)?\s+Params?\b([\s\S]*?)(?=\n#{1,6}\s|$)/i;
  const sectionMatch = src.match(sectionRe);
  if (!sectionMatch) return [];

  const section = sectionMatch[1];
  const tableLines = section
    .split("\n")
    .filter((l) => l.trim().startsWith("|"));
  // Need: header row, separator row, ≥1 data row
  if (tableLines.length < 3) return [];

  const headers = parseTableRow(tableLines[0]).map((h) =>
    h.toLowerCase().trim(),
  );
  const nameIdx = headers.findIndex((h) => h === "name");
  const scopeIdx = headers.findIndex((h) => h === "scope");
  const descIdx = headers.findIndex((h) => h === "description");
  const typeIdx = headers.findIndex((h) => h === "type");

  if (nameIdx < 0 || typeIdx < 0) return [];

  const params = [];
  for (const line of tableLines.slice(2)) {
    // Skip separator lines (e.g. |---|---|)
    if (/^\|[-| :]+\|$/.test(line.trim())) continue;

    const cells = parseTableRow(line);
    const name = stripInlineCode(cells[nameIdx] ?? "").trim();
    if (!name) continue;

    const scope =
      scopeIdx >= 0 ? (cells[scopeIdx] ?? "").toLowerCase().trim() : "";
    const desc =
      descIdx >= 0 ? stripInlineCode(cells[descIdx] ?? "").trim() : "";
    const type =
      typeIdx >= 0 ? stripInlineCode(cells[typeIdx] ?? "").trim() : "";

    params.push({
      name,
      required: scope === "required",
      description: desc,
      type,
    });
  }
  return params;
}

/** Splits a Markdown table row into cell strings (trims pipes and whitespace). */
function parseTableRow(line) {
  return line
    .split("|")
    .slice(1, -1)
    .map((c) => c.trim());
}

/** Removes backtick code spans, leaving the inner text. */
function stripInlineCode(s) {
  return s.replace(/`([^`]*)`/g, "$1").trim();
}

/**
 * Splits a raw docs param name into all its alias variants as clean identifiers.
 *
 * Docs sometimes list multiple aliases in one cell, e.g.:
 *   "placement_id (PBS+PBJS) or placementId (PBJS)" → ["placement_id", "placementId"]
 *   "invCode or inv_code"                            → ["invCode", "inv_code"]
 *   "placementId"                                    → ["placementId"]
 *
 * @param {string} raw
 * @returns {string[]}
 */
function getNameVariants(raw) {
  return raw
    .split(/\s+or\s+/i)
    .map((v) => v.replace(/\s*\([^)]*\)/g, "").trim()) // strip "(PBS+PBJS)" etc.
    .filter((v) => /^\w+$/.test(v)); // valid identifiers only
}

// ── JSON Schema helpers ──────────────────────────────────────────────────────

/**
 * Maps a Prebid docs type string to a partial JSON Schema object.
 * Returns {} for unknown/empty types (treated as unconstrained).
 *
 * @param {string} rawType
 * @returns {Record<string,unknown>}
 */
function mapType(rawType) {
  if (!rawType) return {};
  const t = rawType.toLowerCase().trim();

  // Array<T> / array(T) / T[]
  const arrGeneric = t.match(/^array\s*[<(](\w+)[>)]$/);
  const arrSuffix = t.match(/^(\w+)\[\]$/);
  const itemRaw = (arrGeneric ?? arrSuffix)?.[1];
  if (itemRaw) {
    const itemType = mapPrimitive(itemRaw);
    return itemType
      ? { type: "array", items: { type: itemType } }
      : { type: "array" };
  }
  if (t === "array") return { type: "array" };

  const primitive = mapPrimitive(t);
  if (primitive) return { type: primitive };
  if (t === "object") return { type: "object" };

  return {};
}

/** @param {string} t @returns {string|null} */
function mapPrimitive(t) {
  switch (t) {
    case "string":
      return "string";
    case "integer":
    case "int":
      return "integer";
    case "float":
    case "number":
    case "double":
      return "number";
    case "boolean":
    case "bool":
      return "boolean";
    default:
      return null;
  }
}

// ── Writers ──────────────────────────────────────────────────────────────────

/**
 * Writes a JSON Schema file for a pbjs bidder.
 * Returns true if the file was written, false if skipped (no params).
 *
 * @param {string} dir
 * @param {string} code
 * @param {{ title: string, file: string, params: BidParam[] }} entry
 * @returns {boolean}
 */
function writePbjsSchema(dir, code, { title, file, params }) {
  if (params.length === 0) return false;

  const displayTitle = title || code;

  const properties = {};
  // Each element is an array of alias names for one logical required param.
  const requiredGroups = [];

  for (const p of params) {
    const variants = getNameVariants(p.name);
    if (variants.length === 0) continue;

    const prop = { ...mapType(p.type) };
    if (p.description) prop.description = p.description;

    // Register every alias as its own property with the same type/description.
    for (const v of variants) {
      properties[v] = prop;
    }

    if (p.required) requiredGroups.push(variants);
  }

  /** @type {Record<string,unknown>} */
  const schema = {
    $schema: "http://json-schema.org/draft-07/schema#",
    $id: `https://prebid.org/schemas/pbjs/${code}.json`,
    title: `${displayTitle} bidder params (Prebid.js)`,
    description: `Generated from prebid.github.io ${DOCS_SUBDIR} (${file}).`,
    type: "object",
    properties,
    additionalProperties: false,
  };

  if (requiredGroups.length > 0) {
    // For a single alias → { required: [name] }
    // For multiple aliases → { anyOf: [{ required: [a] }, { required: [b] }] }
    const clauses = requiredGroups.map((group) =>
      group.length === 1
        ? { required: group }
        : { anyOf: group.map((v) => ({ required: [v] })) },
    );
    // Single clause: hoist directly onto the schema object.
    // Multiple clauses: wrap in allOf so every required group must be satisfied.
    if (clauses.length === 1) {
      Object.assign(schema, clauses[0]);
    } else {
      schema.allOf = clauses;
    }
  }

  writeFileSync(
    join(dir, `${code}.json`),
    JSON.stringify(schema, null, 2) + "\n",
  );
  return true;
}

function cleanupPbjs(dir, keep) {
  for (const f of readdirSync(dir)) {
    if (!f.toLowerCase().endsWith(".json")) continue;
    const base = f.replace(/\.json$/i, "");
    if (!keep.has(base)) rmSync(join(dir, f));
  }
}

/**
 * Merges pbjs entries for a filtered subset of bidders into the existing
 * manifest.json without touching any other bidder or the source commit.
 *
 * @param {string} path
 * @param {string[]} codes - only the processed bidder codes
 * @param {Set<string>} codesWithSchema
 */
function mergeManifestPbjs(path, codes, codesWithSchema) {
  /** @type {Record<string,unknown>} */
  let manifest = {};
  try {
    manifest = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    // Start fresh if missing.
  }
  manifest.bidders ??= {};

  for (const code of codes) {
    const existing = /** @type {any} */ (manifest.bidders[code] ?? {});
    manifest.bidders[code] = {
      ...existing,
      pbjs: { schema: codesWithSchema.has(code) ? `pbjs/${code}.json` : null },
    };
  }

  manifest.bidders = Object.fromEntries(
    Object.entries(manifest.bidders).sort(([a], [b]) => a.localeCompare(b)),
  );

  writeFileSync(path, JSON.stringify(manifest, null, 2) + "\n");
}

/**
 * @param {string} path
 * @param {string} docsCommit
 * @param {string[]} codes - all discovered bidder codes
 * @param {Set<string>} codesWithSchema - codes that have a pbjs schema file
 */
function writeManifest(path, docsCommit, codes, codesWithSchema) {
  const allCodes = [...new Set([...codes, "ci_fixture"])].sort();

  // Read existing manifest to preserve pbs entries and prebid_server source
  // written by tools/sync-prebid-server.
  /** @type {Record<string,unknown>} */
  let existing = {};
  try {
    existing = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    // File absent or unparseable – start fresh.
  }

  /** @type {Record<string,unknown>} */
  const existingBidders =
    existing.bidders && typeof existing.bidders === "object"
      ? /** @type {any} */ (existing.bidders)
      : {};

  const existingPbsSource = existing.sources?.prebid_server ?? {
    repo: "https://github.com/prebid/prebid-server",
    path: "static/bidder-params",
    commit: null,
    note: "Pin commit when generating PBS-oriented schemas.",
  };

  const manifest = {
    version: "0.1.0",
    sources: {
      prebid_github_io: {
        repo: "https://github.com/prebid/prebid.github.io",
        path: "dev-docs",
        commit: docsCommit,
        note: "Updated by tools/sync-prebid-client from dev-docs/bidders.",
      },
      prebid_server: existingPbsSource,
    },
    bidders: Object.fromEntries(
      allCodes.map((code) => [
        code,
        {
          pbjs: {
            schema: codesWithSchema.has(code) ? `pbjs/${code}.json` : null,
          },
          // Preserve any pbs entry already set by sync-prebid-server.
          pbs: existingBidders[code]?.pbs ?? null,
        },
      ]),
    ),
  };

  writeFileSync(path, JSON.stringify(manifest, null, 2) + "\n");
}
