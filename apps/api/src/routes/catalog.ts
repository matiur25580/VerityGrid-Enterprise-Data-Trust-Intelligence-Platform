import { Router } from "express";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { authenticate, requireRoles, requireTenant } from "../middleware/authenticate";

export const catalogRouter = Router();
catalogRouter.use(authenticate, requireTenant);

const sourceSchema = z.object({
  name: z.string().trim().min(2).max(160),
  sourceType: z.enum(["POSTGRESQL", "CSV", "JSON"]),
  description: z.string().trim().max(2000).optional(),
});
const classification = z.enum(["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED"]);

catalogRouter.get("/sources", async (req, res, next) => {
  try {
    const query = z.object({
      q: z.string().trim().max(120).optional(),
      sourceType: z.enum(["POSTGRESQL", "CSV", "JSON"]).optional(),
      cursor: z.string().uuid().optional(),
      limit: z.coerce.number().int().min(1).max(100).default(50),
    }).safeParse(req.query);
    if (!query.success) {
      res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Invalid source filters or pagination parameters." } });
      return;
    }
    const { q, sourceType, cursor, limit } = query.data;
    const where = {
      organizationId: req.tenant!.organizationId,
      ...(sourceType ? { sourceType } : {}),
      ...(q ? { OR: [
        { name: { contains: q, mode: "insensitive" as const } },
        { description: { contains: q, mode: "insensitive" as const } },
      ] } : {}),
    };
    if (cursor) {
      const cursorSource = await prisma.dataSource.findFirst({
        where: { ...where, id: cursor },
        select: { id: true },
      });
      if (!cursorSource) {
        res.status(400).json({ error: { code: "INVALID_CURSOR", message: "The source cursor is invalid for this workspace or filter set." } });
        return;
      }
    }
    const [results, totalCount] = await Promise.all([
      prisma.dataSource.findMany({
        where,
        select: {
          id: true, name: true, sourceType: true, description: true,
          createdAt: true, updatedAt: true,
          _count: { select: { assets: true } },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        take: limit + 1,
      }),
      prisma.dataSource.count({ where }),
    ]);
    const hasMore = results.length > limit;
    const sources = hasMore ? results.slice(0, limit) : results;
    res.json({
      data: {
        sources,
        totalCount,
        pagination: {
          limit,
          hasMore,
          nextCursor: hasMore ? sources[sources.length - 1]?.id ?? null : null,
        },
      },
    });
  } catch (error) { next(error); }
});

catalogRouter.get("/sources/:sourceId", async (req, res, next) => {
  try {
    const parsed = z.string().uuid().safeParse(req.params.sourceId);
    if (!parsed.success) {
      res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "A valid source ID is required." } });
      return;
    }
    const source = await prisma.dataSource.findFirst({
      where: { id: parsed.data, organizationId: req.tenant!.organizationId },
      select: {
        id: true, name: true, sourceType: true, description: true,
        createdAt: true, updatedAt: true,
        _count: { select: { assets: true } },
        assets: {
          select: { id: true, name: true, fullyQualifiedName: true, assetType: true, classification: true, updatedAt: true },
          orderBy: { updatedAt: "desc" },
          take: 20,
        },
      },
    });
    if (!source) {
      res.status(404).json({ error: { code: "SOURCE_NOT_FOUND", message: "The source does not exist in this workspace." } });
      return;
    }
    res.json({ data: { source } });
  } catch (error) { next(error); }
});

catalogRouter.post("/sources", requireRoles("OWNER", "ADMIN", "DATA_STEWARD", "DATA_ENGINEER"), async (req, res, next) => {
  try {
    const parsed = sourceSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Provide a valid source name and type.", issues: parsed.error.flatten() } });
      return;
    }
    const source = await prisma.dataSource.create({
      data: { ...parsed.data, organizationId: req.tenant!.organizationId },
    });
    res.status(201).json({ data: { source } });
  } catch (error: any) {
    if (error?.code === "P2002") {
      res.status(409).json({ error: { code: "SOURCE_NAME_EXISTS", message: "A source with this name already exists in this workspace." } });
      return;
    }
    next(error);
  }
});

