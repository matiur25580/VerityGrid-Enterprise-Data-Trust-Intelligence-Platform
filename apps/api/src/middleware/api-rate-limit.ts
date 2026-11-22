import { rateLimit } from "express-rate-limit";
import { RedisRateLimitStore } from "../lib/rate-limit-store";

/**
 * Uses a shared Redis counter so limits are consistent across API replicas.
 * Redis is a required runtime dependency for rate-limited API requests.
 */
export function createApiRateLimiter(limit = 300, namespace = "api") {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit,
    // Authentication endpoints have their own stricter limiter in app.ts.
    // Avoid counting the same request in both limiters.
    skip: (request) => request.path.startsWith("/auth/register") || request.path.startsWith("/auth/login"),
    standardHeaders: "draft-7",
    legacyHeaders: false,
    store: new RedisRateLimitStore(namespace),
    message: {
      error: {
        code: "API_RATE_LIMITED",
        message: "Too many requests. Please slow down and try again later.",
      },
    },
  });
}
