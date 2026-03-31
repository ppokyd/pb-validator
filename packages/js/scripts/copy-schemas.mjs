import { cp } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const from = join(root, "schemas");
const to = join(dirname(fileURLToPath(import.meta.url)), "..", "schemas");
await cp(from, to, { recursive: true, force: true });
