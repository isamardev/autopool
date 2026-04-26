import { Prisma, PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { Pool, neonConfig } from "@neondatabase/serverless";
import WebSocket from "ws";
import { resolveDatabaseUrlForPrisma } from "@/lib/database-url";

declare global {
  var prismaClient: PrismaClient | undefined;
  /** Fingerprint of User model fields from current @prisma/client — recycle singleton after `prisma generate`. */
  var __prismaUserModelFingerprint: string | undefined;
}

/** Detect stale global PrismaClient after schema/HMR (old instance rejects new `select` fields). */
function getUserModelFieldFingerprint(): string {
  try {
    const user = Prisma.dmmf.datamodel.models.find((m) => m.name === "User");
    if (!user) return "";
    return user.fields
      .map((f) => f.name)
      .sort()
      .join("\0");
  } catch {
    return "";
  }
}

function clientHasAdminRole(client: PrismaClient): boolean {
  return typeof (client as unknown as { adminRole?: { create: unknown } }).adminRole?.create === "function";
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

  const fingerprint = getUserModelFieldFingerprint();
  if (
    fingerprint &&
    global.prismaClient &&
    global.__prismaUserModelFingerprint !== fingerprint
  ) {
    void global.prismaClient.$disconnect().catch(() => undefined);
    global.prismaClient = undefined;
    global.__prismaUserModelFingerprint = undefined;
  }

  if (!global.prismaClient) {
    global.prismaClient = createPrismaClient();
    global.__prismaUserModelFingerprint = fingerprint || global.__prismaUserModelFingerprint;
  } else if (!clientHasAdminRole(global.prismaClient)) {
    void global.prismaClient.$disconnect().catch(() => undefined);
    global.prismaClient = createPrismaClient();
    global.__prismaUserModelFingerprint = fingerprint || global.__prismaUserModelFingerprint;
  }

  if (!clientHasAdminRole(global.prismaClient)) {
    throw new Error(
      "Prisma client has no AdminRole model. Run: npx prisma generate — then restart npm run dev.",
    );
  }

  return global.prismaClient;
}
