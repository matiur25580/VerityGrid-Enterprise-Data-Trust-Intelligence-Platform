import { Queue, Worker, Job } from "bullmq";
import IORedis from "ioredis";
import { isIP } from "node:net";

export type IncidentNotification = {
  organizationId: string;
  incidentId: string;
  severity: string;
  eventKey: string;
};
type NotificationJob = IncidentNotification;

const connection = new IORedis(process.env.REDIS_URL ?? "redis://127.0.0.1:6379", { maxRetriesPerRequest: null, enableReadyCheck: true });
export const notificationQueue = new Queue<NotificationJob>("veritygrid-incident-notifications", {
  connection,
  defaultJobOptions: { attempts: 6, backoff: { type: "exponential", delay: 5000 }, removeOnComplete: { age: 604800, count: 5000 }, removeOnFail: false },
});

function webhookConfiguration() {
  const raw = process.env.INCIDENT_WEBHOOK_URL?.trim();
  if (!raw) return null;
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error("INCIDENT_WEBHOOK_URL must be a valid HTTPS URL"); }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || url.username || url.password || !host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || isIP(host) !== 0) {
    throw new Error("INCIDENT_WEBHOOK_URL must use HTTPS and a public DNS hostname");
  }
  return { url: url.toString(), token: process.env.INCIDENT_WEBHOOK_TOKEN?.trim() };
}

export async function enqueueIncidentNotification(event: IncidentNotification) {
  if (!process.env.INCIDENT_WEBHOOK_URL?.trim()) return { queued: false, provider: "disabled" as const };
  webhookConfiguration();
  const job = await notificationQueue.add("incident-created-or-escalated", event, {
    jobId: [event.organizationId, event.incidentId, event.eventKey].join("_").replace(/[^a-zA-Z0-9_-]/g, "_"),
  });
  return { queued: true, provider: "https-webhook" as const, jobId: job.id };
}

async function deliver(job: Job<NotificationJob>) {
  const config = webhookConfiguration();
  if (!config) throw new Error("INCIDENT_WEBHOOK_NOT_CONFIGURED");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(config.url, {
      method: "POST",
      redirect: "error",
      headers: { "content-type": "application/json", ...(config.token ? { authorization: `Bearer ${config.token}` } : {}), "idempotency-key": String(job.id) },
      body: JSON.stringify({ event: "veritygrid.incident", eventKey: job.data.eventKey, organizationId: job.data.organizationId, incidentId: job.data.incidentId, severity: job.data.severity, occurredAt: new Date().toISOString() }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`INCIDENT_WEBHOOK_HTTP_${response.status}`);
    return { delivered: true, provider: "https-webhook" };
  } finally { clearTimeout(timeout); }
}

export function startNotificationWorker() {
  const configured = Number(process.env.NOTIFICATION_WORKER_CONCURRENCY ?? 4);
  const concurrency = Number.isInteger(configured) ? Math.max(1, Math.min(16, configured)) : 4;
  const worker = new Worker<NotificationJob>("veritygrid-incident-notifications", deliver, { connection, concurrency });
  worker.on("failed", (job, error) => {
    if (job) console.error("Incident notification delivery failed", { jobId: job.id, attemptsMade: job.attemptsMade, errorCode: error.message.slice(0, 80) });
  });
  return worker;
}

export async function closeNotificationQueue() { await notificationQueue.close(); await connection.quit(); }
