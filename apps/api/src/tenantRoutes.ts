import { PrismaClient } from "@prisma/client";
import type { Request, Response, Router } from "express";
import { z } from "zod";
import { authenticateRequest } from "./authRoutes";
import { assertAllowedRole, resolveTenant } from "./tenant";

const prisma = new PrismaClient();

const brandingSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  domain: z.string().trim().toLowerCase().regex(/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/, "domínio inválido").nullish(),
  logoUrl: z.string().url().nullish(),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

function publicOrganization(organization: { id: string; name: string; slug: string; domain: string | null; logoUrl: string | null; primaryColor: string; accentColor: string }) {
  return { id: organization.id, name: organization.name, slug: organization.slug, domain: organization.domain, logoUrl: organization.logoUrl, primaryColor: organization.primaryColor, accentColor: organization.accentColor };
}

export function registerTenantRoutes(router: Router) {
  router.get("/api/v1/public/tenants/resolve", async (req, res) => {
    const hostOrSlug = String(req.query.host ?? req.query.slug ?? "");
    if (!hostOrSlug) return res.status(400).json({ error: "HOST_OR_SLUG_REQUIRED" });
    const organizations = await prisma.organization.findMany({ select: { id: true, slug: true, domain: true } });
    const match = resolveTenant(organizations.map((org) => ({ ...org, active: true })), hostOrSlug);
    if (!match) return res.status(404).json({ error: "TENANT_NOT_FOUND" });
    const organization = await prisma.organization.findUnique({ where: { id: match.id } });
    if (!organization) return res.status(404).json({ error: "TENANT_NOT_FOUND" });
    return res.json(publicOrganization(organization));
  });

  router.get("/api/v1/public/tenants/:slug", async (req, res) => {
    const organization = await prisma.organization.findUnique({ where: { slug: req.params.slug } });
    if (!organization) return res.status(404).json({ error: "TENANT_NOT_FOUND" });
    const events = await prisma.event.findMany({
      where: { organizationId: organization.id, status: "PUBLISHED" },
      orderBy: { startsAt: "asc" },
      select: { id: true, name: true, slug: true, description: true, imageUrl: true, startsAt: true, endsAt: true, category: true, lots: { where: { active: true }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true, priceInCents: true, capacity: true, sold: true } } },
    });
    return res.json({ ...publicOrganization(organization), events: events.map((event) => ({ ...event, lots: event.lots.map((lot) => ({ ...lot, available: lot.capacity - lot.sold })) })) });
  });

  router.get("/api/v1/tenant/branding", async (req, res) => {
    const session = await authenticateRequest(req);
    if (!session) return res.status(401).json({ error: "UNAUTHORIZED" });
    try { assertAllowedRole(session.role, ["ORGANIZER", "SUPER_ADMIN"]); } catch { return res.status(403).json({ error: "FORBIDDEN" }); }
    const organizationId = session.role === "SUPER_ADMIN" && req.query.organizationId ? String(req.query.organizationId) : session.organizationId;
    if (!organizationId) return res.status(400).json({ error: "ORGANIZATION_REQUIRED" });
    const organization = await prisma.organization.findUnique({ where: { id: organizationId } });
    if (!organization) return res.status(404).json({ error: "ORGANIZATION_NOT_FOUND" });
    return res.json(organization);
  });

  router.patch("/api/v1/tenant/branding", async (req, res) => {
    const session = await authenticateRequest(req);
    if (!session) return res.status(401).json({ error: "UNAUTHORIZED" });
    try { assertAllowedRole(session.role, ["ORGANIZER", "SUPER_ADMIN"]); } catch { return res.status(403).json({ error: "FORBIDDEN" }); }
    const organizationId = session.role === "SUPER_ADMIN" && req.body?.organizationId ? String(req.body.organizationId) : session.organizationId;
    if (!organizationId) return res.status(400).json({ error: "ORGANIZATION_REQUIRED" });
    const parsed = brandingSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "INVALID_BRANDING", details: parsed.error.flatten() });
    const organization = await prisma.organization.findUnique({ where: { id: organizationId } });
    if (!organization) return res.status(404).json({ error: "ORGANIZATION_NOT_FOUND" });
    if (parsed.data.domain && parsed.data.domain !== organization.domain) {
      const domainTaken = await prisma.organization.findUnique({ where: { domain: parsed.data.domain } });
      if (domainTaken) return res.status(409).json({ error: "DOMAIN_ALREADY_TAKEN" });
    }
    const updated = await prisma.organization.update({
      where: { id: organization.id },
      data: {
        ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
        ...(parsed.data.domain !== undefined ? { domain: parsed.data.domain } : {}),
        ...(parsed.data.logoUrl !== undefined ? { logoUrl: parsed.data.logoUrl } : {}),
        ...(parsed.data.primaryColor !== undefined ? { primaryColor: parsed.data.primaryColor } : {}),
        ...(parsed.data.accentColor !== undefined ? { accentColor: parsed.data.accentColor } : {}),
      },
    });
    return res.json(updated);
  });
}
