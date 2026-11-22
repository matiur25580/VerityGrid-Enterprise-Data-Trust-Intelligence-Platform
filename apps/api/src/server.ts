import "dotenv/config";
import { app } from "./app";
import { prisma } from "./lib/prisma";
import { closeQualityQueues } from "./lib/quality-worker";
import { closeFreshnessWorker } from "./lib/freshness-worker";
import { closeNotificationQueue } from "./lib/notifications";

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
    try {
      await Promise.all([closeQualityQueues(), closeFreshnessWorker(), closeNotificationQueue()]);
      await prisma.$disconnect();
    } catch (shutdownError) {
      console.error("Dependency shutdown failed.", { errorCode: shutdownError instanceof Error ? shutdownError.name : "UNKNOWN" });
      process.exitCode = 1;
    }
  });
};

let shuttingDown = false;
const beginShutdown = (signal: string) => { if (shuttingDown) return; shuttingDown = true; shutdown(signal); };
process.on("SIGINT", () => beginShutdown("SIGINT"));
process.on("SIGTERM", () => beginShutdown("SIGTERM"));
