/**
 * Dev/local webpack alias target — real `@prisma/adapter-neon` is only used when
 * `VERCEL=1` and Neon URL (see `lib/db.ts`). Install the real package for local Neon tests.
 */
export class PrismaNeon {
  constructor(_pool: unknown) {}
}
