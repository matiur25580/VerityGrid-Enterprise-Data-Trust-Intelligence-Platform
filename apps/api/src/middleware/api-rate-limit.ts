import { rateLimit } from "express-rate-limit";

/**
 * Protects API routes from accidental or abusive request bursts.
 * The default memory store is process-local; multi-instance deployments must
 * configure a shared rate-limit store at the edge or in the application.
 */
export function createApiRateLimiter(limit = 300) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: {
      error: {
        code: "API_RATE_LIMITED",
        message: "Too many requests. Please slow down and try again later.",
      },
    },
  });
}
