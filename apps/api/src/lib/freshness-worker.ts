import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import { prisma } from "./prisma";
import { notificationProvider } from "./notifications";

const connection = new IORedis(process.env.REDIS_URL ?? "redis://127.0.0.1:6379", { maxRetriesPerRequest: null, enableReadyCheck: true });
const queue = new Queue("veritygrid-freshness-sla", { connection, defaultJobOptions: { attempts: 3, backoff: { type: "exponential", delay: 5000 }, removeOnComplete: { age: 86400, count: 200 }, removeOnFail: false } });
const SYSTEM_ACTOR_ID = "00000000-0000-4000-8000-000000000001";
const WARNING_PERCENT = 80;
const PAGE_SIZE = 500;

function evaluate(lastObservedAt: Date | null, targetMinutes: number, warnAtPercent: number, now: Date) {
  if (!lastObservedAt) return "UNKNOWN" as const;
  const ageMinutes = Math.max(0, (now.getTime() - lastObservedAt.getTime()) / 60000);
  if (ageMinutes > targetMinutes) return "BREACHED" as const;
  if (ageMinutes >= targetMinutes * warnAtPercent / 100) return "AT_RISK" as const;
  return "HEALTHY" as const;
}

/** One bounded, tenant-aware pass. Repeated ticks update the same incident instead of creating duplicates. */
export async function processFreshnessEvaluation(now = new Date()) {
  let evaluated = 0, opened = 0, recovered = 0;
  let cursor: string | undefined;
  for (;;) {
    const policies = await prisma.freshnessPolicy.findMany({
      take: PAGE_SIZE, ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: "asc" },
      select: { id: true, organizationId: true, assetId: true, targetMinutes: true, warnAtPercent: true,
        asset: { select: { name: true, lastObservedAt: true } } },
    });
    if (!policies.length) break;
    for (const policy of policies) {
      evaluated++;
      const state = evaluate(policy.asset.lastObservedAt, policy.targetMinutes, policy.warnAtPercent, now);
      const sourceKey = "freshness:" + policy.assetId;
      const nextStatus = state === "BREACHED" || state === "AT_RISK" ? "OPEN" : "RESOLVED";
      const severity = state === "BREACHED" ? "HIGH" : "MEDIUM";
      const transition = await prisma.$transaction(async tx => {
        const existing = await tx.incident.findUnique({ where: { organizationId_sourceKey: { organizationId: policy.organizationId, sourceKey } } });
        if (state === "UNKNOWN") return { changed: false, incidentId: null as string | null, created: false };
        if (!existing && nextStatus === "RESOLVED") return { changed: false, incidentId: null as string | null, created: false };
        if (!existing) {
          const incident = await tx.incident.create({ data: { organizationId: policy.organizationId, sourceKey, title: state === "BREACHED" ? "Dataset freshness SLA breached" : "Dataset freshness at risk", description: policy.asset.name + " has not been observed within its configured freshness objective.", severity, status: "OPEN", assetId: policy.assetId, createdBy: SYSTEM_ACTOR_ID } });
          await tx.incidentEvent.create({ data: { organizationId: policy.organizationId, incidentId: incident.id, actorId: SYSTEM_ACTOR_ID, eventType: "FRESHNESS_SLA_BREACHED", detail: "Scheduled freshness evaluation opened a " + state.toLowerCase() + " incident." } });
          await tx.auditEvent.create({ data: { organizationId: policy.organizationId, actorId: SYSTEM_ACTOR_ID, action: "FRESHNESS_INCIDENT_CREATED", entityType: "Incident", entityId: incident.id, metadata: { assetId: policy.assetId, state, evaluatedAt: now.toISOString() } } });
          return { changed: true, incidentId: incident.id, created: true };
        }
        const changed = existing.status !== nextStatus || (nextStatus === "OPEN" && existing.severity !== severity);
        if (!changed) return { changed: false, incidentId: existing.id, created: false };
        await tx.incident.update({ where: { id: existing.id }, data: { status: nextStatus, severity, title: state === "BREACHED" ? "Dataset freshness SLA breached" : state === "AT_RISK" ? "Dataset freshness at risk" : existing.title } });
        await tx.incidentEvent.create({ data: { organizationId: policy.organizationId, incidentId: existing.id, actorId: SYSTEM_ACTOR_ID, eventType: nextStatus === "OPEN" ? "FRESHNESS_SLA_ESCALATED" : "FRESHNESS_SLA_RECOVERED", detail: nextStatus === "OPEN" ? "Scheduled freshness evaluation detected " + state.toLowerCase() + " status." : "Dataset freshness returned within its configured objective." } });
        await tx.auditEvent.create({ data: { organizationId: policy.organizationId, actorId: SYSTEM_ACTOR_ID, action: nextStatus === "OPEN" ? "FRESHNESS_INCIDENT_UPDATED" : "FRESHNESS_INCIDENT_RECOVERED", entityType: "Incident", entityId: existing.id, metadata: { assetId: policy.assetId, state, evaluatedAt: now.toISOString() } } });
        return { changed: true, incidentId: existing.id, created: false };
      });
      if (transition.changed && transition.incidentId) {
        if (nextStatus === "OPEN") {
          opened++;
          if (transition.created || severity === "HIGH") await notificationProvider.incidentCreated({ organizationId: policy.organizationId, incidentId: transition.incidentId, severity });
        } else recovered++;
      }
    }
    cursor = policies[policies.length - 1].id;
    if (policies.length < PAGE_SIZE) break;
  }
  return { evaluated, opened, recovered, evaluatedAt: now.toISOString() };
}

export async function scheduleFreshnessEvaluation() {
  const intervalMs = Math.max(60000, Number(process.env.FRESHNESS_SCHEDULE_INTERVAL_MS ?? 300000));
  await queue.upsertJobScheduler("freshness-sla-five-minute", { every: intervalMs }, { name: "evaluate-freshness-sla", data: {} });
}
export function startFreshnessWorker() {
  return new Worker("veritygrid-freshness-sla", () => processFreshnessEvaluation(), { connection, concurrency: 1 });
}
export async function closeFreshnessWorker() { await queue.close(); await connection.quit(); }
