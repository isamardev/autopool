"use strict";

/**
 * Prisma `migrate` uses advisory locks; Neon **pooler** (`-pooler` host) often times out (P1002).
 * Schema uses `directUrl` for migrations; runtime queries still use pooled `DATABASE_URL`.
 *
 * If `DIRECT_DATABASE_URL` is unset: derive from pooled Neon URL by stripping `-pooler.` from the
 * hostname, or fall back to the same string as `DATABASE_URL` (local Postgres).
 */
const fs = require("fs");
const path = require("path");

function loadDotenv(root) {
  const envPath = path.join(root, ".env");
  if (!fs.existsSync(envPath)) return;
  const text = fs.readFileSync(envPath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i <= 0) continue;
    const key = t.slice(0, i).trim();
    let val = t.slice(i + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = val;
    }
  }
}

function deriveNeonDirectUrl(databaseUrl) {
  const raw = String(databaseUrl || "").trim();
  if (!raw) return null;
  try {
    const normalized = raw.replace(/^postgres(ql)?\+/i, "postgresql:");
    const u = new URL(normalized.includes("://") ? normalized : `postgresql://${normalized}`);
    if (!/neon\.tech/i.test(u.hostname)) return null;
    if (!/-pooler\./i.test(u.hostname)) return null;
    u.hostname = u.hostname.replace(/-pooler\./i, ".");
    return u.toString();
  } catch {
    return null;
  }
}

/** Longer connect timeout + no pgbouncer on direct session (migrate / db execute). */
function applyMigrateHintsToDirectUrl(urlStr) {
  const raw = String(urlStr || "").trim();
  if (!raw) return raw;
  try {
    const normalized = raw.replace(/^postgres(ql)?\+/i, "postgresql:");
    const u = new URL(normalized.includes("://") ? normalized : `postgresql://${normalized}`);
    u.searchParams.delete("pgbouncer");
    if (!u.searchParams.has("connect_timeout")) {
      u.searchParams.set("connect_timeout", "60");
    }
    if (/neon\.tech/i.test(u.hostname) && !u.searchParams.has("sslmode")) {
      u.searchParams.set("sslmode", "require");
    }
    return u.toString();
  } catch {
    return raw;
  }
}

function ensureDirectDatabaseUrl() {
  const explicit = String(process.env.DIRECT_DATABASE_URL || "").trim();
  const db = String(process.env.DATABASE_URL || "").trim();

  if (explicit) {
    process.env.DIRECT_DATABASE_URL = applyMigrateHintsToDirectUrl(explicit);
    return;
  }

  if (!db) return;

  const derived = deriveNeonDirectUrl(db);
  const base = derived || db;
  process.env.DIRECT_DATABASE_URL = applyMigrateHintsToDirectUrl(base);
}

function preparePrismaEnv(root) {
  loadDotenv(root);
  ensureDirectDatabaseUrl();
}

module.exports = { loadDotenv, ensureDirectDatabaseUrl, preparePrismaEnv };
