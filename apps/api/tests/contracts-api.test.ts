import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../src/app";
import { prisma } from "../src/lib/prisma";

describe("data contracts API", () => {
  it("requires authentication for contract registry and evaluation", async () => {
    expect((await request(app).get("/api/contracts/assets/00000000-0000-4000-8000-000000000001")).status).toBe(401);
    expect((await request(app).post("/api/contracts/assets/00000000-0000-4000-8000-000000000001").send({})).status).toBe(401);
    expect((await request(app).patch("/api/contracts/00000000-0000-4000-8000-000000000001/status").send({})).status).toBe(401);
    expect((await request(app).post("/api/contracts/00000000-0000-4000-8000-000000000001/evaluate").send({})).status).toBe(401);
  });
});

afterAll(async () => { await prisma.$disconnect(); });
