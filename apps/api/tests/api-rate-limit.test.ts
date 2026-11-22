import express from "express";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { createApiRateLimiter } from "../src/middleware/api-rate-limit";
import { closeRateLimitRedis } from "../src/lib/rate-limit-store";

describe("Redis-backed API rate limiting", () => {
  afterAll(async () => closeRateLimitRedis());

  it("shares an atomic request counter between independently-created middleware instances", async () => {
    const namespace = `test-${Date.now()}-${Math.random()}`;
    const first = express();
    const second = express();
    first.use("/api", createApiRateLimiter(2, namespace));
    second.use("/api", createApiRateLimiter(2, namespace));
    first.get("/api/example", (_request, response) => response.status(200).json({ status: "ok" }));
    second.get("/api/example", (_request, response) => response.status(200).json({ status: "ok" }));

    await request(first).get("/api/example").expect(200);
    await request(second).get("/api/example").expect(200);
    const limited = await request(first).get("/api/example").expect(429);

    expect(limited.body.error.code).toBe("API_RATE_LIMITED");
    expect(limited.text).not.toContain("stack");
  });
});
