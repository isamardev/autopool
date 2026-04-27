"use strict";

/**
 * `prisma migrate deploy` with Neon-friendly behavior:
 * - Uses DIRECT_DATABASE_URL (see ensure-direct-database-url.cjs)
 * - On first failure, runs release-prisma-advisory-locks.sql then retries (stuck P1002)
 * - Retries with backoff for cold-start / transient lock contention
 */
const { spawnSync } = require("child_process");
const path = require("path");
const { preparePrismaEnv } = require("./ensure-direct-database-url.cjs");

const root = path.resolve(__dirname, "..");
const prismaCli = path.join(root, "node_modules", "prisma", "build", "index.js");
const schema = path.join(root, "prisma", "schema.prisma");
const releaseSql = path.join(root, "scripts", "sql", "release-prisma-advisory-locks.sql");

function runPrisma(args) {
  return spawnSync(process.execPath, [prismaCli, ...args, "--schema", schema], {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  });
}

function sleepMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  preparePrismaEnv(root);

  if (!process.env.DATABASE_URL) {
    console.error("[migrate-deploy] Missing DATABASE_URL.");
    process.exit(1);
  }
  if (!process.env.DIRECT_DATABASE_URL) {
    console.error("[migrate-deploy] Missing DIRECT_DATABASE_URL after prepare.");
    console.error("  → Use this script (it derives direct URL from Neon pooled DATABASE_URL): npm run db:migrate:deploy");
    console.error("  → Do not use raw `npx prisma migrate deploy` unless DIRECT_DATABASE_URL is set in .env.");
    process.exit(1);
  }

  console.log("[migrate-deploy] migrate uses directUrl for advisory locks (Neon non-pooler host).");
  const maxAttempts = 5;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const r = runPrisma(["migrate", "deploy"]);
    if (r.status === 0) {
      process.exit(0);
    }

    console.error(`[migrate-deploy] attempt ${attempt}/${maxAttempts} failed (exit ${r.status ?? "null"}).`);

    if (attempt === 1) {
      console.error("[migrate-deploy] Releasing stuck advisory-lock sessions (safe on dedicated DB)…");
      const ex = runPrisma(["db", "execute", "--file", releaseSql]);
      if (ex.status !== 0) {
        console.error("[migrate-deploy] db execute (unlock) failed — you can run: npm run db:migrate:unlock");
      }
    }

    if (attempt < maxAttempts) {
      const wait = 8000 + attempt * 4000;
      console.error(`[migrate-deploy] waiting ${wait / 1000}s before retry…`);
      await sleepMs(wait);
    }
  }

  console.error("[migrate-deploy] Giving up.");
  console.error("  P1002 (lock): npm run db:migrate:unlock  then retry.");
  console.error("  P3009 (failed migration in history): DB already has the change →");
  console.error('    node scripts/prisma-env.cjs migrate resolve --applied MIGRATION_FOLDER_NAME');
  console.error("  P3018 (already exists): same — usually --applied after verifying schema.");
  process.exit(1);
}

main();
