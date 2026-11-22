import "dotenv/config";
import { startQualityWorker, closeQualityQueues } from "./lib/quality-worker";
import { prisma } from "./lib/prisma";
const worker=startQualityWorker();
console.info("VerityGrid quality worker started.");
const shutdown=async()=>{await worker.close();await closeQualityQueues();await prisma.$disconnect();process.exit(0);};
process.on("SIGINT",()=>void shutdown());process.on("SIGTERM",()=>void shutdown());
