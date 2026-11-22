import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { authenticate, requireRoles, requireTenant } from "../middleware/authenticate";

export const reliabilityRouter = Router();
reliabilityRouter.use(authenticate, requireTenant);
const writer = requireRoles("OWNER", "ADMIN", "DATA_STEWARD", "DATA_ENGINEER");
const admin = requireRoles("OWNER", "ADMIN");
const uuid = z.string().uuid();
const classification = z.enum(["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED"]);

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : value instanceof Date ? value.toISOString() : String(value);
  const safe = /^[\\s]*[=+\\-@]/.test(text) ? "'" + text : text;
  return '"' + safe.replace(/"/g, '""') + '"';
}
function freshnessStatus(lastObservedAt: Date | null, targetMinutes: number, warnAtPercent: number, now: Date) {
  if (!lastObservedAt) return { status: "UNKNOWN", ageMinutes: null, targetMinutes };
  const ageMinutes = Math.max(0, Math.floor((now.getTime() - lastObservedAt.getTime()) / 60000));
  const status = ageMinutes > targetMinutes ? "BREACHED" : ageMinutes >= targetMinutes * warnAtPercent / 100 ? "AT_RISK" : "HEALTHY";
  return { status, ageMinutes, targetMinutes };
}

reliabilityRouter.get("/freshness", async (req, res, next) => {
  try {
    const assets = await prisma.dataAsset.findMany({
      where: { organizationId: req.tenant!.organizationId },
      select: { id: true, name: true, fullyQualifiedName: true, lastObservedAt: true, freshnessPolicy: true },
      orderBy: { name: "asc" }, take: 500,
    });
    const now = new Date();
    const items = assets.map(asset => ({
      assetId: asset.id, name: asset.name, fullyQualifiedName: asset.fullyQualifiedName,
      lastObservedAt: asset.lastObservedAt,
      policy: asset.freshnessPolicy ? { id: asset.freshnessPolicy.id, targetMinutes: asset.freshnessPolicy.targetMinutes, warnAtPercent: asset.freshnessPolicy.warnAtPercent } : null,
      ...(asset.freshnessPolicy ? freshnessStatus(asset.lastObservedAt, asset.freshnessPolicy.targetMinutes, asset.freshnessPolicy.warnAtPercent, now) : { status: "UNCONFIGURED", ageMinutes: null, targetMinutes: null }),
    }));
    res.json({ data: { items, evaluatedAt: now.toISOString(), counts: {
      healthy: items.filter(x => x.status === "HEALTHY").length,
      atRisk: items.filter(x => x.status === "AT_RISK").length,
      breached: items.filter(x => x.status === "BREACHED").length,
      unknown: items.filter(x => x.status === "UNKNOWN" || x.status === "UNCONFIGURED").length,
    } } });
  } catch (error) { next(error); }
});

