"use strict";

/**
 * Run Prisma CLI with Neon-safe env: sets DIRECT_DATABASE_URL before migrate / introspection.
 * Usage: node scripts/prisma-env.cjs migrate deploy
 *        node scripts/prisma-env.cjs migrate status
 */
const { spawnSync } = require("child_process");
const path = require("path");
const { preparePrismaEnv } = require("./ensure-direct-database-url.cjs");

const root = path.resolve(__dirname, "..");
const prismaCli = path.join(root, "node_modules", "prisma", "build", "index.js");
const schema = path.join(root, "prisma", "schema.prisma");

preparePrismaEnv(root);

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("Usage: node scripts/prisma-env.cjs <prisma-args…>  e.g. migrate deploy");
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error("[prisma-env] Missing DATABASE_URL (set in .env or environment).");
  process.exit(1);
}
if (!process.env.DIRECT_DATABASE_URL) {
  console.error("[prisma-env] Missing DIRECT_DATABASE_URL after prepare (unexpected).");
  process.exit(1);
}

const r = spawnSync(process.execPath, [prismaCli, ...args, "--schema", schema], {
  cwd: root,
  stdio: "inherit",
  env: process.env,
});

process.exit(r.status === null ? 1 : r.status);
