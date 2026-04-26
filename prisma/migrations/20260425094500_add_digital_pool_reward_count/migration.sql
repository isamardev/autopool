-- Add digitalPoolRewardGrantedCount to track multiple $100 rewards per user
-- (own position completion + each funded entry completion each grant $100)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "digitalPoolRewardGrantedCount" INTEGER NOT NULL DEFAULT 0;

-- Backfill: existing users who already received 1 reward (digitalPoolL1RewardGrantedAt is set)
UPDATE "User" SET "digitalPoolRewardGrantedCount" = 1 WHERE "digitalPoolL1RewardGrantedAt" IS NOT NULL AND "digitalPoolRewardGrantedCount" = 0;
