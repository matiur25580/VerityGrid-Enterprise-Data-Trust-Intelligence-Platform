import { Router } from "express";
import { prisma } from "../lib/prisma";

export const healthRouter = Router();

/** Liveness: confirms the Node process can serve requests. */
healthRouter.get("/", (_request, response) => {
  response.status(200).json({
    status: "ok",
    service: "veritygrid-api",
    timestamp: new Date().toISOString(),
  });
});

/** Readiness: confirms the API can reach its PostgreSQL system of record. */
healthRouter.get("/ready", async (_request, response) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    response.status(200).json({
      status: "ready",
      service: "veritygrid-api",
      dependencies: { postgres: "ok" },
      timestamp: new Date().toISOString(),
    });
  } catch {
    response.status(503).json({
      status: "not_ready",
      service: "veritygrid-api",
      dependencies: { postgres: "unavailable" },
      timestamp: new Date().toISOString(),
    });
  }
});
