import "dotenv/config";
import { startQualityWorker, closeQualityQueues } from "./lib/quality-worker";
import { startFreshnessWorker, scheduleFreshnessEvaluation, closeFreshnessWorker } from "./lib/freshness-worker";
import { prisma } from "./lib/prisma";

async function main() {
  const qualityWorker = startQualityWorker();
  const freshnessWorker = startFreshnessWorker();
  await scheduleFreshnessEvaluation();
  console.info("VerityGrid quality and freshness workers started.");
  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    await Promise.all([qualityWorker.close(), freshnessWorker.close()]);
    await Promise.all([closeQualityQueues(), closeFreshnessWorker()]);
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}
void main().catch(async error => {
  console.error("VerityGrid worker startup failed", { errorCode: error instanceof Error ? error.message.slice(0, 100) : "UNKNOWN" });
  await prisma.$disconnect();
  process.exit(1);
});
