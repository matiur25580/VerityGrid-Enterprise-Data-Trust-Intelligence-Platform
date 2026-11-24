import { Router } from "express";
import { Prisma, QualityRuleType } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { authenticate, requireRoles, requireTenant } from "../middleware/authenticate";

export const qualityRouter = Router();
// Require a valid session and organization membership for every data-quality rule endpoint.
qualityRouter.use(authenticate, requireTenant);

const writer = requireRoles("OWNER", "ADMIN", "DATA_STEWARD", "DATA_ENGINEER");
const ruleType = z.enum(["MIN_ROW_COUNT", "COLUMN_EXISTS", "NOT_NULL", "MAX_NULL_PERCENT", "UNIQUE"]);
const paramsSchema = z.object({
  column: z.string().trim().min(1).max(128).optional(),
  minimum: z.number().int().min(0).max(10_000_000).optional(),
  maxPercent: z.number().min(0).max(100).optional(),
});

async function findAsset(assetId: string, organizationId: string) {
  return prisma.dataAsset.findFirst({ where: { id: assetId, organizationId } });
}

qualityRouter.get("/assets/:assetId/rules", async (req, res, next) => {
  try {
    const assetId = z.string().uuid().safeParse(req.params.assetId);
    if (!assetId.success) { res.status(400).json({ error: { code: "INVALID_ASSET_ID", message: "Asset ID must be a UUID." } }); return; }
    const asset = await findAsset(assetId.data, req.tenant!.organizationId);
    if (!asset) { res.status(404).json({ error: { code: "ASSET_NOT_FOUND", message: "Dataset not found in this workspace." } }); return; }
    const rules = await prisma.qualityRule.findMany({
      where: { organizationId: req.tenant!.organizationId, assetId: asset.id },
      orderBy: [{ name: "asc" }, { version: "desc" }],
    });
    res.json({ data: { rules } });
  } catch (error) { next(error); }
});

qualityRouter.post("/assets/:assetId/rules", writer, async (req, res, next) => {
  try {
    const assetId = z.string().uuid().safeParse(req.params.assetId);
    const body = z.object({
      name: z.string().trim().min(2).max(160),
      description: z.string().trim().max(2000).optional(),
      ruleType,
      params: paramsSchema.default({}),
    }).safeParse(req.body);
    if (!assetId.success || !body.success) {
      res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Provide a valid dataset ID and rule definition.", issues: body.success ? undefined : body.error.flatten() } });
      return;
    }
    const { organizationId } = req.tenant!;
    const asset = await findAsset(assetId.data, organizationId);
    if (!asset) { res.status(404).json({ error: { code: "ASSET_NOT_FOUND", message: "Dataset not found in this workspace." } }); return; }
    const type = body.data.ruleType;
    const params = body.data.params;
    if (type === "MIN_ROW_COUNT" && params.minimum === undefined) {
      res.status(400).json({ error: { code: "RULE_PARAMETER_REQUIRED", message: "MIN_ROW_COUNT requires params.minimum." } }); return;
    }
    if (["COLUMN_EXISTS", "NOT_NULL", "MAX_NULL_PERCENT", "UNIQUE"].includes(type) && !params.column) {
      res.status(400).json({ error: { code: "RULE_PARAMETER_REQUIRED", message: `${type} requires params.column.` } }); return;
    }
    if (type === "MAX_NULL_PERCENT" && params.maxPercent === undefined) {
      res.status(400).json({ error: { code: "RULE_PARAMETER_REQUIRED", message: "MAX_NULL_PERCENT requires params.maxPercent." } }); return;
    }
    const latest = await prisma.qualityRule.findFirst({
      where: { organizationId, assetId: asset.id, name: body.data.name },
      orderBy: { version: "desc" },
      select: { version: true },
    });
    const created = await prisma.$transaction(async (tx) => {
      await tx.qualityRule.updateMany({
        where: { organizationId, assetId: asset.id, name: body.data.name, isActive: true },
        data: { isActive: false },
      });
      return tx.qualityRule.create({
        data: {
          organizationId, assetId: asset.id, name: body.data.name,
          description: body.data.description, ruleType: type as QualityRuleType,
          params: params as unknown as Prisma.InputJsonValue, version: (latest?.version ?? 0) + 1,
        },
      });
    });
    res.status(201).json({ data: { rule: created } });
  } catch (error) { next(error); }
});

function jsonObject(value: Prisma.JsonValue): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

