import { afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../src/lib/prisma";
import { processQualityJob } from "../src/lib/quality-worker";

describe("background quality validation", () => {
  afterEach(() => vi.restoreAllMocks());

  it("scopes asset lookup to the organization and persists a run idempotently", async () => {
    vi.spyOn(prisma.dataAsset, "findFirst").mockResolvedValue({
      id: "asset-1", organizationId: "org-1", name: "Orders", schema: [], metadata: {}, rowCount: 0,
    } as any);
    vi.spyOn(prisma.qualityRule, "findMany").mockResolvedValue([] as any);
    vi.spyOn(prisma.qualityRun, "upsert").mockResolvedValue({ id: "run-1" } as any);

    const result = await processQualityJob({
      organizationId: "org-1", assetId: "asset-1", requestedBy: "user-1", requestKey: "org-1:request-1",
    });

    expect(prisma.dataAsset.findFirst).toHaveBeenCalledWith({
      where: { id: "asset-1", organizationId: "org-1" },
    });
    expect(prisma.qualityRun.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { jobKey: "org-1:request-1" },
    }));
    expect(result).toEqual({ runId: "run-1", passedCount: 0, failedCount: 0, skippedCount: 0 });
  });

  it("rejects a dataset that is outside the requested tenant", async () => {
    vi.spyOn(prisma.dataAsset, "findFirst").mockResolvedValue(null);
    await expect(processQualityJob({
      organizationId: "org-2", assetId: "asset-1", requestedBy: "user-2", requestKey: "org-2:request-1",
    })).rejects.toThrow("DATASET_NOT_FOUND");
  });
});
