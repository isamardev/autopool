"use strict";

/**
 * Full production build with visible steps (easier to see where Windows "hangs").
 */
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const prismaSetup = path.join(root, "scripts", "prisma-setup.cjs");
const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");

function run(title, execPath, args) {
  console.log("\n[build]", title, "…\n");
  const r = spawnSync(execPath, args, {
    cwd: root,
    stdio: "inherit",
    env: {
      ...process.env,
      CI: process.env.CI || "1",
      /** Windows dev may set `NEXT_USE_TEMP_DIST=1` globally — never for `next build` (breaks TS + types). */
      NEXT_USE_TEMP_DIST: "0",
    },
  });
  if (r.status !== 0) {
    console.error("\n[build] FAILED at:", title);
    process.exit(r.status ?? 1);
  }
}

function main() {
  if (!fs.existsSync(prismaSetup)) {
    console.error("[build] Missing scripts/prisma-setup.cjs");
    process.exit(1);
  }
  if (process.env.SKIP_PRISMA_SETUP === "1") {
    console.log("\n[build] SKIP_PRISMA_SETUP=1 — skipping Prisma (only use if generate already succeeded).\n");
  } else {
    run("Prisma setup (generate + copy)", process.execPath, [prismaSetup]);
  }

  if (!fs.existsSync(nextBin)) {
    console.error("[build] Missing Next.js. Run: npm install");
    process.exit(1);
  }
  run("Next.js webpack build", process.execPath, [nextBin, "build", "--webpack"]);
  console.log("\n[build] Done.\n");
}

main();
