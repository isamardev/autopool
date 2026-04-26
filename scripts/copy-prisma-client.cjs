"use strict";

/**
 * Copy `generated/prisma-client` → `node_modules/.prisma/client` (real files; no symlink).
 *
 * Windows: `query_engine-windows.dll.node` is often locked by a running Node process (`next dev`).
 * Full `fs.rmSync` / `fs.cpSync` on the folder then fails with EPERM / EPIPE.
 * We retry deletes, then fall back to per-file copy (overwrites unlocked files; skips locked binaries with a warning).
 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const src = path.join(root, "generated", "prisma-client");
const dest = path.join(root, "node_modules", ".prisma", "client");

function sleepMs(ms) {
  try {
    if (process.platform === "win32") {
      execSync(`powershell -NoProfile -Command "Start-Sleep -Milliseconds ${ms}"`, { stdio: "ignore" });
    } else {
      execSync(`sleep ${Math.ceil(ms / 1000)}`, { stdio: "ignore" });
    }
  } catch {
    /* ignore */
  }
}

function tryRemoveDestDir() {
  if (!fs.existsSync(dest)) return true;
  const max = 6;
  for (let i = 0; i < max; i++) {
    try {
      fs.rmSync(dest, { recursive: true, force: true });
      return true;
    } catch (e) {
      const code = e && e.code;
      const retryable = code === "EPERM" || code === "EBUSY" || code === "EACCES";
      if (retryable && i < max - 1) {
        console.warn(
          `[copy-prisma-client] Could not remove old client (${code}), retry ${i + 1}/${max - 1} — close \`next dev\` if this persists.`,
        );
        sleepMs(700);
        continue;
      }
      if (retryable) {
        console.warn(
          "[copy-prisma-client] Folder is locked; merging files in place (stop `next dev` if Prisma still errors).",
        );
        return false;
      }
      throw e;
    }
  }
  return false;
}

/** Merge-copy file by file — works when the destination folder cannot be removed (Windows DLL lock). */
function copyMergeFileByFile(srcDir, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  const names = fs.readdirSync(srcDir, { withFileTypes: true });
  for (const ent of names) {
    const s = path.join(srcDir, ent.name);
    const d = path.join(destDir, ent.name);
    if (ent.isDirectory()) {
      copyMergeFileByFile(s, d);
    } else {
      try {
        fs.copyFileSync(s, d);
      } catch (e) {
        const code = e && e.code;
        if (code === "EPERM" || code === "EBUSY" || code === "EACCES" || code === "EPIPE") {
          console.warn("[copy-prisma-client] skip locked file (close Node processes and rebuild):", ent.name);
        } else {
          throw e;
        }
      }
    }
  }
}

function main() {
  if (!fs.existsSync(src)) {
    console.error("copy-prisma-client: missing", src, "— run npx prisma generate first.");
    process.exit(1);
  }

  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const removed = tryRemoveDestDir();

  if (removed || !fs.existsSync(dest)) {
    try {
      fs.cpSync(src, dest, { recursive: true, force: true });
    } catch (e) {
      console.warn("[copy-prisma-client] cpSync failed, trying file-by-file merge:", e && e.message ? e.message : e);
      copyMergeFileByFile(src, dest);
    }
  } else {
    copyMergeFileByFile(src, dest);
  }

  /** Ensure Prisma browser shim exists — webpack may resolve it even for server-only apps. */
  const critical = ["index-browser.js", "default.js", "index.js"];
  let fixed = 0;
  for (const name of critical) {
    const d = path.join(dest, name);
    const s = path.join(src, name);
    if (!fs.existsSync(d) && fs.existsSync(s)) {
      try {
        fs.copyFileSync(s, d);
        fixed += 1;
      } catch (e) {
        console.error("[copy-prisma-client] failed to restore", name, e && e.message ? e.message : e);
        process.exit(1);
      }
    }
    if (!fs.existsSync(d)) {
      console.error(
        "[copy-prisma-client] missing required file after copy:",
        name,
        "— run prisma generate, close processes locking node_modules/.prisma, retry.",
      );
      process.exit(1);
    }
  }
  if (fixed > 0) {
    console.log("[copy-prisma-client] restored", fixed, "missing file(s) into", dest);
  }

  console.log("copy-prisma-client: copied to", dest);
}

main();
