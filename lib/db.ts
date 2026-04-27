import { Prisma, PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { Pool, neonConfig } from "@neondatabase/serverless";
import WebSocket from "ws";
import { resolveDatabaseUrlForPrisma } from "@/lib/database-url";

declare global {
  var prismaClient: PrismaClient | undefined;
  /**
   * Fingerprint from current @prisma/client DMMF — recycle singleton after `prisma generate` so new models
   * (e.g. DigitalPoolSeatReward) are not missing on a stale global client (User-only fingerprint missed those).
   */
  var __prismaSchemaFingerprint: string | undefined;
  /** One reconnect attempt when `digitalPoolSeatReward` delegate is missing (stale singleton / partial copy on Windows). */
  var __prismaSeatRewardRefreshAttempted: boolean | undefined;
}

/** Detect stale global PrismaClient after schema/HMR (new models/tables or field changes). */
function getPrismaSchemaFingerprint(): string {
  try {
    const models = Prisma.dmmf.datamodel.models
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((m) => {
        const fields = m.fields
          .map((f) => f.name)
          .sort()
          .join(",");
        return `${m.name}:${fields}`;
      });
    return models.join("\0");
  } catch {
    return "";
  }
}

function clientHasAdminRole(client: PrismaClient): boolean {
  return typeof (client as unknown as { adminRole?: { create: unknown } }).adminRole?.create === "function";
}

/** Pool L1 wallet credit uses this delegate; stale globals sometimes omit it after `prisma generate`. */
function clientHasDigitalPoolSeatReward(client: PrismaClient): boolean {
  return (
    typeof (client as unknown as { digitalPoolSeatReward?: { findMany: unknown } }).digitalPoolSeatReward
      ?.findMany === "function"
  );
}

function warnIfVercelUsesLocalDatabaseUrl(url: string) {
  if (process.env.VERCEL !== "1") return;
  if (url.includes("127.0.0.1") || url.includes("localhost")) {
    console.error(
      "[db] DATABASE_URL uses localhost on Vercel — the build cannot reach your PC. Use a hosted Postgres URL (Neon, Supabase, etc.).",
    );
  }
}

/**
 * On Vercel, raw TCP to Neon `:5432` often fails (`Can't reach database server`).
 * Neon + Prisma: use serverless driver (WebSockets) via `@prisma/adapter-neon`.
 * Set `PRISMA_NEON_ADAPTER=0` to force classic TCP Prisma (e.g. debugging).
 */
function createPrismaClient(): PrismaClient {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("Missing DATABASE_URL environment variable");
  }
  warnIfVercelUsesLocalDatabaseUrl(url);

  const resolved = resolveDatabaseUrlForPrisma(url);

  const useNeonWs =
    process.env.PRISMA_NEON_ADAPTER !== "0" &&
    process.env.VERCEL === "1" &&
    /neon\.tech/i.test(resolved);

  const log: ("error" | "warn")[] =
    process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"];

  if (useNeonWs) {
    neonConfig.webSocketConstructor = WebSocket;
    const pool = new Pool({ connectionString: resolved });
    const adapter = new PrismaNeon(pool);
    return new PrismaClient({ adapter, log });
  }

  return new PrismaClient({
    datasources: {
      db: {
        url: resolved,
      },
    },
    log,
  });
}

export function getDb() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("Missing DATABASE_URL environment variable");
  }

  const fingerprint = getPrismaSchemaFingerprint();
  if (
    fingerprint &&
    global.prismaClient &&
    global.__prismaSchemaFingerprint !== fingerprint
  ) {
    void global.prismaClient.$disconnect().catch(() => undefined);
    global.prismaClient = undefined;
    global.__prismaSchemaFingerprint = undefined;
    global.__prismaSeatRewardRefreshAttempted = undefined;
  }

  if (!global.prismaClient) {
    global.prismaClient = createPrismaClient();
    global.__prismaSchemaFingerprint = fingerprint || global.__prismaSchemaFingerprint;
  } else if (!clientHasAdminRole(global.prismaClient)) {
    void global.prismaClient.$disconnect().catch(() => undefined);
    global.prismaClient = createPrismaClient();
    global.__prismaSchemaFingerprint = fingerprint || global.__prismaSchemaFingerprint;
    global.__prismaSeatRewardRefreshAttempted = undefined;
  }

  if (
    !clientHasDigitalPoolSeatReward(global.prismaClient) &&
    !global.__prismaSeatRewardRefreshAttempted
  ) {
    global.__prismaSeatRewardRefreshAttempted = true;
    void global.prismaClient.$disconnect().catch(() => undefined);
    global.prismaClient = createPrismaClient();
    global.__prismaSchemaFingerprint = fingerprint || global.__prismaSchemaFingerprint;
  }

  if (!clientHasAdminRole(global.prismaClient)) {
    throw new Error(
      "Prisma client has no AdminRole model. Run: npx prisma generate — then restart npm run dev.",
    );
  }

  // Do not throw when `digitalPoolSeatReward` is missing — Digital Pool tree should still load; reward sync shows a warning.

  return global.prismaClient;
}
