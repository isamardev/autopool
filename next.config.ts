import type { NextConfig } from "next";
import path from "node:path";

/** Run `npm run dev` from the repo root. Pins tracing when multiple lockfiles exist up-tree. */
const projectRoot = path.resolve(process.cwd());

/**
 * Temp distDir only when `NEXT_USE_TEMP_DIST=1` (set by `npm run dev` on Windows).
 * `next build` / `next start` always use the default `.next` in the repo so they never disagree.
 * Vercel must not use a custom distDir (broken `tsconfig` includes).
 */
function distDirWindowsTempDevOnly(): string | undefined {
  if (process.env.VERCEL === "1") {
    return undefined;
  }
  /**
   * `next build` / `next start` run with `NODE_ENV=production`. A temp `distDir` breaks generated
   * `types/` + TypeScript (cannot resolve `next/dist/...`). Also ignore if `NEXT_USE_TEMP_DIST=1`
   * leaked from the dev environment into a production build.
   */
  if (process.env.NODE_ENV === "production") {
    return undefined;
  }
  if (process.env.NEXT_USE_TEMP_DIST !== "1") {
    return undefined;
  }
  if (process.platform !== "win32") {
    return undefined;
  }
  const localAppData = process.env.LOCALAPPDATA;
  if (!localAppData) {
    return undefined;
  }
  const tempAbs = path.join(localAppData, "Temp", "mlm-marketing-next");
  // Must be relative to the project root. An absolute `distDir` gets joined with `cwd` inside
  // Next/webpack and becomes `repo\C:\Users\...` on Windows (ENOENT on mkdir).
  const rel = path.relative(projectRoot, tempAbs);
  if (!rel || path.isAbsolute(rel)) {
    return undefined;
  }
  return rel;
}

const distDir = distDirWindowsTempDevOnly();

/**
 * Dev-only: Next 16 blocks cross-origin requests to `/_next/*` by default (security).
 * Include hostname-only + full origin — some Next versions match one or the other.
 * LAN testing: set `ALLOWED_DEV_ORIGINS=http://192.168.1.10:3000` in `.env.local`.
 */
const allowedDevOrigins = [
  "localhost",
  "127.0.0.1",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://[::1]:3000",
  ...(process.env.ALLOWED_DEV_ORIGINS?.split(",")
    .map((s) => s.trim())
    .filter(Boolean) ?? []),
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  allowedDevOrigins,
  /**
   * Do not list `@prisma/adapter-neon`, `@neondatabase/serverless`, or `ws`: externals bypass
   * webpack aliases and runtime resolution from a temp `distDir` can fail on Windows.
   * Bundle real `ws` (direct dependency) so viem/isows and `lib/db.ts` resolve correctly.
   */
  serverExternalPackages: ["@prisma/client"],
  ...(distDir ? { distDir } : {}),
  outputFileTracingRoot: projectRoot,
  /** Polling helps file watchers on Windows (slow/locked drives, Defender). */
  watchOptions: {
    pollIntervalMs: 1000,
  },
  experimental: {
    /**
     * The ⨯ in the dev console only means these flags are off — not errors.
     * They are Windows/local workarounds; Vercel production does not use `next dev` or these dev toggles.
     */
    /** Windows: `<distDir>/lock` acquisition can fail with ENOENT; skip when a single dev instance is used. */
    lockDistDir: false,
    /**
     * Next 16 defaults this on; the MCP dev endpoint can hang startup on some Windows setups
     * (console stuck after "✓ Starting...", HTTP never accepts).
     */
    mcpServer: false,
    /** Use `.next` for dev without `/dev` subfolder — fewer EPERM unlink errors on Windows. */
    isolatedDevBuild: false,
  },
  /** `npm run dev` uses webpack — silence optional wallet SDK deps that slow resolution */
  webpack: (config, { isServer }) => {
    if (isServer && process.env.VERCEL !== "1") {
      /**
       * Local `node_modules` often lacks Neon packages if `package-lock.json` is stale or
       * `npm install` was skipped — but `lib/db.ts` only uses them when `VERCEL=1` + Neon URL.
       * Alias to stubs so dev/build works; Vercel production keeps real packages (VERCEL=1).
       */
      const stub = (file: string) => path.join(projectRoot, "lib", "stubs", file);
      config.resolve.alias = {
        ...config.resolve.alias,
        "@prisma/adapter-neon": stub("prisma-adapter-neon.ts"),
        "@neondatabase/serverless": stub("neondatabase-serverless.ts"),
      };
    }
    if (!isServer) {
      /**
       * Prisma resolves `index-browser.js` → `.prisma/client/index-browser.js`. If postinstall
       * copy was incomplete (Windows EPERM), the file is missing and webpack ENOENTs. Never bundle
       * real Prisma in the browser.
       */
      config.resolve.alias = {
        ...config.resolve.alias,
        "@prisma/client": path.join(projectRoot, "lib", "stubs", "prisma-client-browser.js"),
        "@react-native-async-storage/async-storage": false,
        "pino-pretty": false,
      };
    }
    return config;
  },
};

export default nextConfig;
