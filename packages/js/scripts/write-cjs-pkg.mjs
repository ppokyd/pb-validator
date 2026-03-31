/**
 * Writes dist/cjs/package.json with {"type":"commonjs"} so Node.js treats
 * the TypeScript CJS output files as CommonJS modules, even though the root
 * package.json declares "type":"module".
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "dist", "cjs");
await mkdir(dir, { recursive: true });
await writeFile(
  join(dir, "package.json"),
  JSON.stringify({ type: "commonjs" }, null, 2) + "\n",
);
