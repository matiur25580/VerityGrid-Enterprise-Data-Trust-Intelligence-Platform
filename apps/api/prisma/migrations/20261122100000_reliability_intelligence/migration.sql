ALTER TABLE "DataAsset" ADD COLUMN "lastObservedAt" TIMESTAMP(3);
CREATE TABLE "FreshnessPolicy" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "assetId" UUID NOT NULL,
  "targetMinutes" INTEGER NOT NULL,
  "warnAtPercent" INTEGER NOT NULL DEFAULT 80,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FreshnessPolicy_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FreshnessPolicy_assetId_key" ON "FreshnessPolicy"("assetId");
CREATE UNIQUE INDEX "FreshnessPolicy_organizationId_assetId_key" ON "FreshnessPolicy"("organizationId","assetId");
CREATE INDEX "FreshnessPolicy_organizationId_targetMinutes_idx" ON "FreshnessPolicy"("organizationId","targetMinutes");
ALTER TABLE "FreshnessPolicy" ADD CONSTRAINT "FreshnessPolicy_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "DataAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GovernanceApproval" ADD COLUMN "actionType" VARCHAR(60);
ALTER TABLE "GovernanceApproval" ADD COLUMN "actionPayload" JSONB;
ALTER TABLE "GovernanceApproval" ADD COLUMN "executedAt" TIMESTAMP(3);
