import { PrismaClient } from "@prisma/client";
import type { Request, Response, Router } from "express";
import { z } from "zod";
import { authenticateRequest } from "./authRoutes";
import { assertAllowedRole } from "./tenant";
import { assertEventDateWindow, eventDateInputSchema, eventInputSchema, lotInputSchema } from "./events";

const prisma = new PrismaClient();

const eventUpdateSchema = eventInputSchema.partial().extend({ status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).optional() });
const lotUpdateSchema = lotInputSchema.partial();

async function organizer(req: Request, res: Response) {
  const session = await authenticateRequest(req);
  if (!session) { res.status(401).json({ error: "UNAUTHORIZED" }); return null; }
  try { assertAllowedRole(session.role, ["ORGANIZER", "SUPER_ADMIN"]); } catch { res.status(403).json({ error: "FORBIDDEN" }); return null; }
  if (!session.organizationId && session.role !== "SUPER_ADMIN") { res.status(403).json({ error: "ORGANIZATION_REQUIRED" }); return null; }
  return session;
}

function scopedOrganizationId(session: { role: string; organizationId?: string }, queryOrBody: Record<string, unknown>) {
  return session.role === "SUPER_ADMIN" && queryOrBody.organizationId ? String(queryOrBody.organizationId) : session.organizationId;
}

