import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import { rateLimit } from "express-rate-limit";
import helmet from "helmet";
import { originGuard } from "./middleware/origin-guard";
import { errorHandler } from "./middleware/error-handler";
import { requestContext } from "./middleware/request-context";
import { authRouter } from "./routes/auth";
import { healthRouter } from "./routes/health";
import { organizationsRouter } from "./routes/organizations";
import { catalogRouter } from "./routes/catalog";
import { qualityRouter } from "./routes/quality";
import { operationsRouter } from "./routes/operations";
import { reliabilityRouter } from "./routes/reliability";

const app = express();

app.disable("x-powered-by");
app.use(requestContext);
app.use(helmet());
app.use(
  cors({
    origin: process.env.WEB_ORIGIN ?? "http://localhost:5173",
    credentials: true,
  }),
);
app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());
app.use(originGuard);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    error: {
      code: "AUTH_RATE_LIMITED",
      message: "Too many authentication attempts. Please try again later.",
    },
  },
});

app.use("/api/health", healthRouter);
app.use("/api/auth/register", authLimiter);
app.use("/api/auth/login", authLimiter);
app.use("/api/auth", authRouter);
app.use("/api/organizations", organizationsRouter);
app.use("/api/catalog", catalogRouter);
app.use("/api/quality", qualityRouter);
app.use("/api/operations", operationsRouter);
app.use("/api/reliability", reliabilityRouter);

app.use((_request, response) => {
  response.status(404).json({
    error: {
      code: "ROUTE_NOT_FOUND",
      message: "The requested API route does not exist.",
    },
  });
});

app.use(errorHandler);

export { app };
