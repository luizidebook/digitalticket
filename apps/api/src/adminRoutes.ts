import { PrismaClient } from "@prisma/client";
import argon2 from "argon2";
import type { Request, Response, Router } from "express";
import { z } from "zod";
import { authenticateRequest } from "./authRoutes";
import { buildConsolidatedMetrics, organizationInputSchema, organizationUpdateSchema, platformFeeSchema, type PlatformFeeConfig, DEFAULT_PLATFORM_FEE } from "./admin";

const prisma = new PrismaClient();

const organizerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(8).max(128),
});

async function superAdmin(req: Request, res: Response) {
  const session = await authenticateRequest(req);
  if (!session) { res.status(401).json({ error: "UNAUTHORIZED" }); return null; }
  if (session.role !== "SUPER_ADMIN") { res.status(403).json({ error: "FORBIDDEN" }); return null; }
  return session;
}

function readPlatformFee(): PlatformFeeConfig {
  const raw = process.env.PLATFORM_FEE_CONFIG;
  if (!raw) return DEFAULT_PLATFORM_FEE;
  const parsed = platformFeeSchema.safeParse(JSON.parse(raw));
  return parsed.success ? parsed.data : DEFAULT_PLATFORM_FEE;
}

export function registerAdminRoutes(router: Router) {
  router.get("/api/v1/admin/overview", async (req, res) => {
    const session = await superAdmin(req, res); if (!session) return;
    const [organizations, events, paidOrders, ticketsIssued] = await Promise.all([
      prisma.organization.count(),
      prisma.event.count(),
      prisma.order.findMany({ where: { status: "PAID" }, select: { totalCents: true } }),
      prisma.ticket.count({ where: { status: { not: "CANCELLED" } } }),
    ]);
    return res.json(buildConsolidatedMetrics({ organizations, events, paidOrders, ticketsIssued, fee: readPlatformFee() }));
  });

  router.get("/api/v1/admin/organizations", async (req, res) => {
    const session = await superAdmin(req, res); if (!session) return;
    const organizations = await prisma.organization.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { events: true, orders: true, users: true } },
        orders: { where: { status: "PAID" }, select: { totalCents: true } },
      },
    });
    return res.json(organizations.map((org) => ({
      id: org.id, name: org.name, slug: org.slug, domain: org.domain, logoUrl: org.logoUrl,
      primaryColor: org.primaryColor, accentColor: org.accentColor, createdAt: org.createdAt,
      events: org._count.events, orders: org._count.orders, users: org._count.users,
      grossRevenueCents: org.orders.reduce((sum, order) => sum + order.totalCents, 0),
    })));
  });

  router.post("/api/v1/admin/organizations", async (req, res) => {
    const session = await superAdmin(req, res); if (!session) return;
    const parsed = organizationInputSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "INVALID_ORGANIZATION", details: parsed.error.flatten() });
    const existing = await prisma.organization.findFirst({ where: { OR: [{ slug: parsed.data.slug }, ...(parsed.data.domain ? [{ domain: parsed.data.domain }] : [])] } });
    if (existing) return res.status(409).json({ error: "ORGANIZATION_ALREADY_EXISTS" });
    const organization = await prisma.organization.create({ data: { ...parsed.data, domain: parsed.data.domain ?? null, logoUrl: parsed.data.logoUrl ?? null } });
    return res.status(201).json(organization);
  });

  router.patch("/api/v1/admin/organizations/:organizationId", async (req, res) => {
    const session = await superAdmin(req, res); if (!session) return;
    const parsed = organizationUpdateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "INVALID_ORGANIZATION", details: parsed.error.flatten() });
    const organization = await prisma.organization.findUnique({ where: { id: req.params.organizationId } });
    if (!organization) return res.status(404).json({ error: "ORGANIZATION_NOT_FOUND" });
    if (parsed.data.slug && parsed.data.slug !== organization.slug) {
      const slugTaken = await prisma.organization.findUnique({ where: { slug: parsed.data.slug } });
      if (slugTaken) return res.status(409).json({ error: "SLUG_ALREADY_TAKEN" });
    }
    if (parsed.data.domain && parsed.data.domain !== organization.domain) {
      const domainTaken = await prisma.organization.findUnique({ where: { domain: parsed.data.domain } });
      if (domainTaken) return res.status(409).json({ error: "DOMAIN_ALREADY_TAKEN" });
    }
    const updated = await prisma.organization.update({ where: { id: organization.id }, data: parsed.data });
    return res.json(updated);
  });

  router.get("/api/v1/admin/organizations/:organizationId/organizers", async (req, res) => {
    const session = await superAdmin(req, res); if (!session) return;
    const organizers = await prisma.user.findMany({
      where: { organizationId: req.params.organizationId, role: "ORGANIZER" },
      select: { id: true, name: true, email: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });
    return res.json(organizers);
  });

  router.post("/api/v1/admin/organizations/:organizationId/organizers", async (req, res) => {
    const session = await superAdmin(req, res); if (!session) return;
    const organization = await prisma.organization.findUnique({ where: { id: req.params.organizationId } });
    if (!organization) return res.status(404).json({ error: "ORGANIZATION_NOT_FOUND" });
    const parsed = organizerSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "INVALID_ORGANIZER", details: parsed.error.flatten() });
    const existing = await prisma.user.findUnique({ where: { email: parsed.data.email } });
    if (existing) return res.status(409).json({ error: "EMAIL_ALREADY_REGISTERED" });
    const user = await prisma.user.create({
      data: { name: parsed.data.name, email: parsed.data.email, passwordHash: await argon2.hash(parsed.data.password), role: "ORGANIZER", organizationId: organization.id },
      select: { id: true, name: true, email: true, role: true, organizationId: true, createdAt: true },
    });
    return res.status(201).json(user);
  });

  router.delete("/api/v1/admin/organizers/:userId", async (req, res) => {
    const session = await superAdmin(req, res); if (!session) return;
    const user = await prisma.user.findUnique({ where: { id: req.params.userId } });
    if (!user || user.role !== "ORGANIZER") return res.status(404).json({ error: "ORGANIZER_NOT_FOUND" });
    await prisma.$transaction([
      prisma.refreshToken.deleteMany({ where: { userId: user.id } }),
      prisma.user.delete({ where: { id: user.id } }),
    ]);
    return res.status(204).send();
  });

  router.get("/api/v1/admin/platform/fees", async (req, res) => {
    const session = await superAdmin(req, res); if (!session) return;
    return res.json({ fee: readPlatformFee(), source: process.env.PLATFORM_FEE_CONFIG ? "env" : "default" });
  });
}
