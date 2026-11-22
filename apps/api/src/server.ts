import "dotenv/config";
import { app } from "./app";

const port = Number(process.env.PORT ?? 4000);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be a valid TCP port.");
}

const server = app.listen(port, () => {
  console.info(`VerityGrid API listening on http://localhost:${port}`);
});

const shutdown = (signal: string) => {
  console.info(`${signal} received; shutting down HTTP server.`);
  server.close((error) => {
    if (error) {
      console.error("HTTP server shutdown failed.", error);
      process.exitCode = 1;
    }
  });
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
