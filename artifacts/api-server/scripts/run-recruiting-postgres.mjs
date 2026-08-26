import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

if (process.env.RECRUITING_INTEGRATION_DATABASE !== "1") {
  throw new Error("Set RECRUITING_INTEGRATION_DATABASE=1 to confirm DATABASE_URL is an isolated test database.");
}
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required for isolated Recruiting PostgreSQL verification.");
}

const artifactDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = await mkdtemp(path.join(tmpdir(), "recruiting-postgres-"));
const outputFile = path.join(outputDir, "integration.mjs");

try {
  await build({
    entryPoints: [path.join(artifactDir, "src/recruiting-postgres.integration.ts")],
    bundle: true,
    platform: "node",
    format: "esm",
    outfile: outputFile,
    logLevel: "silent",
    banner: {
      js: `import { createRequire } from "node:module";
const require = createRequire(import.meta.url);`,
    },
  });

  const code = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [outputFile], { stdio: "inherit", env: process.env });
    child.once("error", reject);
    child.once("exit", (status) => resolve(status ?? 1));
  });
  if (code !== 0) process.exitCode = code;
} finally {
  await rm(outputDir, { recursive: true, force: true });
}