reliabilityRouter.post("/freshness/policies", writer, async (req, res, next) => {
  try {
    const body = z.object({
      assetId: uuid, targetMinutes: z.number().int().min(5).max(525600),
      warnAtPercent: z.number().int().min(10).max(95).default(80),
    }).safeParse(req.body);
    if (!body.success) { res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Provide an asset, freshness target (5–525600 minutes), and warning threshold." } }); return; }
    const organizationId = req.tenant!.organizationId;
    const asset = await prisma.dataAsset.findFirst({ where: { id: body.data.assetId, organizationId }, select: { id: true } });
    if (!asset) { res.status(404).json({ error: { code: "ASSET_NOT_FOUND", message: "Dataset not found in this workspace." } }); return; }
    const policy = await prisma.freshnessPolicy.upsert({
      where: { organizationId_assetId: { organizationId, assetId: asset.id } },
      create: { organizationId, assetId: asset.id, targetMinutes: body.data.targetMinutes, warnAtPercent: body.data.warnAtPercent },
      update: { targetMinutes: body.data.targetMinutes, warnAtPercent: body.data.warnAtPercent },
    });
    res.status(201).json({ data: { policy } });
  } catch (error) { next(error); }
});

reliabilityRouter.get("/analytics", async (req, res, next) => {
  try {
    const organizationId = req.tenant!.organizationId;
    const [assetCount, runCount, runAggregate, incidentGroups, freshnessAssets] = await Promise.all([
      prisma.dataAsset.count({ where: { organizationId } }),
      prisma.qualityRun.count({ where: { organizationId } }),
      prisma.qualityRun.aggregate({ where: { organizationId, score: { not: null } }, _avg: { score: true } }),
      prisma.incident.groupBy({ by: ["status"], where: { organizationId }, _count: { _all: true } }),
      prisma.dataAsset.findMany({ where: { organizationId, freshnessPolicy: { isNot: null } }, select: { lastObservedAt: true, freshnessPolicy: { select: { targetMinutes: true, warnAtPercent: true } } }, take: 1000 }),
    ]);
    const now = new Date();
    const freshness = freshnessAssets.map(a => freshnessStatus(a.lastObservedAt, a.freshnessPolicy!.targetMinutes, a.freshnessPolicy!.warnAtPercent, now));
    res.json({ data: { generatedAt: now.toISOString(), assets: assetCount, qualityRuns: runCount,
      averageQualityScore: runAggregate._avg.score === null ? null : Number(runAggregate._avg.score.toFixed(2)),
      incidentsByStatus: Object.fromEntries(incidentGroups.map(g => [g.status, g._count._all])),
      freshness: { monitored: freshness.length, healthy: freshness.filter(x => x.status === "HEALTHY").length, atRisk: freshness.filter(x => x.status === "AT_RISK").length, breached: freshness.filter(x => x.status === "BREACHED").length, unknown: freshness.filter(x => x.status === "UNKNOWN").length },
    } });
  } catch (error) { next(error); }
});


reliabilityRouter.get("/analytics/trends", async (req, res, next) => {
  try {
    const parsed = z.coerce.number().int().min(7).max(90).default(30).safeParse(req.query.days);
    if (!parsed.success) { res.status(400).json({ error: { code: "INVALID_TREND_WINDOW", message: "Choose a trend window from 7 to 90 days." } }); return; }
    const organizationId = req.tenant!.organizationId;
    const days = parsed.data;
    const end = new Date();
    end.setUTCHours(0, 0, 0, 0);
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - (days - 1));
    const through = new Date(end);
    through.setUTCDate(through.getUTCDate() + 1);
    const [qualityRows, incidentRows, freshnessRows] = await Promise.all([
      prisma.$queryRaw<Array<{ day: Date; runs: number; failedRuns: number; averageScore: number | null }>>(Prisma.sql`
        SELECT date_trunc('day', "executedAt") AS day,
          COUNT(*)::int AS runs,
          COUNT(*) FILTER (WHERE "failedCount" > 0)::int AS "failedRuns",
          ROUND(AVG(score)::numeric, 2)::float8 AS "averageScore"
        FROM "QualityRun"
        WHERE "organizationId" = ${organizationId}::uuid AND "executedAt" >= ${start} AND "executedAt" < ${through}
        GROUP BY date_trunc('day', "executedAt") ORDER BY day ASC
      `),
      prisma.$queryRaw<Array<{ day: Date; incidents: number; highSeverity: number }>>(Prisma.sql`
        SELECT date_trunc('day', "createdAt") AS day,
          COUNT(*)::int AS incidents,
          COUNT(*) FILTER (WHERE severity IN ('HIGH','CRITICAL'))::int AS "highSeverity"
        FROM "Incident"
        WHERE "organizationId" = ${organizationId}::uuid AND "createdAt" >= ${start} AND "createdAt" < ${through}
        GROUP BY date_trunc('day', "createdAt") ORDER BY day ASC
      `),
      prisma.$queryRaw<Array<{ day: Date; monitored: number; healthy: number; atRisk: number; breached: number; unknown: number }>>(Prisma.sql`
        SELECT "snapshotDate" AS day, COUNT(*)::int AS monitored,
          COUNT(*) FILTER (WHERE status = 'HEALTHY')::int AS healthy,
          COUNT(*) FILTER (WHERE status = 'AT_RISK')::int AS "atRisk",
          COUNT(*) FILTER (WHERE status = 'BREACHED')::int AS breached,
          COUNT(*) FILTER (WHERE status = 'UNKNOWN')::int AS unknown
        FROM "FreshnessSnapshot"
        WHERE "organizationId" = ${organizationId}::uuid AND "snapshotDate" >= ${start} AND "snapshotDate" < ${through}
        GROUP BY "snapshotDate" ORDER BY "snapshotDate" ASC
      `),
    ]);
    const quality = new Map(qualityRows.map(row => [new Date(row.day).toISOString().slice(0, 10), row]));
    const incident = new Map(incidentRows.map(row => [new Date(row.day).toISOString().slice(0, 10), row]));
    const freshness = new Map(freshnessRows.map(row => [new Date(row.day).toISOString().slice(0, 10), row]));
    const series = Array.from({ length: days }, (_, index) => {
      const date = new Date(start);
      date.setUTCDate(start.getUTCDate() + index);
      const key = date.toISOString().slice(0, 10);
      const q = quality.get(key);
      const i = incident.get(key);
      const f = freshness.get(key);
      return { date: key, qualityRuns: q?.runs ?? 0, failedRuns: q?.failedRuns ?? 0, averageQualityScore: q?.averageScore ?? null, incidentsCreated: i?.incidents ?? 0, highSeverityIncidents: i?.highSeverity ?? 0, freshnessMonitored: f?.monitored ?? 0, freshnessHealthy: f?.healthy ?? 0, freshnessAtRisk: f?.atRisk ?? 0, freshnessBreached: f?.breached ?? 0, freshnessUnknown: f?.unknown ?? 0 };
    });
    res.json({ data: { generatedAt: new Date().toISOString(), windowDays: days, from: start.toISOString(), through: through.toISOString(), source: "persisted-records", series } });
  } catch (error) { next(error); }
});

