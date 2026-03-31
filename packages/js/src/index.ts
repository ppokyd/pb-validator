import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Ajv, type ErrorObject, type ValidateFunction } from "ajv";

export type Runtime = "pbjs" | "pbs";

export interface ValidationResult {
  valid: boolean;
  errors?: string[];
}

export interface Manifest {
  version: string;
  sources?: Record<string, unknown>;
  bidders: Record<
    string,
    {
      pbjs?: { schema: string } | null;
      pbs?: { schema: string } | null;
    }
  >;
}

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Resolved at build time: schemas live next to dist/ after `npm run build`. */
function schemasRoot(): string {
  return join(__dirname, "..", "schemas");
}

let manifestCache: Manifest | null = null;
const ajvValidators = new Map<string, ValidateFunction>();

export async function loadManifest(): Promise<Manifest> {
  if (manifestCache) return manifestCache;
  const raw = await readFile(join(schemasRoot(), "manifest.json"), "utf8");
  manifestCache = JSON.parse(raw) as Manifest;
  return manifestCache;
}

export async function getSchema(
  runtime: Runtime,
  bidderCode: string
): Promise<Record<string, unknown>> {
  const m = await loadManifest();
  const b = m.bidders[bidderCode];
  if (!b) throw new Error(`unknown bidder: ${bidderCode}`);
  const ref =
    runtime === "pbjs" ? b.pbjs : runtime === "pbs" ? b.pbs : null;
  if (!ref?.schema) {
    throw new Error(`no ${runtime} schema for bidder: ${bidderCode}`);
  }
  const path = join(schemasRoot(), ref.schema);
  const raw = await readFile(path, "utf8");
  return JSON.parse(raw) as Record<string, unknown>;
}

function schemaKey(runtime: Runtime, bidderCode: string): string {
  return `${runtime}/${bidderCode}`;
}

function formatAjvErrors(errors: ErrorObject[] | null | undefined): string[] {
  if (!errors?.length) return [];
  return errors.map((e) => `${e.instancePath || "/"} ${e.message}`.trim());
}

export async function validate(
  runtime: Runtime,
  bidderCode: string,
  params: unknown
): Promise<ValidationResult> {
  const schema = await getSchema(runtime, bidderCode);
  const key = schemaKey(runtime, bidderCode);
  let validateFn = ajvValidators.get(key);
  if (!validateFn) {
    const ajv = new Ajv({ allErrors: true, strict: false });
    validateFn = ajv.compile(schema);
    ajvValidators.set(key, validateFn);
  }
  const fn = validateFn;
  const valid = fn(params);
  if (valid) return { valid: true };
  return {
    valid: false,
    errors: formatAjvErrors(fn.errors),
  };
}

export async function listBidders(): Promise<string[]> {
  const m = await loadManifest();
  return Object.keys(m.bidders).sort();
}
