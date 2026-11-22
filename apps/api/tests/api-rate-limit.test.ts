import express from "express";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { createApiRateLimiter } from "../src/middleware/api-rate-limit";
import { closeRateLimitRedis } from "../src/lib/rate-limit-store";

describe("API rate limiting", () => {
  it("allows requests within the configured window and returns a safe 429 response after the limit", async () => {
    const app = express();
    app.use("/api", createApiRateLimiter(2));
    app.get("/api/example", (_request, response) => response.status(200).json({ status: "ok" }));

    await request(app).get("/api/example").expect(200);
    await request(app).get("/api/example").expect(200);
    const limited = await request(app).get("/api/example").expect(429);

    expect(limited.body.error.code).toBe("API_RATE_LIMITED");
    expect(limited.body.error.message).toBe("Too many requests. Please slow down and try again later.");
    expect(limited.text).not.toContain("stack");
  });
});
