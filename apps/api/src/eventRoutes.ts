import { PrismaClient } from "@prisma/client";
import type { Request, Response, Router } from "express";
import { z } from "zod";
import { authenticateRequest } from "./authRoutes";
import { assertAllowedRole } from "./tenant";

const prisma = new PrismaClient();
const eventSchema = z.object({ name: z.string().min(2).max(120), slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/), type: z.string().min(2).max(60), category: z.string().max(60).optional(), tags: z.array(z.string()).max(20).default([]), description: z.string().max(10000).optional(), imageUrl: z.string().url().optional(), startsAt: z.coerce.date().optional(), endsAt: z.coerce.date().optional() });
const lotSchema = z.object({ name: z.string().min(1).max(80), priceInCents: z.number().int().nonnegative(), capacity: z.number().int().positive(), maxPerOrder: z.number().int().positive().max(50).default(10), saleStartsAt: z.coerce.date().optional(), saleEndsAt: z.coerce.date().optional() });

async function organizer(req: Request, res: Response) {
  const session = await authenticateRequest(req);
  if (!session) { res.status(401).json({ error: "UNAUTHORIZED" }); return null; }
  try { assertAllowedRole(session.role, ["ORGANIZER", "SUPER_ADMIN"]); } catch { res.status(403).json({ error: "FORBIDDEN" }); return null; }
  if (!session.organizationId && session.role !== "SUPER_ADMIN") { res.status(403).json({ error: "ORGANIZATION_REQUIRED" }); return null; }
  return session;
}

export function registerEventRoutes(router: Router) {
  router.get("/api/v1/public/events/:organizationSlug/:eventSlug", async (req, res) => {
    const event = await prisma.event.findFirst({ where: { slug: req.params.eventSlug, status: "PUBLISHED", organization: { slug: req.params.organizationSlug } }, include: { organization: true, lots: { where: { active: true }, orderBy: { sortOrder: "asc" } } } });
    if (!event) return res.status(404).json({ error: "EVENT_NOT_FOUND" });
    return res.json({ ...event, lots: event.lots.map((lot) => ({ ...lot, available: lot.capacity - lot.sold })) });
  });

  router.get("/api/v1/events", async (req, res) => {
    const session = await organizer(req, res); if (!session) return;
    const events = await prisma.event.findMany({ where: session.role === "SUPER_ADMIN" && !session.organizationId ? undefined : { organizationId: session.organizationId }, include: { lots: true }, orderBy: { createdAt: "desc" } });
    return res.json(events);
  });

  router.post("/api/v1/events", async (req, res) => {
    const session = await organizer(req, res); if (!session || !session.organizationId) return res.status(400).json({ error: "ORGANIZATION_REQUIRED" });
    const parsed = eventSchema.safeParse(req.body); if (!parsed.success) return res.status(400).json({ error: "INVALID_EVENT", details: parsed.error.flatten() });
    const event = await prisma.event.create({ data: { ...parsed.data, organizationId: session.organizationId } });
    return res.status(201).json(event);
  });

  router.post("/api/v1/events/:eventId/lots", async (req, res) => {
    const session = await organizer(req, res); if (!session || !session.organizationId) return res.status(400).json({ error: "ORGANIZATION_REQUIRED" });
    const parsed = lotSchema.safeParse(req.body); if (!parsed.success) return res.status(400).json({ error: "INVALID_LOT", details: parsed.error.flatten() });
    const event = await prisma.event.findFirst({ where: { id: req.params.eventId, organizationId: session.organizationId } });
    if (!event) return res.status(404).json({ error: "EVENT_NOT_FOUND" });
    const lot = await prisma.lot.create({ data: { ...parsed.data, eventId: event.id } });
    return res.status(201).json(lot);
  });

  router.post("/api/v1/events/:eventId/publish", async (req, res) => {
    const session = await organizer(req, res); if (!session || !session.organizationId) return res.status(400).json({ error: "ORGANIZATION_REQUIRED" });
    const event = await prisma.event.updateMany({ where: { id: req.params.eventId, organizationId: session.organizationId }, data: { status: "PUBLISHED", publishedAt: new Date() } });
    if (!event.count) return res.status(404).json({ error: "EVENT_NOT_FOUND" });
    return res.status(204).send();
  });
}
