import type { NextFunction, Request, Response } from "express";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// Apply the configured-origin check to state-changing requests while allowing safe HTTP methods through.
export function originGuard(request: Request, response: Response, next: NextFunction): void {
  if (SAFE_METHODS.has(request.method)) {
    next();
    return;
  }

  const origin = request.header("origin");
  if (!origin) {
    next();
    return;
  }

  try {
    const expected = new URL(process.env.WEB_ORIGIN ?? "http://localhost:5173").origin;
    if (new URL(origin).origin !== expected) {
      response.status(403).json({ error: { code: "ORIGIN_NOT_ALLOWED", message: "This request origin is not allowed." } });
      return;
    }
    next();
  } catch {
    response.status(403).json({ error: { code: "ORIGIN_NOT_ALLOWED", message: "This request origin is not allowed." } });
  }
}
