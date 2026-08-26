import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

if (process.env.RECRUITING_DEMO_SEED !== "1") {
  throw new Error("Set RECRUITING_DEMO_SEED=1 to run the manual DEV/DEMO Recruiting seed.");
}
if (process.env.NODE_ENV === "production") {
  throw new Error("The DEV/DEMO Recruiting seed cannot run in production.");
}
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required for the manual DEV/DEMO Recruiting seed.");
}

const artifactDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = await mkdtemp(path.join(tmpdir(), "recruiting-demo-seed-"));
const outputFile = path.join(outputDir, "seed.mjs");

try {
  await build({
    entryPoints: [path.join(artifactDir, "src/recruiting-demo-seed.ts")],
    bundle: true,
    platform: "node",
    format: "esm",
    outfile: outputFile,
    logLevel: "silent",
    banner: { js: `import { createRequire } from "node:module";\nconst require = createRequire(import.meta.url);` },
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