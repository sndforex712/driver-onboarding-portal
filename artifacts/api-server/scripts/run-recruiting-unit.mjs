import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const artifactDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = await mkdtemp(path.join(tmpdir(), "recruiting-unit-"));
const outputFile = path.join(outputDir, "recruiting-repository.test.mjs");

try {
  await build({
    entryPoints: [path.join(artifactDir, "src/recruiting-repository.test.ts")],
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
    const child = spawn(process.execPath, ["--test", outputFile], { stdio: "inherit", env: process.env });
    child.once("error", reject);
    child.once("exit", status => resolve(status ?? 1));
  });
  if (code !== 0) process.exitCode = code;
} finally {
  await rm(outputDir, { recursive: true, force: true });
}