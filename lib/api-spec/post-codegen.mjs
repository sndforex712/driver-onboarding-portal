import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(here, "../api-zod/src/index.ts");
const generatedApiPath = path.resolve(here, "../api-zod/src/generated/api.ts");

await writeFile(
  indexPath,
  [
    'export * from "./generated/api";',
    'export * from "./recruiting-stage-order";',
    'export * from "./franklin-lead-ingest";',
    "// Generated component models are namespaced because Orval can emit an",
    "// operation validator and an operation parameter type with the same name.",
    'export * as ApiTypes from "./generated/types";',
    "",
  ].join("\n"),
);

const generatedApi = await readFile(generatedApiPath, "utf8");
await writeFile(
  generatedApiPath,
  generatedApi.replace(
    '"dueBefore": zod.date().optional()',
    '"dueBefore": zod.coerce.date().optional()',
  ),
);