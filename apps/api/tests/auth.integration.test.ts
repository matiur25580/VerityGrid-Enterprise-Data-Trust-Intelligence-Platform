import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { app } from "../src/app";
import { prisma } from "../src/lib/prisma";
import { closeRateLimitRedis } from "../src/lib/rate-limit-store";

const email = `phase2-${randomUUID()}@veritygrid.test`;
const password = "A-unique-test-password-2026";
let organizationId = "";
let reviewerUserId = "";

describe("identity and tenant security", () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    if (organizationId) {
      await prisma.organization.deleteMany({ where: { id: organizationId } });
    }
    if (reviewerUserId) await prisma.user.deleteMany({ where: { id: reviewerUserId } });
    await prisma.user.deleteMany({ where: { email } });
    await prisma.$disconnect();
    await closeRateLimitRedis();
  });

  it("exposes liveness, database readiness and privacy-safe request correlation", async () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => undefined);
    try {
      const live = await request(app)
        .get("/api/health?token=must-not-be-logged")
        .set("x-request-id", "client-controlled-id")
        .expect(200);
      expect(live.body.status).toBe("ok");
      const requestId = live.headers["x-request-id"] as string;
      expect(requestId).toMatch(/^[0-9a-f-]{36}$/i);
      expect(requestId).not.toBe("client-controlled-id");

      const ready = await request(app).get("/api/health/ready").expect(200);
      expect(ready.body.status).toBe("ready");
      expect(ready.body.dependencies.postgres).toBe("ok");
      expect(ready.headers["x-request-id"]).not.toBe(requestId);

      await new Promise<void>((resolve) => setImmediate(resolve));
      const completion = log.mock.calls
        .map(([entry]) => String(entry))
        .find((entry) => entry.includes(requestId));
      expect(completion).toBeDefined();
      expect(completion).toContain('"event":"http.request.completed"');
      expect(completion).toContain('"path":"/api/health"');
      expect(completion).not.toContain("must-not-be-logged");
      expect(completion).not.toContain("client-controlled-id");
    } finally {
      log.mockRestore();
    }
  });

  it("registers, authenticates, scopes tenants, rotates and revokes sessions", async () => {
    const client = request.agent(app);

    const registration = await client
      .post("/api/auth/register")
      .send({
        organizationName: "VerityGrid Test Workspace",
        displayName: "Test Owner",
        email,
        password,
      })
      .expect(201);

    organizationId = registration.body.data.organization.id as string;
    expect(registration.headers["set-cookie"]).toBeDefined();

    const me = await client.get("/api/auth/me").expect(200);
    expect(me.body.data.user.email).toBe(email);
    expect(me.body.data.user.memberships[0].role).toBe("OWNER");

    await client
      .get("/api/organizations/current")
      .set("x-organization-id", organizationId)
      .expect(200);

    await client
      .get("/api/organizations/current/admin-check")
      .set("x-organization-id", organizationId)
      .expect(200);

    await client
      .get("/api/organizations/current")
      .set("x-organization-id", randomUUID())
      .expect(403);

    const source = await client
      .post("/api/catalog/sources")
      .set("x-organization-id", organizationId)
      .send({ name: "Finance Uploads", sourceType: "CSV", description: "Test source" })
      .expect(201);
    expect(source.body.data.source.organizationId).toBe(organizationId);

    const imported = await client
      .post("/api/catalog/assets/import")
      .set("x-organization-id", organizationId)
      .send({
        name: "orders",
        format: "CSV",
        content: "order_id,total\n1001,42.50\n1002,18.00",
        classification: "CONFIDENTIAL",
      })
      .expect(201);
    expect(imported.body.data.importedRows).toBe(2);
    expect(imported.body.data.discoveredColumns).toBe(2);
    const assetId = imported.body.data.asset.id as string;

    await client.post(`/api/quality/assets/${assetId}/rules`)
      .set("x-organization-id", organizationId)
      .send({ name: "Minimum order rows", ruleType: "MIN_ROW_COUNT", params: { minimum: 2 } })
      .expect(201);
    await client.post(`/api/quality/assets/${assetId}/rules`)
      .set("x-organization-id", organizationId)
      .send({ name: "Order ID uniqueness", ruleType: "UNIQUE", params: { column: "order_id" } })
      .expect(201);
    const qualityRun = await client.post(`/api/quality/assets/${assetId}/runs`)
      .set("x-organization-id", organizationId)
      .send({})
      .expect(201);
    expect(qualityRun.body.data.run.score).toBe(100);
    expect(qualityRun.body.data.run.passedCount).toBe(2);

    const freshnessPolicy = await client.post("/api/reliability/freshness/policies")
      .set("x-organization-id", organizationId)
      .send({ assetId, targetMinutes: 1440, warnAtPercent: 80 })
      .expect(201);
    expect(freshnessPolicy.body.data.policy.targetMinutes).toBe(1440);
    const freshness = await client.get("/api/reliability/freshness")
      .set("x-organization-id", organizationId).expect(200);
    expect(freshness.body.data.items.find((item: any) => item.assetId === assetId).status).toBe("HEALTHY");
    const analytics = await client.get("/api/reliability/analytics")
      .set("x-organization-id", organizationId).expect(200);
    expect(analytics.body.data.assets).toBe(1);
    expect(analytics.body.data.qualityRuns).toBe(1);
    const exportResponse = await client.get("/api/reliability/exports?type=quality-runs")
      .set("x-organization-id", organizationId).expect(200);
    expect(exportResponse.headers["content-type"]).toContain("text/csv");
    expect(exportResponse.text).toContain("passed_count");
    expect(exportResponse.text).not.toContain("1001,42.50");
    const formulaAsset = await client.post("/api/catalog/assets")
      .set("x-organization-id", organizationId)
      .send({ name: "=HYPERLINK(\"https://example.invalid\")", fullyQualifiedName: "test.formula_export", assetType: "TABLE", schema: [] })
      .expect(201);
    await client.post("/api/reliability/freshness/policies")
      .set("x-organization-id", organizationId)
      .send({ assetId: formulaAsset.body.data.asset.id, targetMinutes: 60 })
      .expect(201);
    const freshnessExport = await client.get("/api/reliability/exports?type=freshness")
      .set("x-organization-id", organizationId).expect(200);
    expect(freshnessExport.text).toContain("'=HYPERLINK");
    await client.post("/api/reliability/actions/classification")
      .set("x-organization-id", organizationId)
      .send({ assetId, policyId: randomUUID(), classification: "RESTRICTED", reason: "Attempt to use another workspace policy." })
      .expect(404);


    await client.post(`/api/quality/assets/${assetId}/rules`)
      .set("x-organization-id", organizationId)
      .send({ name: "Minimum ten rows", ruleType: "MIN_ROW_COUNT", params: { minimum: 10 } })
      .expect(201);
    await client.post(`/api/quality/assets/${assetId}/runs`)
      .set("x-organization-id", organizationId).send({}).expect(201);
    const insights = await client.get("/api/reliability/assistant/insights")
      .set("x-organization-id", organizationId).expect(200);
    expect(insights.body.data.mode).toBe("evidence-rules-v1");
    expect(insights.body.data.insights.some((item: any) => item.evidenceIds.some((id: string) => id.startsWith("quality-run:")))).toBe(true);

    const classificationPolicy = await client.post("/api/operations/policies")
      .set("x-organization-id", organizationId)
      .send({ name: "Classification approval", policyType: "CLASSIFICATION_CHANGE", requiresApproval: true })
      .expect(201);
    const actionRequest = await client.post("/api/reliability/actions/classification")
      .set("x-organization-id", organizationId)
      .send({ assetId, policyId: classificationPolicy.body.data.policy.id, classification: "RESTRICTED", reason: "Sensitive customer data requires restricted handling." })
      .expect(202);
    expect(actionRequest.body.data.state).toBe("PENDING");
    const unchangedAsset = await client.get("/api/catalog/assets?q=orders")
      .set("x-organization-id", organizationId).expect(200);
    expect(unchangedAsset.body.data.assets[0].classification).toBe("CONFIDENTIAL");
    await client.patch(`/api/operations/approvals/${actionRequest.body.data.approvalId}`)
      .set("x-organization-id", organizationId)
      .send({ decision: "APPROVED", comment: "Cannot approve own request." })
      .expect(403);
    await client.post(`/api/reliability/actions/${actionRequest.body.data.approvalId}/execute`)
      .set("x-organization-id", organizationId).send({}).expect(409);
    await client.get("/api/reliability/freshness")
      .set("x-organization-id", randomUUID()).expect(403);

    const reviewerEmail = `phase6-reviewer-${randomUUID()}@veritygrid.test`;
    const reviewer = await prisma.user.create({ data: {
      email: reviewerEmail, passwordHash: await bcrypt.hash("A-second-test-password-2026", 12), displayName: "Independent Reviewer",
    } });
    reviewerUserId = reviewer.id;
    await prisma.membership.create({ data: { organizationId, userId: reviewer.id, role: "ADMIN" } });
    const reviewerClient = request.agent(app);
    await reviewerClient.post("/api/auth/login").send({ email: reviewerEmail, password: "A-second-test-password-2026" }).expect(200);
    await reviewerClient.patch(`/api/operations/approvals/${actionRequest.body.data.approvalId}`)
      .set("x-organization-id", organizationId)
      .send({ decision: "APPROVED", comment: "Reviewed independently and approved." }).expect(200);
    await reviewerClient.post(`/api/reliability/actions/${actionRequest.body.data.approvalId}/execute`)
      .set("x-organization-id", organizationId).send({}).expect(200);
    const changedAsset = await reviewerClient.get("/api/catalog/assets?q=orders")
      .set("x-organization-id", organizationId).expect(200);
    expect(changedAsset.body.data.assets[0].classification).toBe("RESTRICTED");
    await reviewerClient.post("/api/auth/logout").expect(200);

    const downstream = await client.post("/api/catalog/assets")
      .set("x-organization-id", organizationId)
      .send({
        name: "order_summary",
        fullyQualifiedName: "analytics.order_summary",
        assetType: "TABLE",
        schema: [{ name: "order_id", type: "NUMBER" }],
      })
      .expect(201);
    const downstreamId = downstream.body.data.asset.id as string;
    await client.post("/api/quality/lineage")
      .set("x-organization-id", organizationId)
      .send({ upstreamAssetId: assetId, downstreamAssetId: downstreamId })
      .expect(201);
    const impact = await client.get(`/api/quality/assets/${assetId}/lineage`)
      .set("x-organization-id", organizationId)
      .expect(200);
    expect(impact.body.data.impactCount).toBe(1);
    const cycle = await client.post("/api/quality/lineage")
      .set("x-organization-id", organizationId)
      .send({ upstreamAssetId: downstreamId, downstreamAssetId: assetId })
      .expect(409);
    expect(cycle.body.error.code).toBe("LINEAGE_CYCLE");
    await client.get(`/api/quality/assets/${assetId}/rules`)
      .set("x-organization-id", randomUUID())
      .expect(403);
    await client.post("/api/quality/lineage")
      .set("x-organization-id", organizationId)
      .send({ upstreamAssetId: downstreamId, downstreamAssetId: assetId })
      .expect(409);

    const catalog = await client
      .get("/api/catalog/assets?q=orders")
      .set("x-organization-id", organizationId)
      .expect(200);
    expect(catalog.body.data.assets).toHaveLength(1);
    expect(catalog.body.data.assets[0].classification).toBe("RESTRICTED");

    await client
      .get("/api/catalog/assets")
      .set("x-organization-id", randomUUID())
      .expect(403);

    await client.post("/api/auth/sessions/rotate").expect(200);
    await client.get("/api/auth/me").expect(200);

    await client.post("/api/auth/logout").expect(200);
    await client.get("/api/auth/me").expect(401);

    const login = await request(app)
      .post("/api/auth/login")
      .send({ email, password })
      .expect(200);
    expect(login.headers["set-cookie"]).toBeDefined();
  });

  it("performs a bcrypt comparison for unknown accounts to reduce login timing disclosure", async () => {
    const compare = vi.spyOn(bcrypt, "compare");
    try {
      await request(app)
        .post("/api/auth/login")
        .send({ email: `missing-${randomUUID()}@veritygrid.test`, password })
        .expect(401);
      expect(compare).toHaveBeenCalledTimes(1);
      expect(compare).toHaveBeenCalledWith(password, expect.any(String));
    } finally {
      compare.mockRestore();
    }
  });

  it("rejects weak passwords and malformed registration payloads", async () => {
    await request(app)
      .post("/api/auth/register")
      .send({
        organizationName: "Invalid Workspace",
        displayName: "Test User",
        email: `invalid-${randomUUID()}@veritygrid.test`,
        password: "short",
      })
      .expect(400);
  });
});