reliabilityRouter.get("/exports", async (req, res, next) => {
  try {
    const type = z.enum(["quality-runs", "freshness"]).safeParse(req.query.type);
    if (!type.success) { res.status(400).json({ error: { code: "INVALID_EXPORT", message: "Choose quality-runs or freshness." } }); return; }
    const organizationId = req.tenant!.organizationId;
    let rows: unknown[] = [];
    let headers: string[] = [];
    if (type.data === "quality-runs") {
      const runs = await prisma.qualityRun.findMany({ where: { organizationId }, select: { id: true, assetId: true, score: true, passedCount: true, failedCount: true, skippedCount: true, executedAt: true }, orderBy: { executedAt: "desc" }, take: 1000 });
      headers = ["run_id","asset_id","score","passed_count","failed_count","skipped_count","executed_at"];
      rows = runs.map(r => [r.id,r.assetId,r.score,r.passedCount,r.failedCount,r.skippedCount,r.executedAt]);
    } else {
      const assets = await prisma.dataAsset.findMany({ where: { organizationId }, select: { id: true, name: true, lastObservedAt: true, freshnessPolicy: { select: { targetMinutes: true, warnAtPercent: true } } }, orderBy: { name: "asc" }, take: 1000 });
      headers = ["asset_id","asset_name","last_observed_at","freshness_status","age_minutes","target_minutes"];
      const now = new Date();
      rows = assets.map(a => { const status = a.freshnessPolicy ? freshnessStatus(a.lastObservedAt,a.freshnessPolicy.targetMinutes,a.freshnessPolicy.warnAtPercent,now) : {status:"UNCONFIGURED",ageMinutes:null,targetMinutes:null}; return [a.id,a.name,a.lastObservedAt,status.status,status.ageMinutes,status.targetMinutes]; });
    }
    const csv = [headers, ...(rows as unknown[][])].map(row => row.map(csvCell).join(",")).join("\r\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="veritygrid-${type.data}-${new Date().toISOString().slice(0,10)}.csv"`);
    res.send(csv);
  } catch (error) { next(error); }
});

reliabilityRouter.get("/assistant/insights", async (req, res, next) => {
  try {
    const organizationId = req.tenant!.organizationId;
    const [runs, incidents, assets] = await Promise.all([
      prisma.qualityRun.findMany({ where: { organizationId }, include: { asset: { select: { name: true } } }, orderBy: { executedAt: "desc" }, take: 20 }),
      prisma.incident.findMany({ where: { organizationId, status: { in: ["OPEN","ACKNOWLEDGED"] } }, select: { id: true, title: true, severity: true, status: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 20 }),
      prisma.dataAsset.findMany({ where: { organizationId }, select: { id: true, name: true, lastObservedAt: true, freshnessPolicy: { select: { targetMinutes: true, warnAtPercent: true } } }, take: 500 }),
    ]);
    const now = new Date();
    const evidence: Array<{ id: string; type: string; label: string; observedAt: string; facts: Record<string, unknown> }> = [];
    const insights: Array<{ severity: string; title: string; explanation: string; evidenceIds: string[]; recommendation: string }> = [];
    for (const run of runs.filter(r => r.failedCount > 0).slice(0,5)) {
      const id = "quality-run:"+run.id;
      evidence.push({ id, type: "QUALITY_RUN", label: run.asset.name, observedAt: run.executedAt.toISOString(), facts: { failedCount: run.failedCount, passedCount: run.passedCount, skippedCount: run.skippedCount, score: run.score } });
      insights.push({ severity: run.failedCount >= 3 ? "HIGH" : "MEDIUM", title: "Recent quality checks failed", explanation: `${run.failedCount} validation check(s) failed for ${run.asset.name} in the recorded run.`, evidenceIds: [id], recommendation: "Review the failed rule results and confirm whether the source data or expectation changed." });
    }
    for (const incident of incidents.slice(0,5)) {
      const id = "incident:"+incident.id;
      evidence.push({ id, type: "INCIDENT", label: incident.title, observedAt: incident.createdAt.toISOString(), facts: { severity: incident.severity, status: incident.status } });
      insights.push({ severity: incident.severity, title: "Incident remains active", explanation: `The incident “${incident.title}” is ${incident.status.toLowerCase()}.`, evidenceIds: [id], recommendation: "Review the incident event history and assign an accountable workspace member." });
    }
    for (const asset of assets) {
      if (!asset.freshnessPolicy) continue;
      const status = freshnessStatus(asset.lastObservedAt,asset.freshnessPolicy.targetMinutes,asset.freshnessPolicy.warnAtPercent,now);
      if (status.status !== "BREACHED" && status.status !== "AT_RISK") continue;
      const id = "freshness:"+asset.id;
      evidence.push({ id, type: "FRESHNESS", label: asset.name, observedAt: now.toISOString(), facts: { status: status.status, ageMinutes: status.ageMinutes, targetMinutes: status.targetMinutes, lastObservedAt: asset.lastObservedAt?.toISOString() ?? null } });
      insights.push({ severity: status.status === "BREACHED" ? "HIGH" : "MEDIUM", title: status.status === "BREACHED" ? "Freshness target breached" : "Freshness target approaching", explanation: asset.lastObservedAt ? `${asset.name} was last observed ${status.ageMinutes} minute(s) ago against a ${status.targetMinutes}-minute target.` : `${asset.name} has no recorded observation timestamp.`, evidenceIds: [id], recommendation: "Verify the source refresh schedule and record a new successful ingestion observation." });
    }
    res.json({ data: { generatedAt: now.toISOString(), mode: "evidence-rules-v1", insights: insights.slice(0,20), evidence } });
  } catch (error) { next(error); }
});

reliabilityRouter.post("/actions/classification", writer, async (req, res, next) => {
  try {
    const body = z.object({ assetId: uuid, policyId: uuid, classification, reason: z.string().trim().min(8).max(1000) }).safeParse(req.body);
    if (!body.success) { res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Provide an asset, policy, target classification and reason." } }); return; }
    const organizationId = req.tenant!.organizationId;
    const [asset, policy] = await Promise.all([
      prisma.dataAsset.findFirst({ where: { id: body.data.assetId, organizationId }, select: { id: true, classification: true, name: true } }),
      prisma.governancePolicy.findFirst({ where: { id: body.data.policyId, organizationId, policyType: "CLASSIFICATION_CHANGE", requiresApproval: true }, select: { id: true } }),
    ]);
    if (!asset || !policy) { res.status(404).json({ error: { code: "ACTION_TARGET_NOT_FOUND", message: "A matching asset and approval policy are required in this workspace." } }); return; }
    if (asset.classification === body.data.classification) { res.status(409).json({ error: { code: "NO_CLASSIFICATION_CHANGE", message: "The asset already has this classification." } }); return; }
    const approval = await prisma.$transaction(async tx => {
      const created = await tx.governanceApproval.create({ data: {
      organizationId, policyId: policy.id, requestedBy: req.auth!.userId,
      requestDescription: body.data.reason, decision: "PENDING",
      actionType: "SET_CLASSIFICATION",
      actionPayload: { assetId: asset.id, targetClassification: body.data.classification, previousClassification: asset.classification } as Prisma.InputJsonValue,
    } });
      await tx.auditEvent.create({ data: { organizationId, actorId: req.auth!.userId, action: "CLASSIFICATION_CHANGE_REQUESTED", entityType: "GovernanceApproval", entityId: created.id, metadata: { assetId: asset.id, targetClassification: body.data.classification } } });
      return created;
    });
    res.status(202).json({ data: { approvalId: approval.id, state: approval.decision, assetName: asset.name } });
  } catch (error) { next(error); }
});

reliabilityRouter.post("/actions/:approvalId/execute", admin, async (req, res, next) => {
  try {
    const approvalId = uuid.safeParse(req.params.approvalId);
    if (!approvalId.success) { res.status(400).json({ error: { code: "INVALID_APPROVAL_ID", message: "Approval ID must be a UUID." } }); return; }
    const organizationId = req.tenant!.organizationId;
    const approval = await prisma.governanceApproval.findFirst({ where: { id: approvalId.data, organizationId, decision: "APPROVED", executedAt: null, actionType: "SET_CLASSIFICATION" } });
    if (!approval || !approval.actionPayload || typeof approval.actionPayload !== "object" || Array.isArray(approval.actionPayload)) { res.status(409).json({ error: { code: "ACTION_NOT_APPROVED", message: "No approved, unexecuted classification action exists." } }); return; }
    const payload = approval.actionPayload as Record<string, unknown>;
    const parsed = z.object({ assetId: uuid, targetClassification: classification, previousClassification: classification }).safeParse(payload);
    if (!parsed.success) { res.status(409).json({ error: { code: "INVALID_ACTION_PAYLOAD", message: "The approved action payload is invalid." } }); return; }
    await prisma.$transaction(async tx => {
      const updated = await tx.governanceApproval.updateMany({ where: { id: approval.id, organizationId, decision: "APPROVED", executedAt: null }, data: { executedAt: new Date() } });
      if (updated.count !== 1) throw new Error("APPROVAL_ALREADY_EXECUTED");
      const asset = await tx.dataAsset.updateMany({ where: { id: parsed.data.assetId, organizationId, classification: parsed.data.previousClassification }, data: { classification: parsed.data.targetClassification } });
      if (asset.count !== 1) throw new Error("ASSET_CHANGED_SINCE_APPROVAL");
      await tx.auditEvent.create({ data: { organizationId, actorId: req.auth!.userId, action: "APPROVED_CLASSIFICATION_CHANGE_EXECUTED", entityType: "DataAsset", entityId: parsed.data.assetId, metadata: { approvalId: approval.id, targetClassification: parsed.data.targetClassification } } });
    });
    res.json({ data: { approvalId: approval.id, executed: true } });
  } catch (error: any) {
    if (error?.message === "APPROVAL_ALREADY_EXECUTED" || error?.message === "ASSET_CHANGED_SINCE_APPROVAL") { res.status(409).json({ error: { code: error.message, message: "The approved action is no longer executable; review the asset state and submit a new request." } }); return; }
    next(error);
  }
});
