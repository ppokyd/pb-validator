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

/**
 * Abstracts how schemas are loaded — implementations differ between Node (fs)
 * and browser (webpack require.context, fetch, etc.).
 */
export interface SchemaProvider {
  getManifest(): Promise<Manifest>;
  /** Receives the relative schema path stored in the manifest, e.g. "pbjs/appnexus.json". */
  getSchemaData(path: string): Promise<Record<string, unknown>>;
}

export interface ValidatorClient {
  loadManifest(): Promise<Manifest>;
  listBidders(): Promise<string[]>;
  getSchema(
    runtime: Runtime,
    bidderCode: string
  ): Promise<Record<string, unknown>>;
  validate(
    runtime: Runtime,
    bidderCode: string,
    params: unknown
  ): Promise<ValidationResult>;
}

function formatAjvErrors(errors: ErrorObject[] | null | undefined): string[] {
  if (!errors?.length) return [];
  return errors.map((e) => `${e.instancePath || "/"} ${e.message}`.trim());
}

/** Creates a validator client backed by the given schema provider. */
export function createClient(provider: SchemaProvider): ValidatorClient {
  const ajvValidators = new Map<string, ValidateFunction>();

  async function loadManifest(): Promise<Manifest> {
    return provider.getManifest();
  }

  async function listBidders(): Promise<string[]> {
    const m = await loadManifest();
    return Object.keys(m.bidders).sort();
  }

  async function getSchema(
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
    return provider.getSchemaData(ref.schema);
  }

  async function validate(
    runtime: Runtime,
    bidderCode: string,
    params: unknown
  ): Promise<ValidationResult> {
    const schema = await getSchema(runtime, bidderCode);
    const key = `${runtime}/${bidderCode}`;
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

  return { loadManifest, listBidders, getSchema, validate };
}
