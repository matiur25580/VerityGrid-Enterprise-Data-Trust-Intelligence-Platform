import "dotenv/config";
import { startQualityWorker } from "./lib/quality-worker";
const worker=startQualityWorker();
console.info("VerityGrid quality worker started.");
const shutdown=async()=>{await worker.close();process.exit(0);};
process.on("SIGINT",()=>void shutdown());process.on("SIGTERM",()=>void shutdown());
