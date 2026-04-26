-- PlatformFund: tracks 90% / 10% split of the 10% withdrawal fee (not MLM admin commission)
CREATE TABLE IF NOT EXISTS "PlatformFund" (
    "id" TEXT NOT NULL,
    "charityTotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "feePoolTotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformFund_pkey" PRIMARY KEY ("id")
);
