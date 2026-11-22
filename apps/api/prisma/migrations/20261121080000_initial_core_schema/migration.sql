CREATE TYPE "OrganizationStatus" AS ENUM ('ACTIVE', 'SUSPENDED');
CREATE TYPE "MembershipRole" AS ENUM ('OWNER', 'ADMIN', 'DATA_STEWARD', 'DATA_ENGINEER', 'ANALYST', 'VIEWER');
CREATE TYPE "DataSourceType" AS ENUM ('POSTGRESQL', 'CSV', 'JSON');
CREATE TYPE "DataClassification" AS ENUM ('PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED');
CREATE TYPE "QualityRuleType" AS ENUM ('MIN_ROW_COUNT', 'COLUMN_EXISTS', 'NOT_NULL', 'MAX_NULL_PERCENT', 'UNIQUE');

CREATE TABLE "Organization" (
  "id" UUID NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "slug" VARCHAR(80) NOT NULL,
  "status" "OrganizationStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");
CREATE INDEX "Organization_status_createdAt_idx" ON "Organization"("status", "createdAt");

CREATE TABLE "User" (
  "id" UUID NOT NULL,
  "email" VARCHAR(254) NOT NULL,
  "passwordHash" VARCHAR(255) NOT NULL,
  "displayName" VARCHAR(120) NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

CREATE TABLE "Session" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "tokenHash" VARCHAR(64) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");
CREATE INDEX "Session_userId_expiresAt_idx" ON "Session"("userId", "expiresAt");
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "Membership" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "role" "MembershipRole" NOT NULL DEFAULT 'VIEWER',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Membership_organizationId_userId_key" ON "Membership"("organizationId", "userId");
CREATE INDEX "Membership_userId_role_idx" ON "Membership"("userId", "role");
CREATE INDEX "Membership_organizationId_role_idx" ON "Membership"("organizationId", "role");
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "DataSource" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "sourceType" "DataSourceType" NOT NULL,
  "description" TEXT,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DataSource_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DataSource_organizationId_name_key" ON "DataSource"("organizationId", "name");
CREATE INDEX "DataSource_organizationId_sourceType_createdAt_idx" ON "DataSource"("organizationId", "sourceType", "createdAt");
ALTER TABLE "DataSource" ADD CONSTRAINT "DataSource_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "DataAsset" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "sourceId" UUID,
  "name" VARCHAR(180) NOT NULL,
  "fullyQualifiedName" VARCHAR(512) NOT NULL,
  "description" TEXT,
  "assetType" VARCHAR(40) NOT NULL,
  "ownerName" VARCHAR(120),
  "classification" "DataClassification" NOT NULL DEFAULT 'INTERNAL',
  "rowCount" INTEGER,
  "schema" JSONB NOT NULL DEFAULT '[]',
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DataAsset_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DataAsset_organizationId_fullyQualifiedName_key" ON "DataAsset"("organizationId", "fullyQualifiedName");
CREATE INDEX "DataAsset_organizationId_assetType_createdAt_idx" ON "DataAsset"("organizationId", "assetType", "createdAt");
CREATE INDEX "DataAsset_organizationId_name_idx" ON "DataAsset"("organizationId", "name");
CREATE INDEX "DataAsset_organizationId_classification_idx" ON "DataAsset"("organizationId", "classification");
ALTER TABLE "DataAsset" ADD CONSTRAINT "DataAsset_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DataAsset" ADD CONSTRAINT "DataAsset_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "DataSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "QualityRule" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "assetId" UUID NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "description" TEXT,
  "ruleType" "QualityRuleType" NOT NULL,
  "params" JSONB NOT NULL DEFAULT '{}',
  "version" INTEGER NOT NULL DEFAULT 1,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "QualityRule_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "QualityRule_assetId_name_version_key" ON "QualityRule"("assetId", "name", "version");
CREATE INDEX "QualityRule_organizationId_assetId_isActive_idx" ON "QualityRule"("organizationId", "assetId", "isActive");
ALTER TABLE "QualityRule" ADD CONSTRAINT "QualityRule_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QualityRule" ADD CONSTRAINT "QualityRule_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "DataAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "QualityRun" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "assetId" UUID NOT NULL,
  "score" DOUBLE PRECISION,
  "passedCount" INTEGER NOT NULL,
  "failedCount" INTEGER NOT NULL,
  "skippedCount" INTEGER NOT NULL,
  "results" JSONB NOT NULL,
  "executedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QualityRun_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "QualityRun_organizationId_assetId_executedAt_idx" ON "QualityRun"("organizationId", "assetId", "executedAt");
ALTER TABLE "QualityRun" ADD CONSTRAINT "QualityRun_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QualityRun" ADD CONSTRAINT "QualityRun_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "DataAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "LineageEdge" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "upstreamAssetId" UUID NOT NULL,
  "downstreamAssetId" UUID NOT NULL,
  "relationship" VARCHAR(40) NOT NULL DEFAULT 'DERIVES_FROM',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LineageEdge_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "LineageEdge_organizationId_upstreamAssetId_downstreamAssetId_key" ON "LineageEdge"("organizationId", "upstreamAssetId", "downstreamAssetId");
CREATE INDEX "LineageEdge_organizationId_upstreamAssetId_idx" ON "LineageEdge"("organizationId", "upstreamAssetId");
CREATE INDEX "LineageEdge_organizationId_downstreamAssetId_idx" ON "LineageEdge"("organizationId", "downstreamAssetId");
ALTER TABLE "LineageEdge" ADD CONSTRAINT "LineageEdge_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LineageEdge" ADD CONSTRAINT "LineageEdge_upstreamAssetId_fkey" FOREIGN KEY ("upstreamAssetId") REFERENCES "DataAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LineageEdge" ADD CONSTRAINT "LineageEdge_downstreamAssetId_fkey" FOREIGN KEY ("downstreamAssetId") REFERENCES "DataAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
