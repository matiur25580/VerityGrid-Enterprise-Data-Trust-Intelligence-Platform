import type { ErrorRequestHandler } from "express";

export const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  if (process.env.NODE_ENV !== "production") {
    console.error("API request failed:", error);
  }

  if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
    response.status(409).json({
      error: {
        code: "RESOURCE_CONFLICT",
        message: "A record with one or more of these unique values already exists.",
      },
    });
    return;
  }

  response.status(500).json({
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "An unexpected error occurred. Please try again.",
    },
  });
};
