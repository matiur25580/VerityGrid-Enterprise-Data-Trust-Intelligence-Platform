import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { authenticate, requireRoles, requireTenant } from "../middleware/authenticate";
import { canTransitionContractStatus, contractFieldsSchema, evaluateSchemaCompatibility } from "../lib/data-contract";

export const contractRouter = Router();
contractRouter.use(authenticate, requireTenant);

const writer = requireRoles("OWNER", "ADMIN", "DATA_STEWARD", "DATA_ENGINEER");

contractRouter.get("/assets/:assetId", async (req, res, next) => {
  try {
    const id = z.string().uuid().safeParse(req.params.assetId);
    if (!id.success) { res.status(400).json({ error: { code: "INVALID_ASSET_ID", message: "A valid asset ID is required." } }); return; }
    const asset = await prisma.dataAsset.findFirst({ where: { id: id.data, organizationId: req.tenant!.organizationId }, select: { id: true } });
    if (!asset) { res.status(404).json({ error: { code: "ASSET_NOT_FOUND", message: "Dataset not found in this workspace." } }); return; }
    const contracts = await prisma.dataContract.findMany({
      where: { assetId: asset.id, organizationId: req.tenant!.organizationId },
      include: { evaluations: { orderBy: { evaluatedAt: "desc" }, take: 5 } },
      orderBy: { version: "desc" },
    });
    res.json({ data: { contracts } });
  } catch (error) { next(error); }
});

contractRouter.post("/assets/:assetId", writer, async (req, res, next) => {
  try {
    const id = z.string().uuid().safeParse(req.params.assetId);
    const input = z.object({
      name: z.string().trim().min(2).max(160),
      description: z.string().trim().max(4000).optional(),
      ownerName: z.string().trim().min(2).max(120),
      compatibilityMode: z.enum(["BACKWARD", "STRICT"]).default("BACKWARD"),
    }).safeParse(req.body);
    if (!id.success || !input.success) { res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Provide a valid asset ID and contract details." } }); return; }
    const organizationId = req.tenant!.organizationId;
    const asset = await prisma.dataAsset.findFirst({ where: { id: id.data, organizationId }, select: { id: true, schema: true } });
    if (!asset) { res.status(404).json({ error: { code: "ASSET_NOT_FOUND", message: "Dataset not found in this workspace." } }); return; }
    const latest = await prisma.dataContract.findFirst({ where: { organizationId, assetId: asset.id }, orderBy: { version: "desc" }, select: { version: true } });
    const contract = await prisma.$transaction(async tx => {
      const created = await tx.dataContract.create({
        data: {
          ...input.data,
          organizationId,
          assetId: asset.id,
          version: (latest?.version ?? 0) + 1,
          schemaSnapshot: asset.schema as Prisma.InputJsonValue,
        },
      });
      await tx.auditEvent.create({
        data: { organizationId, actorId: req.auth!.userId, action: "DATA_CONTRACT_CREATED", entityType: "DataContract", entityId: created.id, metadata: { assetId: asset.id, version: created.version } },
      });
      return created;
    });
    res.status(201).json({ data: { contract } });
  } catch (error) { next(error); }
});

contractRouter.patch("/:contractId/status", writer, async (req, res, next) => {
  try {
    const id = z.string().uuid().safeParse(req.params.contractId);
    const input = z.object({ status: z.enum(["ACTIVE", "RETIRED"]) }).safeParse(req.body);
    if (!id.success || !input.success) { res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "A valid contract ID and status are required." } }); return; }
    const organizationId = req.tenant!.organizationId;
    const current = await prisma.dataContract.findFirst({ where: { id: id.data, organizationId } });
    if (!current) { res.status(404).json({ error: { code: "CONTRACT_NOT_FOUND", message: "Contract not found in this workspace." } }); return; }
    if (!canTransitionContractStatus(current.status, input.data.status)) {
      res.status(409).json({ error: { code: "CONTRACT_INVALID_TRANSITION", message: `A contract cannot move from ${current.status} to ${input.data.status}.` } });
      return;
    }
    const updated = await prisma.$transaction(async tx => {
      const changed = await tx.dataContract.updateMany({
        where: { id: current.id, organizationId, status: current.status },
        data: { status: input.data.status },
      });
      if (changed.count !== 1) return null;
      const record = await tx.dataContract.findFirstOrThrow({ where: { id: current.id, organizationId } });
      await tx.auditEvent.create({ data: { organizationId, actorId: req.auth!.userId, action: "DATA_CONTRACT_STATUS_CHANGED", entityType: "DataContract", entityId: record.id, metadata: { from: current.status, to: record.status } } });
      return record;
    });
    if (!updated) {
      res.status(409).json({ error: { code: "CONTRACT_CONCURRENT_UPDATE", message: "The contract changed while this action was being processed. Refresh and try again." } });
      return;
    }
    res.json({ data: { contract: updated } });
  } catch (error) { next(error); }
});

contractRouter.post("/:contractId/evaluate", writer, async (req, res, next) => {
  try {
    const id = z.string().uuid().safeParse(req.params.contractId);
    if (!id.success) { res.status(400).json({ error: { code: "INVALID_CONTRACT_ID", message: "A valid contract ID is required." } }); return; }
    const organizationId = req.tenant!.organizationId;
    const contract = await prisma.dataContract.findFirst({
      where: { id: id.data, organizationId, status: "ACTIVE" },
      include: { asset: { select: { id: true, schema: true, fullyQualifiedName: true } } },
    });
    if (!contract) { res.status(404).json({ error: { code: "ACTIVE_CONTRACT_NOT_FOUND", message: "An active contract was not found in this workspace." } }); return; }
    const expected = contractFieldsSchema.safeParse(contract.schemaSnapshot);
    const actual = contractFieldsSchema.safeParse(contract.asset.schema);
    if (!expected.success || !actual.success) { res.status(409).json({ error: { code: "INVALID_SCHEMA_SNAPSHOT", message: "The stored contract or asset schema is not a supported field list." } }); return; }
    const evaluation = evaluateSchemaCompatibility(expected.data, actual.data, contract.compatibilityMode);
    const saved = await prisma.$transaction(async tx => {
      const record = await tx.dataContractEvaluation.create({
        data: { organizationId, contractId: contract.id, status: evaluation.status, result: evaluation as Prisma.InputJsonValue },
      });
      await tx.auditEvent.create({
        data: { organizationId, actorId: req.auth!.userId, action: "DATA_CONTRACT_EVALUATED", entityType: "DataContract", entityId: contract.id, metadata: { evaluationId: record.id, status: evaluation.status, asset: contract.asset.fullyQualifiedName } },
      });
      return record;
    });
    res.status(201).json({ data: { evaluation: saved, compatibility: evaluation } });
  } catch (error) { next(error); }
});
