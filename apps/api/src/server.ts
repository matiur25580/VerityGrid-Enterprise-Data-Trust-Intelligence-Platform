import "dotenv/config";
import { app } from "./app";
import { prisma } from "./lib/prisma";
import { closeQualityQueues } from "./lib/quality-worker";

const port = Number(process.env.PORT ?? 4000);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be a valid TCP port.");
}

const server = app.listen(port, () => {
  console.info(`VerityGrid API listening on http://localhost:${port}`);
});

const shutdown = (signal: string) => {
  console.info(`${signal} received; shutting down HTTP server.`);
  server.close(async (error) => {
    if (error) {
      console.error("HTTP server shutdown failed.", error);
      process.exitCode = 1;
    }
    try { await closeQualityQueues(); await prisma.$disconnect(); } catch (shutdownError) { console.error("Dependency shutdown failed.", shutdownError); process.exitCode = 1; }
  });
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
