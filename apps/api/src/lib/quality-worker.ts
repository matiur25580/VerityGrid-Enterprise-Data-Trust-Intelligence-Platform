import { Worker, Queue, QueueEvents, JobsOptions } from "bullmq";
import IORedis from "ioredis";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

const connection = new IORedis(process.env.REDIS_URL ?? "redis://127.0.0.1:6379", { maxRetriesPerRequest: null, enableReadyCheck: true });
export const qualityQueue = new Queue("veritygrid-quality", { connection, defaultJobOptions: { attempts: 4, backoff: { type: "exponential", delay: 2000 }, removeOnComplete: { age: 86400, count: 1000 }, removeOnFail: false } });
export const qualityQueueEvents = new QueueEvents("veritygrid-quality", { connection });

type ValidationJob = { organizationId: string; assetId: string; requestedBy: string; requestKey: string };
function object(value: Prisma.JsonValue): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export async function processQualityJob(data: ValidationJob) {
  const asset = await prisma.dataAsset.findFirst({ where: { id: data.assetId, organizationId: data.organizationId } });
  if (!asset) throw new Error("DATASET_NOT_FOUND");
  const rules = await prisma.qualityRule.findMany({ where: { organizationId: data.organizationId, assetId: asset.id, isActive: true }, orderBy: { name: "asc" } });
  const schema = Array.isArray(asset.schema) ? asset.schema as unknown as Array<Record<string, unknown>> : [];
  const metadata = object(asset.metadata);
  const stats = Array.isArray(metadata.columnStats) ? metadata.columnStats as Array<Record<string, unknown>> : [];
  const results = rules.map(rule => {
    const params = object(rule.params); const column = typeof params.column === "string" ? params.column : "";
    const field = schema.find(item => item.name === column); const stat = stats.find(item => item.name === column);
    let status: "PASSED" | "FAILED" | "SKIPPED" = "SKIPPED"; let observed: unknown = null; let expected: unknown = null; let detail = "Required profiling evidence is unavailable.";
    if (rule.ruleType === "MIN_ROW_COUNT") { expected=params.minimum; observed=asset.rowCount; if(asset.rowCount!==null && typeof params.minimum==="number"){status=asset.rowCount>=params.minimum?"PASSED":"FAILED";detail="Row-count threshold evaluated.";}}
    if (rule.ruleType === "COLUMN_EXISTS") { expected=column; observed=field?column:null; status=field?"PASSED":"FAILED"; detail=field?"Column exists.":"Column is missing."; }
    if (rule.ruleType === "NOT_NULL" && field && typeof stat?.nullCount==="number") { expected=0; observed=stat.nullCount; status=stat.nullCount===0?"PASSED":"FAILED"; detail="Null-count threshold evaluated."; }
    if (rule.ruleType === "MAX_NULL_PERCENT" && field && typeof stat?.nullCount==="number" && typeof stat.nonNullCount==="number" && typeof params.maxPercent==="number") { const total=stat.nullCount+stat.nonNullCount; observed=total?Number((stat.nullCount/total*100).toFixed(2)):0; expected=params.maxPercent; status=Number(observed)<=params.maxPercent?"PASSED":"FAILED"; detail="Null-rate threshold evaluated."; }
    if (rule.ruleType === "UNIQUE" && field && typeof stat?.distinctCount==="number" && typeof stat.nonNullCount==="number") { observed={distinctCount:stat.distinctCount,nonNullCount:stat.nonNullCount}; expected="distinctCount equals nonNullCount"; status=stat.distinctCount===stat.nonNullCount?"PASSED":"FAILED"; detail="Uniqueness evaluated from import aggregates."; }
    return {ruleId:rule.id,name:rule.name,version:rule.version,ruleType:rule.ruleType,status,observed,expected,detail};
  });
  const passedCount=results.filter(x=>x.status==="PASSED").length, failedCount=results.filter(x=>x.status==="FAILED").length, skippedCount=results.filter(x=>x.status==="SKIPPED").length;
  const evaluated=passedCount+failedCount, score=evaluated?Number((passedCount/evaluated*100).toFixed(2)):null;
  const run=await prisma.qualityRun.create({data:{organizationId:data.organizationId,assetId:asset.id,score,passedCount,failedCount,skippedCount,results:results as unknown as Prisma.InputJsonValue}});
  if(failedCount>0) await prisma.incident.upsert({where:{organizationId_sourceKey:{organizationId:data.organizationId,sourceKey:"quality:"+run.id}},create:{organizationId:data.organizationId,sourceKey:"quality:"+run.id,title:"Data quality validation failed",description:`${failedCount} quality rule(s) failed for ${asset.name}.`,severity:failedCount>=3?"HIGH":"MEDIUM",status:"OPEN",assetId:asset.id,createdBy:data.requestedBy},update:{}});
  return {runId:run.id,passedCount,failedCount,skippedCount};
}

export function startQualityWorker() {
  const worker = new Worker<ValidationJob>("veritygrid-quality", job => processQualityJob(job.data), { connection, concurrency: Number(process.env.QUALITY_WORKER_CONCURRENCY ?? 4) });
  worker.on("failed", (job, error) => { if(job) console.error("Quality job failed", {jobId:job.id,attemptsMade:job.attemptsMade,errorCode:error.message.slice(0,80)}); });
  return worker;
}
export async function enqueueQualityJob(data: ValidationJob, options: JobsOptions = {}) {
  return qualityQueue.add("validate-asset", data, { jobId: data.requestKey, ...options });
}