catalogRouter.get("/assets", async (req, res, next) => {
  try {
    const query = z.object({
      q: z.string().trim().max(120).optional(),
      classification: classification.optional(),
      sourceId: z.string().uuid().optional(),
      cursor: z.string().uuid().optional(),
      limit: z.coerce.number().int().min(1).max(100).default(100),
    }).safeParse(req.query);
    if (!query.success) {
      res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Invalid catalog filters or pagination parameters." } });
      return;
    }
    const { q, classification: level, sourceId, cursor, limit } = query.data;
    const where: Prisma.DataAssetWhereInput = {
      organizationId: req.tenant!.organizationId,
      ...(level ? { classification: level } : {}),
      ...(sourceId ? { sourceId } : {}),
      ...(q ? { OR: [
        { name: { contains: q, mode: "insensitive" } },
        { fullyQualifiedName: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
        { ownerName: { contains: q, mode: "insensitive" } },
      ] } : {}),
    };

    if (cursor) {
      const cursorAsset = await prisma.dataAsset.findFirst({
        where: { ...where, id: cursor },
        select: { id: true },
      });
      if (!cursorAsset) {
        res.status(400).json({ error: { code: "INVALID_CURSOR", message: "The catalog cursor is invalid for this workspace or filter set." } });
        return;
      }
    }

    const results = await prisma.dataAsset.findMany({
      where,
      include: { source: { select: { id: true, name: true, sourceType: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      take: limit + 1,
    });
    const hasMore = results.length > limit;
    const assets = hasMore ? results.slice(0, limit) : results;
    res.json({
      data: {
        assets,
        pagination: {
          limit,
          hasMore,
          nextCursor: hasMore ? assets[assets.length - 1]?.id ?? null : null,
        },
      },
    });
  } catch (error) { next(error); }
});

catalogRouter.post("/assets", requireRoles("OWNER", "ADMIN", "DATA_STEWARD", "DATA_ENGINEER"), async (req, res, next) => {
  try {
    const parsed = z.object({
      name: z.string().trim().min(1).max(180),
      fullyQualifiedName: z.string().trim().min(1).max(512),
      description: z.string().trim().max(2000).optional(),
      assetType: z.string().trim().min(1).max(40).default("TABLE"),
      ownerName: z.string().trim().max(120).optional(),
      classification: classification.default("INTERNAL"),
      sourceId: z.string().uuid().optional(),
      schema: z.array(z.object({
        name: z.string().min(1).max(128),
        type: z.string().min(1).max(80),
        nullable: z.boolean().optional(),
      })).max(500).default([]),
    }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Provide valid dataset metadata.", issues: parsed.error.flatten() } });
      return;
    }
    if (parsed.data.sourceId) {
      const source = await prisma.dataSource.findFirst({ where: { id: parsed.data.sourceId, organizationId: req.tenant!.organizationId }, select: { id: true } });
      if (!source) {
        res.status(404).json({ error: { code: "SOURCE_NOT_FOUND", message: "The selected source does not exist in this workspace." } });
        return;
      }
    }
    const asset = await prisma.dataAsset.create({
      data: { ...parsed.data, organizationId: req.tenant!.organizationId, schema: parsed.data.schema as Prisma.InputJsonValue },
    });
    res.status(201).json({ data: { asset } });
  } catch (error: any) {
    if (error?.code === "P2002") {
      res.status(409).json({ error: { code: "ASSET_EXISTS", message: "An asset with this fully qualified name already exists." } });
      return;
    }
    next(error);
  }
});

function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') { cell += '"'; i++; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"' && cell.length === 0) quoted = true;
    else if (char === ",") { row.push(cell); cell = ""; }
    else if (char === "\n") { row.push(cell.replace(/\r$/, "")); rows.push(row); row = []; cell = ""; }
    else cell += char;
  }
  if (quoted) throw new Error("CSV contains an unterminated quoted field.");
  if (cell.length || row.length) { row.push(cell.replace(/\r$/, "")); rows.push(row); }
  return rows.filter((line) => line.some((value) => value.trim().length));
}

function inferType(values: unknown[]): string {
  const present = values.filter((value) => value !== null && value !== undefined && value !== "");
  if (present.length && present.every((value) => typeof value === "number" || (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))))) return "NUMBER";
  if (present.length && present.every((value) => typeof value === "boolean" || value === "true" || value === "false")) return "BOOLEAN";
  if (present.length && present.every((value) => typeof value === "string" && !Number.isNaN(Date.parse(value)) && /[-T:/]/.test(value))) return "DATETIME";
  return "STRING";
}

