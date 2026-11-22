import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { app } from "../src/app";
import { prisma } from "../src/lib/prisma";

const email = `phase2-${randomUUID()}@veritygrid.test`;
const password = "A-unique-test-password-2026";
let organizationId = "";

describe("identity and tenant security", () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    if (organizationId) {
      await prisma.organization.deleteMany({ where: { id: organizationId } });
    }
    await prisma.user.deleteMany({ where: { email } });
    await prisma.$disconnect();
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
