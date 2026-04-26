-- Digital Pool: separate withdraw wallet + L1 reward idempotency + withdrawal source flag
ALTER TABLE "User" ADD COLUMN "digitalPoolWithdrawBalance" DECIMAL(18,2) DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "digitalPoolL1RewardGrantedAt" TIMESTAMP(3);

ALTER TABLE "Withdrawal" ADD COLUMN "digitalPoolSource" BOOLEAN NOT NULL DEFAULT false;
