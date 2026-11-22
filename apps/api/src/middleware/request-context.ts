import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";

/**
 * Attach a server-generated correlation ID and emit privacy-conscious request
 * telemetry. Never log query strings, headers, bodies, credentials or IPs here.
 */
export const requestContext: RequestHandler = (request, response, next) => {
  const requestId = randomUUID();
  const startedAt = Date.now();
  response.setHeader("x-request-id", requestId);
  response.on("finish", () => {
    console.info(JSON.stringify({
      level: "info",
      event: "http.request.completed",
      requestId,
      method: request.method,
      path: request.path,
      statusCode: response.statusCode,
      durationMs: Math.max(0, Date.now() - startedAt),
      timestamp: new Date().toISOString(),
    }));
  });
  next();
};
