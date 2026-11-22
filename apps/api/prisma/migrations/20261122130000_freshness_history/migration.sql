CREATE TABLE "FreshnessSnapshot" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "assetId" UUID NOT NULL,
  "snapshotDate" DATE NOT NULL,
  "status" VARCHAR(16) NOT NULL,
  "ageMinutes" INTEGER,
  "targetMinutes" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FreshnessSnapshot_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FreshnessSnapshot_organizationId_assetId_snapshotDate_key"
  ON "FreshnessSnapshot"("organizationId", "assetId", "snapshotDate");
CREATE INDEX "FreshnessSnapshot_organizationId_snapshotDate_idx"
  ON "FreshnessSnapshot"("organizationId", "snapshotDate");
ALTER TABLE "FreshnessSnapshot" ADD CONSTRAINT "FreshnessSnapshot_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FreshnessSnapshot" ADD CONSTRAINT "FreshnessSnapshot_assetId_fkey"
  FOREIGN KEY ("assetId") REFERENCES "DataAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
