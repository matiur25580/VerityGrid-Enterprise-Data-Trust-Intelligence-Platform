CREATE TYPE "IncidentSeverity" AS ENUM ('LOW','MEDIUM','HIGH','CRITICAL');
CREATE TYPE "IncidentStatus" AS ENUM ('OPEN','ACKNOWLEDGED','RESOLVED','CLOSED');
CREATE TYPE "PolicyType" AS ENUM ('CLASSIFICATION_CHANGE','DATA_ACCESS','RETENTION');
CREATE TYPE "ApprovalDecision" AS ENUM ('PENDING','APPROVED','REJECTED');
CREATE TABLE "Incident" ("id" UUID NOT NULL,"organizationId" UUID NOT NULL,"sourceKey" VARCHAR(180) NOT NULL,"title" VARCHAR(180) NOT NULL,"description" TEXT,"severity" "IncidentSeverity" NOT NULL,"status" "IncidentStatus" NOT NULL DEFAULT 'OPEN',"assetId" UUID,"createdBy" UUID NOT NULL,"assigneeId" UUID,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL,CONSTRAINT "Incident_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "Incident_organizationId_sourceKey_key" ON "Incident"("organizationId","sourceKey");
CREATE INDEX "Incident_organizationId_status_severity_createdAt_idx" ON "Incident"("organizationId","status","severity","createdAt");
CREATE TABLE "IncidentEvent" ("id" UUID NOT NULL,"organizationId" UUID NOT NULL,"incidentId" UUID NOT NULL,"actorId" UUID NOT NULL,"eventType" VARCHAR(40) NOT NULL,"detail" VARCHAR(1000) NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "IncidentEvent_pkey" PRIMARY KEY ("id"));
CREATE INDEX "IncidentEvent_organizationId_incidentId_createdAt_idx" ON "IncidentEvent"("organizationId","incidentId","createdAt");
ALTER TABLE "IncidentEvent" ADD CONSTRAINT "IncidentEvent_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE TABLE "GovernancePolicy" ("id" UUID NOT NULL,"organizationId" UUID NOT NULL,"name" VARCHAR(160) NOT NULL,"description" TEXT,"policyType" "PolicyType" NOT NULL,"requiresApproval" BOOLEAN NOT NULL DEFAULT true,"createdBy" UUID NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "GovernancePolicy_pkey" PRIMARY KEY ("id"));
CREATE INDEX "GovernancePolicy_organizationId_createdAt_idx" ON "GovernancePolicy"("organizationId","createdAt");
CREATE TABLE "GovernanceApproval" ("id" UUID NOT NULL,"organizationId" UUID NOT NULL,"policyId" UUID NOT NULL,"requestedBy" UUID NOT NULL,"decision" "ApprovalDecision" NOT NULL DEFAULT 'PENDING',"comment" VARCHAR(1000),"decidedBy" UUID,"decidedAt" TIMESTAMP(3),"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "GovernanceApproval_pkey" PRIMARY KEY ("id"));
CREATE INDEX "GovernanceApproval_organizationId_decision_createdAt_idx" ON "GovernanceApproval"("organizationId","decision","createdAt");
ALTER TABLE "GovernanceApproval" ADD CONSTRAINT "GovernanceApproval_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "GovernancePolicy"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE TABLE "AuditEvent" ("id" UUID NOT NULL,"organizationId" UUID NOT NULL,"actorId" UUID NOT NULL,"action" VARCHAR(80) NOT NULL,"entityType" VARCHAR(80) NOT NULL,"entityId" VARCHAR(180) NOT NULL,"metadata" JSONB NOT NULL DEFAULT '{}',"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id"));
CREATE INDEX "AuditEvent_organizationId_createdAt_idx" ON "AuditEvent"("organizationId","createdAt");
CREATE INDEX "AuditEvent_organizationId_entityType_entityId_idx" ON "AuditEvent"("organizationId","entityType","entityId");

ALTER TABLE "QualityRun" ADD COLUMN "jobKey" VARCHAR(180);
CREATE UNIQUE INDEX "QualityRun_jobKey_key" ON "QualityRun"("jobKey");
ALTER TABLE "IncidentEvent" ADD COLUMN "sourceKey" VARCHAR(180);
CREATE UNIQUE INDEX "IncidentEvent_sourceKey_key" ON "IncidentEvent"("sourceKey");

ALTER TABLE "AuditEvent" ADD COLUMN "sourceKey" VARCHAR(180);
CREATE UNIQUE INDEX "AuditEvent_sourceKey_key" ON "AuditEvent"("sourceKey");

ALTER TABLE "GovernanceApproval" ADD COLUMN "requestDescription" VARCHAR(4000) NOT NULL DEFAULT 'Review requested';