catalogRouter.post("/assets/import", requireRoles("OWNER", "ADMIN", "DATA_STEWARD", "DATA_ENGINEER"), async (req, res, next) => {
  try {
    const parsed = z.object({
      name: z.string().trim().min(1).max(180),
      format: z.enum(["CSV", "JSON"]),
      content: z.string().min(1).max(900_000),
      description: z.string().trim().max(2000).optional(),
      ownerName: z.string().trim().max(120).optional(),
      classification: classification.default("INTERNAL"),
      sourceId: z.string().uuid().optional(),
    }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Provide a CSV or JSON file payload under 900 KB.", issues: parsed.error.flatten() } });
      return;
    }
    const input = parsed.data;
    if (input.sourceId) {
      const source = await prisma.dataSource.findFirst({ where: { id: input.sourceId, organizationId: req.tenant!.organizationId }, select: { id: true } });
      if (!source) {
        res.status(404).json({ error: { code: "SOURCE_NOT_FOUND", message: "The selected source does not exist in this workspace." } });
        return;
      }
    }
    let records: Record<string, unknown>[];
    if (input.format === "JSON") {
      const value: unknown = JSON.parse(input.content);
      if (!Array.isArray(value) || value.length === 0 || value.length > 10000 || value.some((item) => !item || typeof item !== "object" || Array.isArray(item))) {
        res.status(400).json({ error: { code: "INVALID_IMPORT", message: "JSON must be a non-empty array of up to 10,000 objects." } });
        return;
      }
      records = value as Record<string, unknown>[];
    } else {
      const rows = parseCsv(input.content);
      if (rows.length < 2) {
        res.status(400).json({ error: { code: "INVALID_IMPORT", message: "CSV must contain a header and at least one data row." } });
        return;
      }
      const headerRow = rows[0];
      if (!headerRow) {
        res.status(400).json({ error: { code: "INVALID_IMPORT", message: "CSV header row is missing." } });
        return;
      }
      const headers = headerRow.map((header) => header.trim());
      if (headers.some((header) => !header) || new Set(headers).size !== headers.length || headers.length > 500) {
        res.status(400).json({ error: { code: "INVALID_IMPORT", message: "CSV headers must be unique, non-empty and limited to 500 columns." } });
        return;
      }
      if (rows.length > 10001 || rows.slice(1).some((row) => row.length !== headers.length)) {
        res.status(400).json({ error: { code: "INVALID_IMPORT", message: "CSV must have at most 10,000 rows with a consistent number of columns." } });
        return;
      }
      records = rows.slice(1).map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] === "" ? null : row[index]])));
    }
    const fieldNames = [...new Set(records.flatMap((record) => Object.keys(record)))];
    const columns = fieldNames.map((name) => ({
      name,
      type: inferType(records.map((record) => record[name])),
      nullable: records.some((record) => record[name] === null || record[name] === undefined || record[name] === ""),
    }));
    if (columns.length === 0 || columns.length > 500) {
      res.status(400).json({ error: { code: "INVALID_IMPORT", message: "Imported records must have between 1 and 500 fields." } });
      return;
    }
    const source = input.sourceId ? undefined : await prisma.dataSource.upsert({
      where: { organizationId_name: { organizationId: req.tenant!.organizationId, name: input.name } },
      update: {},
      create: { organizationId: req.tenant!.organizationId, name: input.name, sourceType: input.format },
      select: { id: true },
    });
    const sourceId = input.sourceId ?? source!.id;
    const columnStats = columns.map((column) => {
      const values = records.map((record) => record[column.name]);
      const present = values.filter((value) => value !== null && value !== undefined && value !== "");
      const distinct = new Set(present.map((value) => typeof value === "object" ? JSON.stringify(value) : `${typeof value}:${String(value)}`));
      return {
        name: column.name,
        nullCount: values.length - present.length,
        nonNullCount: present.length,
        distinctCount: distinct.size,
      };
    });
    const asset = await prisma.dataAsset.create({
      data: {
        organizationId: req.tenant!.organizationId,
        sourceId,
        name: input.name,
        fullyQualifiedName: `import.${input.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 100)}.${randomUUID()}`,
        description: input.description,
        ownerName: input.ownerName,
        classification: input.classification,
        assetType: "DATASET",
        rowCount: records.length,
        lastObservedAt: new Date(),
        schema: columns as Prisma.InputJsonValue,
        metadata: { importFormat: input.format, columnStats } as Prisma.InputJsonValue,
      },
    });
    res.status(201).json({ data: { asset, importedRows: records.length, discoveredColumns: columns.length } });
  } catch (error) {
    if (error instanceof SyntaxError) {
      res.status(400).json({ error: { code: "INVALID_IMPORT", message: "The uploaded JSON is not valid." } });
      return;
    }
    if (error instanceof Error && error.message.includes("CSV")) {
      res.status(400).json({ error: { code: "INVALID_IMPORT", message: error.message } });
      return;
    }
    next(error);
  }
});
