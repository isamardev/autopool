-- CreateTable
CREATE TABLE "DigitalPoolSeatReward" (
    "seatNodeId" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DigitalPoolSeatReward_pkey" PRIMARY KEY ("seatNodeId")
);

-- CreateIndex
CREATE INDEX "DigitalPoolSeatReward_ownerUserId_idx" ON "DigitalPoolSeatReward"("ownerUserId");

-- CreateIndex
CREATE INDEX "DigitalPoolSeatReward_grantedAt_idx" ON "DigitalPoolSeatReward"("grantedAt");

-- AddForeignKey
ALTER TABLE "DigitalPoolSeatReward" ADD CONSTRAINT "DigitalPoolSeatReward_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
