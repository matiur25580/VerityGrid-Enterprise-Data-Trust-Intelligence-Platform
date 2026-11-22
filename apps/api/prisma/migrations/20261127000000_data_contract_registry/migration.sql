CREATE TYPE "ContractStatus" AS ENUM ('DRAFT', 'ACTIVE', 'RETIRED');
CREATE TYPE "ContractCompatibilityMode" AS ENUM ('BACKWARD', 'STRICT');
CREATE TYPE "ContractCompatibilityStatus" AS ENUM ('COMPATIBLE', 'WARNING', 'INCOMPATIBLE');

CREATE TABLE "DataContract" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "assetId" UUID NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "description" TEXT,
  "ownerName" VARCHAR(120) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "status" "ContractStatus" NOT NULL DEFAULT 'DRAFT',
  "compatibilityMode" "ContractCompatibilityMode" NOT NULL DEFAULT 'BACKWARD',
  "schemaSnapshot" JSONB NOT NULL DEFAULT '[]',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DataContract_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DataContract_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "DataContract_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "DataAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "DataContract_organizationId_assetId_version_key" ON "DataContract"("organizationId", "assetId", "version");
CREATE INDEX "DataContract_organizationId_assetId_status_idx" ON "DataContract"("organizationId", "assetId", "status");

CREATE TABLE "DataContractEvaluation" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "contractId" UUID NOT NULL,
  "status" "ContractCompatibilityStatus" NOT NULL,
  "result" JSONB NOT NULL,
  "evaluatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DataContractEvaluation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DataContractEvaluation_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "DataContract"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "DataContractEvaluation_organizationId_contractId_evaluatedAt_idx" ON "DataContractEvaluation"("organizationId", "contractId", "evaluatedAt");