qualityRouter.post("/assets/:assetId/runs", writer, async (req, res, next) => {
  try {
    const assetId = z.string().uuid().safeParse(req.params.assetId);
    if (!assetId.success) { res.status(400).json({ error: { code: "INVALID_ASSET_ID", message: "Asset ID must be a UUID." } }); return; }
    const organizationId = req.tenant!.organizationId;
    const asset = await findAsset(assetId.data, organizationId);
    if (!asset) { res.status(404).json({ error: { code: "ASSET_NOT_FOUND", message: "Dataset not found in this workspace." } }); return; }
    const rules = await prisma.qualityRule.findMany({
      where: { organizationId, assetId: asset.id, isActive: true },
      orderBy: { name: "asc" },
    });
    const schema = Array.isArray(asset.schema) ? asset.schema as unknown as Array<Record<string, unknown>> : [];
    const metadata = jsonObject(asset.metadata);
    const stats = Array.isArray(metadata.columnStats) ? metadata.columnStats as Array<Record<string, unknown>> : [];
    const results = rules.map((rule) => {
      const params = jsonObject(rule.params);
      const column = typeof params.column === "string" ? params.column : "";
      const field = schema.find((entry) => entry.name === column);
      const stat = stats.find((entry) => entry.name === column);
      let status: "PASSED" | "FAILED" | "SKIPPED" = "SKIPPED";
      let observed: unknown = null;
      let expected: unknown = null;
      let detail = "";
      switch (rule.ruleType) {
        case "MIN_ROW_COUNT":
          expected = params.minimum;
          observed = asset.rowCount;
          if (asset.rowCount === null || typeof params.minimum !== "number") detail = "Row count is unavailable for this asset.";
          else { status = asset.rowCount >= params.minimum ? "PASSED" : "FAILED"; detail = `Observed ${asset.rowCount} rows; minimum is ${params.minimum}.`; }
          break;
        case "COLUMN_EXISTS":
          expected = column;
          observed = field ? column : null;
          status = field ? "PASSED" : "FAILED";
          detail = field ? `Column "${column}" exists in the discovered schema.` : `Column "${column}" was not found in the discovered schema.`;
          break;
        case "NOT_NULL":
          expected = 0;
          observed = stat?.nullCount;
          if (!field || typeof stat?.nullCount !== "number") detail = "Null-count statistics are unavailable; import or profile the dataset again.";
          else { status = stat.nullCount === 0 ? "PASSED" : "FAILED"; detail = `Column "${column}" has ${stat.nullCount} null values.`; }
          break;
        case "MAX_NULL_PERCENT":
          expected = params.maxPercent;
          if (!field || typeof stat?.nullCount !== "number" || typeof stat.nonNullCount !== "number" || typeof params.maxPercent !== "number") detail = "Null percentage statistics are unavailable for this column.";
          else {
            const total = stat.nullCount + stat.nonNullCount;
            observed = total ? Number((stat.nullCount / total * 100).toFixed(2)) : 0;
            status = Number(observed) <= params.maxPercent ? "PASSED" : "FAILED";
            detail = `Column "${column}" null rate is ${observed}% (maximum ${params.maxPercent}%).`;
          }
          break;
        case "UNIQUE":
          expected = "distinctCount equals nonNullCount";
          if (!field || typeof stat?.distinctCount !== "number" || typeof stat.nonNullCount !== "number") detail = "Distinct-value statistics are unavailable for this column.";
          else {
            observed = { distinctCount: stat.distinctCount, nonNullCount: stat.nonNullCount };
            status = stat.distinctCount === stat.nonNullCount ? "PASSED" : "FAILED";
            detail = `Column "${column}" has ${stat.distinctCount} distinct values across ${stat.nonNullCount} non-null values.`;
          }
          break;
      }
      return { ruleId: rule.id, name: rule.name, version: rule.version, ruleType: rule.ruleType, status, observed, expected, detail };
    });
    const passedCount = results.filter((item) => item.status === "PASSED").length;
    const failedCount = results.filter((item) => item.status === "FAILED").length;
    const skippedCount = results.filter((item) => item.status === "SKIPPED").length;
    const evaluated = passedCount + failedCount;
    const score = evaluated ? Number((passedCount / evaluated * 100).toFixed(2)) : null;
    const run = await prisma.qualityRun.create({
      data: { organizationId, assetId: asset.id, score, passedCount, failedCount, skippedCount, results: results as unknown as Prisma.InputJsonValue },
    });
    res.status(201).json({ data: { run, results } });
  } catch (error) { next(error); }
});

qualityRouter.get("/assets/:assetId/runs", async (req, res, next) => {
  try {
    const assetId = z.string().uuid().safeParse(req.params.assetId);
    if (!assetId.success) { res.status(400).json({ error: { code: "INVALID_ASSET_ID", message: "Asset ID must be a UUID." } }); return; }
    const asset = await findAsset(assetId.data, req.tenant!.organizationId);
    if (!asset) { res.status(404).json({ error: { code: "ASSET_NOT_FOUND", message: "Dataset not found in this workspace." } }); return; }
    const runs = await prisma.qualityRun.findMany({
      where: { organizationId: req.tenant!.organizationId, assetId: asset.id },
      orderBy: { executedAt: "desc" }, take: 20,
    });
    res.json({ data: { runs } });
  } catch (error) { next(error); }
});

