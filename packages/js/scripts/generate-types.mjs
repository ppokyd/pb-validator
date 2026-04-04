/**
 * Reads schemas/manifest.json and every referenced JSON Schema, then generates
 * TypeScript interfaces for each bidder's params — one file per runtime plus a
 * barrel that re-exports everything and provides a type-level lookup map.
 *
 * Output:
 *   packages/js/src/generated/pbjs.ts
 *   packages/js/src/generated/pbs.ts
 *   packages/js/src/generated/index.ts
 *
 * Usage:
 *   node packages/js/scripts/generate-types.mjs
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..', '..', '..');
const schemasDir = join(repoRoot, 'schemas');
const outDir = join(__dirname, '..', 'src', 'generated');

const HEADER = `// @generated — do not edit by hand.\n// Run \`node packages/js/scripts/generate-types.mjs\` to regenerate.\n\n`;

// ── Main ──────────────────────────────────────────────────────────────────────

const manifest = JSON.parse(await readFile(join(schemasDir, 'manifest.json'), 'utf8'));

await mkdir(outDir, { recursive: true });

const pbjsEntries = [];
const pbsEntries = [];

for (const [code, entry] of Object.entries(manifest.bidders)) {
  if (entry.pbjs?.schema) {
    const schema = JSON.parse(await readFile(join(schemasDir, entry.pbjs.schema), 'utf8'));
    pbjsEntries.push({ code, schema });
  }
  if (entry.pbs?.schema) {
    const schema = JSON.parse(await readFile(join(schemasDir, entry.pbs.schema), 'utf8'));
    pbsEntries.push({ code, schema });
  }
}

pbjsEntries.sort((a, b) => a.code.localeCompare(b.code));
pbsEntries.sort((a, b) => a.code.localeCompare(b.code));

await writeFile(join(outDir, 'pbjs.ts'), generateRuntimeFile('Pbjs', pbjsEntries));
await writeFile(join(outDir, 'pbs.ts'), generateRuntimeFile('Pbs', pbsEntries));
await writeFile(join(outDir, 'index.ts'), generateBarrel());

const total = pbjsEntries.length + pbsEntries.length;
console.log(`generated ${pbjsEntries.length} pbjs + ${pbsEntries.length} pbs interfaces (${total} total)`);

// ── Code generation ───────────────────────────────────────────────────────────

function generateRuntimeFile(prefix, entries) {
  let out = HEADER;

  const validEntries = entries.filter(({ schema }) => schema.properties && Object.keys(schema.properties).length > 0);

  for (const { code, schema } of validEntries) {
    const typeName = prefix + bidderToTypeName(code);
    out += emitInterface(typeName, schema) + '\n';
  }

  const mapName = `${prefix}BidderParams`;
  out += `/**\n * Type-level map: \`${mapName}['appnexus']\` → \`${prefix}Appnexus\`.\n */\n`;
  out += `export interface ${mapName} {\n`;
  for (const { code } of validEntries) {
    out += `  ${quoteKey(code)}: ${prefix}${bidderToTypeName(code)};\n`;
  }
  out += `}\n\n`;

  out += `/** Union of all bidder codes that have a ${prefix.toLowerCase()} schema. */\n`;
  out += `export type ${prefix}BidderCode = keyof ${mapName};\n`;

  return out;
}

function generateBarrel() {
  let out = HEADER;
  out += `export * from './pbjs.js';\n`;
  out += `export * from './pbs.js';\n`;
  return out;
}

// ── Interface emission ────────────────────────────────────────────────────────

function emitInterface(name, schema) {
  const required = new Set(schema.required ?? []);
  const nestedQueue = [];
  let out = '';

  const desc = schema.description || schema.title || '';
  if (desc) out += `/** ${sanitize(desc)} */\n`;
  out += `export interface ${name} {\n`;

  for (const [propName, prop] of sortedEntries(schema.properties)) {
    const opt = required.has(propName) ? '' : '?';
    const { tsType, nested } = resolveType(prop, name + pascalCase(propName));
    if (nested) nestedQueue.push(...nested);
    if (prop.description) out += `  /** ${sanitize(prop.description)} */\n`;
    out += `  ${quoteKey(propName)}${opt}: ${tsType};\n`;
  }

  out += `}\n`;

  for (const n of nestedQueue) {
    out += '\n' + emitInterface(n.name, n.schema);
  }

  return out;
}

// ── Type resolution ───────────────────────────────────────────────────────────

/**
 * Maps a JSON Schema property to a TypeScript type string.
 * Returns `{ tsType, nested }` where `nested` is an array of sub-interfaces
 * that need to be emitted alongside the parent.
 */
function resolveType(prop, nestedName) {
  const types = schemaTypes(prop);

  // Union of multiple primitive types, e.g. ["integer", "string"]
  if (types.length > 1) {
    const mapped = types.map((t) => primitiveType(t));
    return { tsType: mapped.join(' | '), nested: null };
  }

  // anyOf / oneOf without an explicit type — fall back to unknown
  if (types.length === 0 && (prop.anyOf?.length || prop.oneOf?.length)) {
    return { tsType: 'unknown', nested: null };
  }

  const t = types[0] ?? '';

  switch (t) {
    case 'string': {
      if (prop.enum?.length) {
        return { tsType: prop.enum.map((v) => JSON.stringify(v)).join(' | '), nested: null };
      }
      return { tsType: 'string', nested: null };
    }
    case 'integer':
    case 'number':
      return { tsType: 'number', nested: null };
    case 'boolean':
      return { tsType: 'boolean', nested: null };
    case 'array': {
      if (prop.items) {
        const inner = resolveType(prop.items, nestedName + 'Item');
        const needsWrap = inner.tsType.includes('|') || inner.tsType.includes('&');
        const elemType = needsWrap ? `(${inner.tsType})` : inner.tsType;
        return { tsType: `${elemType}[]`, nested: inner.nested };
      }
      return { tsType: 'unknown[]', nested: null };
    }
    case 'object': {
      if (prop.properties && Object.keys(prop.properties).length > 0) {
        return {
          tsType: nestedName,
          nested: [{ name: nestedName, schema: prop }],
        };
      }
      if (prop.additionalProperties && typeof prop.additionalProperties === 'object') {
        const valType = resolveType(prop.additionalProperties, nestedName + 'Value');
        return {
          tsType: `Record<string, ${valType.tsType}>`,
          nested: valType.nested,
        };
      }
      return { tsType: 'Record<string, unknown>', nested: null };
    }
    default:
      return { tsType: 'unknown', nested: null };
  }
}

function schemaTypes(prop) {
  if (!prop.type) return [];
  if (typeof prop.type === 'string') return [prop.type];
  if (Array.isArray(prop.type)) return prop.type;
  return [];
}

function primitiveType(jsonType) {
  switch (jsonType) {
    case 'string':
      return 'string';
    case 'integer':
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'array':
      return 'unknown[]';
    case 'object':
      return 'Record<string, unknown>';
    default:
      return 'unknown';
  }
}

// ── Naming helpers ────────────────────────────────────────────────────────────

function bidderToTypeName(code) {
  const parts = code.split(/[_-]+/);
  let name = parts.map(capitalize).join('');
  if (/^\d/.test(name)) name = 'X' + name;
  return name;
}

function pascalCase(s) {
  const parts = s.split(/[_-]+/);
  return parts.map(capitalize).join('');
}

function capitalize(s) {
  if (!s) return s;
  const upper = s.toUpperCase();
  if (['ID', 'URL', 'HTTP', 'HTTPS', 'API', 'URI', 'IP', 'HTML', 'CSS', 'JS'].includes(upper)) {
    return upper;
  }
  return s[0].toUpperCase() + s.slice(1);
}

function quoteKey(key) {
  return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key) ? key : JSON.stringify(key);
}

function sanitize(s) {
  return s.replace(/\*\//g, '* /').replace(/\n/g, ' ').slice(0, 300);
}

function sortedEntries(obj) {
  return Object.entries(obj ?? {}).sort(([a], [b]) => a.localeCompare(b));
}
