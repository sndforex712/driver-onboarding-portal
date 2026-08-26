import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

if (!["development", "test"].includes(process.env.NODE_ENV)) {
  throw new Error("The DEV/DEMO provisioning command requires NODE_ENV=development or test.");
}
if (process.env.DEMO_USER_PROVISION !== "1") {
  throw new Error("Set DEMO_USER_PROVISION=1 to provision DEV/DEMO users.");
}

const artifactDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = await mkdtemp(path.join(tmpdir(), "franklins-demo-users-"));
const outputFile = path.join(outputDir, "provision.mjs");

try {
  await build({
    entryPoints: [path.join(artifactDir, "src/provision-demo-users.ts")],
    bundle: true,
    platform: "node",
    format: "esm",
    outfile: outputFile,
    logLevel: "silent",
    banner: { js: "import { createRequire } from 'node:module';\nconst require = createRequire(import.meta.url);" },
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