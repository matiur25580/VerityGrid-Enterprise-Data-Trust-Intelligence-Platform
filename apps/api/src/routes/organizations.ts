import { Router } from "express";
import { prisma } from "../lib/prisma";
import { authenticate, requireRoles, requireTenant } from "../middleware/authenticate";

export const organizationsRouter = Router();

organizationsRouter.use(authenticate);

organizationsRouter.get("/", async (request, response, next) => {
  try {
    const memberships = await prisma.membership.findMany({
      where: { userId: request.auth?.userId, organization: { status: "ACTIVE" } },
      select: {
        role: true,
        organization: { select: { id: true, name: true, slug: true, createdAt: true } },
      },
      orderBy: { createdAt: "asc" },
    });
    response.status(200).json({ data: { organizations: memberships } });
  } catch (error) {
    next(error);
  }
});

organizationsRouter.get("/current", requireTenant, (request, response) => {
  response.status(200).json({ data: { organization: request.tenant } });
});

organizationsRouter.get("/current/admin-check", requireTenant, requireRoles("OWNER", "ADMIN"), (_request, response) => {
  response.status(200).json({ data: { allowed: true } });
});
