import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { prisma } from "../lib/prisma";
import {
  clearSessionCookie,
  createSessionToken,
  hashSessionToken,
  SESSION_TTL_MS,
  setSessionCookie,
} from "../lib/session";
import { authenticate } from "../middleware/authenticate";

export const authRouter = Router();

const registerSchema = z.object({
  organizationName: z.string().trim().min(2).max(160),
  displayName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(12).max(128),
});

const loginSchema = z.object({
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(1).max(128),
});

function slugBase(value: string): string {
  return value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "workspace";
}

async function issueSession(userId: string, response: Parameters<typeof setSessionCookie>[0]): Promise<void> {
  const token = createSessionToken();
  await prisma.session.create({
    data: {
      userId,
      tokenHash: hashSessionToken(token),
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    },
  });
  setSessionCookie(response, token);
}

authRouter.post("/register", async (request, response, next) => {
  try {
    const parsed = registerSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Please check the registration details.", issues: parsed.error.flatten() } });
      return;
    }

    const { organizationName, displayName, email, password } = parsed.data;
    const existingUser = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existingUser) {
      response.status(409).json({ error: { code: "EMAIL_IN_USE", message: "An account with this email already exists." } });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const organizationId = randomUUID();
    const user = await prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: { email, displayName, passwordHash },
        select: { id: true, email: true, displayName: true },
      });
      await tx.organization.create({
        data: {
          id: organizationId,
          name: organizationName,
          slug: `${slugBase(organizationName)}-${randomUUID().slice(0, 8)}`,
          memberships: { create: { userId: createdUser.id, role: "OWNER" } },
        },
      });
      return createdUser;
    });

    await issueSession(user.id, response);
    response.status(201).json({
      data: {
        user,
        organization: { id: organizationId, name: organizationName },
        message: "Workspace created. Your secure session is active.",
      },
    });
  } catch (error) {
    next(error);
  }
});

authRouter.post("/login", async (request, response, next) => {
  try {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Enter a valid email and password." } });
      return;
    }

    const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
    const passwordMatches = user
      ? await bcrypt.compare(parsed.data.password, user.passwordHash)
      : false;

    if (!user || !passwordMatches || !user.isActive) {
      response.status(401).json({ error: { code: "INVALID_CREDENTIALS", message: "Email or password is incorrect." } });
      return;
    }

    await issueSession(user.id, response);
    response.status(200).json({
      data: { user: { id: user.id, email: user.email, displayName: user.displayName } },
    });
  } catch (error) {
    next(error);
  }
});

authRouter.post("/sessions/rotate", authenticate, async (request, response, next) => {
  try {
    if (!request.auth) {
      response.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Authentication is required." } });
      return;
    }

    const token = createSessionToken();
    const now = new Date();
    const rotated = await prisma.$transaction(async (tx) => {
      const revoked = await tx.session.updateMany({
        where: { id: request.auth?.sessionId, revokedAt: null, expiresAt: { gt: now } },
        data: { revokedAt: now },
      });
      if (revoked.count !== 1) return false;
      await tx.session.create({
        data: {
          userId: request.auth?.userId as string,
          tokenHash: hashSessionToken(token),
          expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
        },
      });
      return true;
    });

    if (!rotated) {
      clearSessionCookie(response);
      response.status(401).json({ error: { code: "SESSION_INVALID", message: "The session could not be renewed." } });
      return;
    }

    setSessionCookie(response, token);
    response.status(200).json({ data: { message: "Session renewed." } });
  } catch (error) {
    next(error);
  }
});

authRouter.post("/logout", authenticate, async (request, response, next) => {
  try {
    if (request.auth) {
      await prisma.session.update({
        where: { id: request.auth.sessionId },
        data: { revokedAt: new Date() },
      });
    }
    clearSessionCookie(response);
    response.status(200).json({ data: { message: "You have been signed out." } });
  } catch (error) {
    next(error);
  }
});

authRouter.get("/me", authenticate, async (request, response, next) => {
  try {
    if (!request.auth) return;
    const user = await prisma.user.findUnique({
      where: { id: request.auth.userId },
      select: {
        id: true,
        email: true,
        displayName: true,
        memberships: {
          where: { organization: { status: "ACTIVE" } },
          select: {
            role: true,
            organization: { select: { id: true, name: true, slug: true } },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    response.status(200).json({ data: { user } });
  } catch (error) {
    next(error);
  }
});
