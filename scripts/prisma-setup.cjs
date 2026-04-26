"use strict";

/**
 * Runs `prisma generate` (via Node — avoids `npx` resolution delays on Windows) and copies the
 * client into `node_modules/.prisma/client` for Next/Vercel.
 */
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const { preparePrismaEnv } = require("./ensure-direct-database-url.cjs");

const root = path.resolve(__dirname, "..");
const prismaCli = path.join(root, "node_modules", "prisma", "build", "index.js");
const schema = path.join(root, "prisma", "schema.prisma");
const copyScript = path.join(root, "scripts", "copy-prisma-client.cjs");

function main() {
  preparePrismaEnv(root);

  if (!fs.existsSync(prismaCli)) {
    console.error("[prisma-setup] Missing Prisma CLI. Run: npm install");
    process.exit(1);
  }
  if (!fs.existsSync(schema)) {
    console.error("[prisma-setup] Missing schema at", schema);
    process.exit(1);
  }

  const outDir = path.join(root, "generated", "prisma-client");
  try {
    if (fs.existsSync(outDir)) {
      console.log("[prisma-setup] Clearing", outDir, "(stale files can block generate on Windows)…");
      fs.rmSync(outDir, { recursive: true, force: true });
    }
  } catch (e) {
    console.warn("[prisma-setup] Could not remove old output (close editors using this folder):", e?.message || e);
  }

  console.log("[prisma-setup] Generating Prisma Client (first run may download engines — can take 1–3 min)…");
  const gen = spawnSync(
    process.execPath,
    [prismaCli, "generate", "--no-hints", "--schema", schema],
    {
      cwd: root,
      stdio: "inherit",
      env: {
        ...process.env,
        CI: process.env.CI || "1",
      },
    },
  );
  if (gen.status !== 0) {
    process.exit(gen.status ?? 1);
  }

  const copy = spawnSync(process.execPath, [copyScript], {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  });
  if (copy.status !== 0) {
    process.exit(copy.status ?? 1);
  }
}

main();
