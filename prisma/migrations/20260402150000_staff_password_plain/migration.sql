-- Super-admin display copy of staff /role login password (auth still uses passwordHash).
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "staffPasswordPlain" TEXT;
