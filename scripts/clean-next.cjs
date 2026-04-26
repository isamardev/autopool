"use strict";

/**
 * Remove Next.js output: repo `.next` and (Windows dev) temp `distDir` from next.config.ts
 * (`%LOCALAPPDATA%\Temp\mlm-marketing-next`). Stale temp chunks cause MODULE_NOT_FOUND / __webpack_modules__ errors.
 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

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

function rm(p) {
  const max = 6;
  for (let i = 0; i < max; i++) {
    try {
      if (!fs.existsSync(p)) {
        console.log("[clean-next] (missing)", p);
        return;
      }
      fs.rmSync(p, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      console.log("[clean-next] removed", p);
      return;
    } catch (e) {
      const code = e && e.code;
      const retryable = code === "ENOTEMPTY" || code === "EBUSY" || code === "EPERM" || code === "EACCES";
      if (retryable && i < max - 1) {
        console.warn(`[clean-next] retry ${i + 1}/${max - 1} (${code}) — stop \`next dev\` if this keeps failing:`, p);
        sleepMs(500);
        continue;
      }
      console.warn("[clean-next] skip", p, e && e.message ? e.message : e);
      return;
    }
  }
}

const root = path.resolve(__dirname, "..");
rm(path.join(root, ".next"));

if (process.platform === "win32" && process.env.LOCALAPPDATA) {
  rm(path.join(process.env.LOCALAPPDATA, "Temp", "mlm-marketing-next"));
}
