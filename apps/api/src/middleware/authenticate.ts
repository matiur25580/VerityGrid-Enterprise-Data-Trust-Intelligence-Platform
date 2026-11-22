import type { NextFunction, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { hashSessionToken, SESSION_COOKIE } from "../lib/session";

declare global {
  namespace Express {
    interface Request {
      auth?: { userId: string; sessionId: string };
      tenant?: {
        organizationId: string;
        organizationName: string;
        role: string;
      };
    }
  }
}

export async function authenticate(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const token = request.cookies?.[SESSION_COOKIE] as string | undefined;
    if (!token || token.length > 128) {
      response.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Please sign in to continue." } });
      return;
    }

    const session = await prisma.session.findUnique({
      where: { tokenHash: hashSessionToken(token) },
      include: { user: true },
    });

    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <= new Date() ||
      !session.user.isActive
    ) {
      response.status(401).json({ error: { code: "SESSION_INVALID", message: "Your session is invalid or expired." } });
      return;
    }

    request.auth = { userId: session.userId, sessionId: session.id };
    next();
  } catch (error) {
    next(error);
  }
}

export async function requireTenant(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!request.auth) {
      response.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Authentication is required." } });
      return;
    }

    const organizationId = request.header("x-organization-id");
    if (!organizationId) {
      response.status(400).json({ error: { code: "ORGANIZATION_REQUIRED", message: "Select an organization using x-organization-id." } });
      return;
    }

    const membership = await prisma.membership.findUnique({
      where: {
        organizationId_userId: {
          organizationId,
          userId: request.auth.userId,
        },
      },
      include: { organization: true },
    });

    if (!membership || membership.organization.status !== "ACTIVE") {
      response.status(403).json({ error: { code: "TENANT_ACCESS_DENIED", message: "You do not have access to this organization." } });
      return;
    }

    request.tenant = {
      organizationId: membership.organizationId,
      organizationName: membership.organization.name,
      role: membership.role,
    };
    next();
  } catch (error) {
    next(error);
  }
}

export function requireRoles(...roles: string[]) {
  return (request: Request, response: Response, next: NextFunction): void => {
    if (!request.tenant || !roles.includes(request.tenant.role)) {
      response.status(403).json({ error: { code: "INSUFFICIENT_ROLE", message: "Your organization role cannot perform this action." } });
      return;
    }
    next();
  };
}