async function reaches(startId: string, targetId: string, organizationId: string): Promise<boolean> {
  const visited = new Set<string>();
  let frontier = [startId];
  for (let depth = 0; depth < 30 && frontier.length && visited.size < 500; depth++) {
    const current = frontier.filter((id) => !visited.has(id));
    if (current.includes(targetId)) return true;
    current.forEach((id) => visited.add(id));
    const edges = await prisma.lineageEdge.findMany({
      where: { organizationId, upstreamAssetId: { in: current } },
      select: { downstreamAssetId: true },
      take: 500,
    });
    frontier = edges.map((edge) => edge.downstreamAssetId);
  }
  return false;
}

qualityRouter.post("/lineage", writer, async (req, res, next) => {
  try {
    const parsed = z.object({
      upstreamAssetId: z.string().uuid(),
      downstreamAssetId: z.string().uuid(),
      relationship: z.string().trim().min(2).max(40).default("DERIVES_FROM"),
    }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Provide valid upstream and downstream dataset IDs." } }); return; }
    const { organizationId } = req.tenant!;
    const { upstreamAssetId, downstreamAssetId, relationship } = parsed.data;
    if (upstreamAssetId === downstreamAssetId) { res.status(400).json({ error: { code: "LINEAGE_SELF_LINK", message: "A dataset cannot depend on itself." } }); return; }
    const assets = await prisma.dataAsset.findMany({
      where: { organizationId, id: { in: [upstreamAssetId, downstreamAssetId] } },
      select: { id: true },
    });
    if (assets.length !== 2) { res.status(404).json({ error: { code: "ASSET_NOT_FOUND", message: "Both datasets must exist in the current workspace." } }); return; }
    if (await reaches(downstreamAssetId, upstreamAssetId, organizationId)) {
      res.status(409).json({ error: { code: "LINEAGE_CYCLE", message: "This dependency would create a cycle." } }); return;
    }
    const edge = await prisma.lineageEdge.create({
      data: { organizationId, upstreamAssetId, downstreamAssetId, relationship },
    });
    res.status(201).json({ data: { edge } });
  } catch (error: any) {
    if (error?.code === "P2002") { res.status(409).json({ error: { code: "LINEAGE_EXISTS", message: "This dependency already exists." } }); return; }
    next(error);
  }
});

qualityRouter.get("/assets/:assetId/lineage", async (req, res, next) => {
  try {
    const assetId = z.string().uuid().safeParse(req.params.assetId);
    if (!assetId.success) { res.status(400).json({ error: { code: "INVALID_ASSET_ID", message: "Asset ID must be a UUID." } }); return; }
    const organizationId = req.tenant!.organizationId;
    const asset = await findAsset(assetId.data, organizationId);
    if (!asset) { res.status(404).json({ error: { code: "ASSET_NOT_FOUND", message: "Dataset not found in this workspace." } }); return; }
    const [upstream, downstream, allEdges] = await Promise.all([
      prisma.lineageEdge.findMany({ where: { organizationId, downstreamAssetId: asset.id }, include: { upstreamAsset: { select: { id: true, name: true, fullyQualifiedName: true } } } }),
      prisma.lineageEdge.findMany({ where: { organizationId, upstreamAssetId: asset.id }, include: { downstreamAsset: { select: { id: true, name: true, fullyQualifiedName: true } } } }),
      prisma.lineageEdge.findMany({ where: { organizationId }, select: { upstreamAssetId: true, downstreamAssetId: true }, take: 5000 }),
    ]);
    const impacted = new Set<string>();
    const queue = [asset.id];
    const adjacency = new Map<string, string[]>();
    for (const edge of allEdges) adjacency.set(edge.upstreamAssetId, [...(adjacency.get(edge.upstreamAssetId) ?? []), edge.downstreamAssetId]);
    while (queue.length && impacted.size < 500) {
      const current = queue.shift()!;
      for (const child of adjacency.get(current) ?? []) {
        if (!impacted.has(child) && child !== asset.id) { impacted.add(child); queue.push(child); }
      }
    }
    const impactedAssets = impacted.size ? await prisma.dataAsset.findMany({
      where: { organizationId, id: { in: [...impacted] } },
      select: { id: true, name: true, fullyQualifiedName: true },
    }) : [];
    res.json({ data: { asset: { id: asset.id, name: asset.name }, upstream, downstream, impactedAssets, impactCount: impactedAssets.length, impactTruncated: impacted.size >= 500 || allEdges.length >= 5000 } });
  } catch (error) { next(error); }
});