export function registerEventRoutes(router: Router) {
  router.get("/api/v1/public/events/:organizationSlug/:eventSlug", async (req, res) => {
    const event = await prisma.event.findFirst({
      where: { slug: req.params.eventSlug, status: "PUBLISHED", organization: { slug: req.params.organizationSlug } },
      include: {
        organization: true,
        dates: { where: { active: true }, orderBy: [{ sortOrder: "asc" }, { startsAt: "asc" }] },
        lots: { where: { active: true }, orderBy: { sortOrder: "asc" }, include: { eventDate: true } },
      },
    });
    if (!event) return res.status(404).json({ error: "EVENT_NOT_FOUND" });
    return res.json({
      ...event,
      dates: event.dates.map((date) => ({ ...date, lots: event.lots.filter((lot) => lot.eventDateId === date.id).map((lot) => ({ ...lot, available: lot.capacity - lot.sold })) })),
      lots: event.lots.map((lot) => ({ ...lot, available: lot.capacity - lot.sold })),
    });
  });

  router.get("/api/v1/events", async (req, res) => {
    const session = await organizer(req, res); if (!session) return;
    const organizationId = scopedOrganizationId(session, req.query as Record<string, unknown>);
    const events = await prisma.event.findMany({
      where: organizationId ? { organizationId } : undefined,
      include: { lots: true, dates: { orderBy: [{ sortOrder: "asc" }, { startsAt: "asc" }] } },
      orderBy: { createdAt: "desc" },
    });
    return res.json(events);
  });

  router.get("/api/v1/events/:eventId", async (req, res) => {
    const session = await organizer(req, res); if (!session) return;
    const organizationId = scopedOrganizationId(session, req.query as Record<string, unknown>);
    const event = await prisma.event.findFirst({
      where: { id: req.params.eventId, ...(organizationId ? { organizationId } : {}) },
      include: { lots: { orderBy: { sortOrder: "asc" }, include: { eventDate: true } }, dates: { orderBy: [{ sortOrder: "asc" }, { startsAt: "asc" }] } },
    });
    if (!event) return res.status(404).json({ error: "EVENT_NOT_FOUND" });
    return res.json(event);
  });

  router.post("/api/v1/events", async (req, res) => {
    const session = await organizer(req, res); if (!session) return;
    const organizationId = scopedOrganizationId(session, req.body ?? {});
    if (!organizationId) return res.status(400).json({ error: "ORGANIZATION_REQUIRED" });
    const parsed = eventInputSchema.safeParse(req.body); if (!parsed.success) return res.status(400).json({ error: "INVALID_EVENT", details: parsed.error.flatten() });
    const slugTaken = await prisma.event.findUnique({ where: { organizationId_slug: { organizationId, slug: parsed.data.slug } } });
    if (slugTaken) return res.status(409).json({ error: "EVENT_SLUG_ALREADY_TAKEN" });
    const event = await prisma.event.create({ data: { ...parsed.data, organizationId } });
    return res.status(201).json(event);
  });

  router.patch("/api/v1/events/:eventId", async (req, res) => {
    const session = await organizer(req, res); if (!session) return;
    const organizationId = scopedOrganizationId(session, req.body ?? {});
    const parsed = eventUpdateSchema.safeParse(req.body); if (!parsed.success) return res.status(400).json({ error: "INVALID_EVENT", details: parsed.error.flatten() });
    const event = await prisma.event.findFirst({ where: { id: req.params.eventId, ...(organizationId ? { organizationId } : {}) } });
    if (!event) return res.status(404).json({ error: "EVENT_NOT_FOUND" });
    if (parsed.data.slug && parsed.data.slug !== event.slug) {
      const slugTaken = await prisma.event.findUnique({ where: { organizationId_slug: { organizationId: event.organizationId, slug: parsed.data.slug } } });
      if (slugTaken) return res.status(409).json({ error: "EVENT_SLUG_ALREADY_TAKEN" });
    }
    const data = { ...parsed.data };
    if (data.status === "PUBLISHED" && event.status !== "PUBLISHED") Object.assign(data, { publishedAt: new Date() });
    const updated = await prisma.event.update({ where: { id: event.id }, data });
    return res.json(updated);
  });

  router.post("/api/v1/events/:eventId/dates", async (req, res) => {
    const session = await organizer(req, res); if (!session) return;
    const organizationId = scopedOrganizationId(session, req.body ?? {});
    const parsed = eventDateInputSchema.safeParse(req.body); if (!parsed.success) return res.status(400).json({ error: "INVALID_EVENT_DATE", details: parsed.error.flatten() });
    try { assertEventDateWindow(parsed.data); } catch (error: any) { return res.status(400).json({ error: error.message }); }
    const event = await prisma.event.findFirst({ where: { id: req.params.eventId, ...(organizationId ? { organizationId } : {}) } });
    if (!event) return res.status(404).json({ error: "EVENT_NOT_FOUND" });
    const date = await prisma.eventDate.create({ data: { eventId: event.id, label: parsed.data.label ?? null, startsAt: parsed.data.startsAt ?? null, endsAt: parsed.data.endsAt ?? null, sortOrder: parsed.data.sortOrder, active: parsed.data.active } });
    return res.status(201).json(date);
  });

  router.patch("/api/v1/events/:eventId/dates/:dateId", async (req, res) => {
    const session = await organizer(req, res); if (!session) return;
    const organizationId = scopedOrganizationId(session, req.body ?? {});
    const parsed = eventDateInputSchema.partial().safeParse(req.body); if (!parsed.success) return res.status(400).json({ error: "INVALID_EVENT_DATE", details: parsed.error.flatten() });
    const date = await prisma.eventDate.findFirst({ where: { id: req.params.dateId, eventId: req.params.eventId, event: organizationId ? { organizationId } : undefined } });
    if (!date) return res.status(404).json({ error: "EVENT_DATE_NOT_FOUND" });
    const next = { startsAt: parsed.data.startsAt !== undefined ? parsed.data.startsAt : date.startsAt, endsAt: parsed.data.endsAt !== undefined ? parsed.data.endsAt : date.endsAt };
    try { assertEventDateWindow(next); } catch (error: any) { return res.status(400).json({ error: error.message }); }
    const updated = await prisma.eventDate.update({ where: { id: date.id }, data: parsed.data });
    return res.json(updated);
  });

  router.delete("/api/v1/events/:eventId/dates/:dateId", async (req, res) => {
    const session = await organizer(req, res); if (!session) return;
    const organizationId = scopedOrganizationId(session, req.query as Record<string, unknown>);
    const date = await prisma.eventDate.findFirst({ where: { id: req.params.dateId, eventId: req.params.eventId, event: organizationId ? { organizationId } : undefined }, include: { lots: true } });
    if (!date) return res.status(404).json({ error: "EVENT_DATE_NOT_FOUND" });
    if (date.lots.length > 0) {
      await prisma.eventDate.update({ where: { id: date.id }, data: { active: false } });
      return res.json({ deactivated: true, reason: "EVENT_DATE_HAS_LOTS" });
    }
    await prisma.eventDate.delete({ where: { id: date.id } });
    return res.status(204).send();
  });

  router.post("/api/v1/events/:eventId/lots", async (req, res) => {
    const session = await organizer(req, res); if (!session) return;
    const organizationId = scopedOrganizationId(session, req.body ?? {});
    const parsed = lotInputSchema.safeParse(req.body); if (!parsed.success) return res.status(400).json({ error: "INVALID_LOT", details: parsed.error.flatten() });
    const event = await prisma.event.findFirst({ where: { id: req.params.eventId, ...(organizationId ? { organizationId } : {}) } });
    if (!event) return res.status(404).json({ error: "EVENT_NOT_FOUND" });
    if (parsed.data.eventDateId) {
      const date = await prisma.eventDate.findFirst({ where: { id: parsed.data.eventDateId, eventId: event.id } });
      if (!date) return res.status(404).json({ error: "EVENT_DATE_NOT_FOUND" });
    }
    const lot = await prisma.lot.create({ data: { ...parsed.data, eventDateId: parsed.data.eventDateId ?? null, eventId: event.id } });
    return res.status(201).json(lot);
  });

  router.patch("/api/v1/events/:eventId/lots/:lotId", async (req, res) => {
    const session = await organizer(req, res); if (!session) return;
    const organizationId = scopedOrganizationId(session, req.body ?? {});
    const parsed = lotUpdateSchema.safeParse(req.body); if (!parsed.success) return res.status(400).json({ error: "INVALID_LOT", details: parsed.error.flatten() });
    const lot = await prisma.lot.findFirst({ where: { id: req.params.lotId, eventId: req.params.eventId, event: organizationId ? { organizationId } : undefined } });
    if (!lot) return res.status(404).json({ error: "LOT_NOT_FOUND" });
    if (parsed.data.capacity !== undefined && parsed.data.capacity < lot.sold) return res.status(409).json({ error: "CAPACITY_BELOW_SOLD", sold: lot.sold });
    if (parsed.data.eventDateId) {
      const date = await prisma.eventDate.findFirst({ where: { id: parsed.data.eventDateId, eventId: lot.eventId } });
      if (!date) return res.status(404).json({ error: "EVENT_DATE_NOT_FOUND" });
    }
    const updated = await prisma.lot.update({ where: { id: lot.id }, data: { ...parsed.data, eventDateId: parsed.data.eventDateId === null ? null : parsed.data.eventDateId ?? lot.eventDateId } });
    return res.json(updated);
  });

  router.delete("/api/v1/events/:eventId/lots/:lotId", async (req, res) => {
    const session = await organizer(req, res); if (!session) return;
    const organizationId = scopedOrganizationId(session, req.query as Record<string, unknown>);
    const lot = await prisma.lot.findFirst({ where: { id: req.params.lotId, eventId: req.params.eventId, event: organizationId ? { organizationId } : undefined } });
    if (!lot) return res.status(404).json({ error: "LOT_NOT_FOUND" });
    if (lot.sold > 0) {
      await prisma.lot.update({ where: { id: lot.id }, data: { active: false } });
      return res.json({ deactivated: true, reason: "LOT_HAS_SALES" });
    }
    await prisma.lot.delete({ where: { id: lot.id } });
    return res.status(204).send();
  });

  router.post("/api/v1/events/:eventId/publish", async (req, res) => {
    const session = await organizer(req, res); if (!session) return;
    const organizationId = scopedOrganizationId(session, req.body ?? {});
    const event = await prisma.event.updateMany({ where: { id: req.params.eventId, ...(organizationId ? { organizationId } : {}) }, data: { status: "PUBLISHED", publishedAt: new Date() } });
    if (!event.count) return res.status(404).json({ error: "EVENT_NOT_FOUND" });
    return res.status(204).send();
  });
}
