-- CreateEnum
CREATE TYPE "PaymentOrderFlow" AS ENUM ('ONE_TIME', 'AUTOPAY_SETUP', 'AUTOPAY_CHARGE');

-- CreateEnum
CREATE TYPE "PaymentMandateStatus" AS ENUM (
    'PENDING_SETUP',
    'ACTIVE',
    'PAUSED',
    'REVOKED',
    'FAILED'
);

-- AlterTable
ALTER TABLE "PaymentOrder"
ADD COLUMN "flow" "PaymentOrderFlow" NOT NULL DEFAULT 'ONE_TIME',
ADD COLUMN "mandateId" TEXT;

-- CreateTable
CREATE TABLE "PaymentMandate" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "setupOrderId" TEXT,
    "provider" "PaymentProvider" NOT NULL DEFAULT 'PHONEPE',
    "merchantSubscriptionId" TEXT NOT NULL,
    "providerSubscriptionId" TEXT,
    "status" "PaymentMandateStatus" NOT NULL DEFAULT 'PENDING_SETUP',
    "amountPaise" INTEGER NOT NULL,
    "intervalUnit" TEXT NOT NULL DEFAULT 'MONTH',
    "intervalCount" INTEGER NOT NULL DEFAULT 1,
    "startsAt" TIMESTAMP(3),
    "nextChargeAt" TIMESTAMP(3),
    "lastChargedAt" TIMESTAMP(3),
    "pausedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentMandate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PaymentOrder_mandateId_idx" ON "PaymentOrder"("mandateId");

-- CreateIndex
CREATE INDEX "PaymentOrder_flow_idx" ON "PaymentOrder"("flow");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentMandate_setupOrderId_key" ON "PaymentMandate"("setupOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentMandate_merchantSubscriptionId_key" ON "PaymentMandate"("merchantSubscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentMandate_providerSubscriptionId_key" ON "PaymentMandate"("providerSubscriptionId");

-- CreateIndex
CREATE INDEX "PaymentMandate_userId_status_idx" ON "PaymentMandate"("userId", "status");

-- CreateIndex
CREATE INDEX "PaymentMandate_nextChargeAt_status_idx" ON "PaymentMandate"("nextChargeAt", "status");

-- CreateIndex
CREATE INDEX "PaymentMandate_planId_idx" ON "PaymentMandate"("planId");

-- AddForeignKey
ALTER TABLE "PaymentOrder"
ADD CONSTRAINT "PaymentOrder_mandateId_fkey"
FOREIGN KEY ("mandateId") REFERENCES "PaymentMandate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentMandate"
ADD CONSTRAINT "PaymentMandate_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentMandate"
ADD CONSTRAINT "PaymentMandate_planId_fkey"
FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentMandate"
ADD CONSTRAINT "PaymentMandate_setupOrderId_fkey"
FOREIGN KEY ("setupOrderId") REFERENCES "PaymentOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
