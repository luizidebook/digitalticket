import { PrismaClient, Prisma } from "@prisma/client";
import type { Request, Response, Router } from "express";
import { z } from "zod";
import { authenticateRequest } from "./authRoutes";
import { assertAllowedRole } from "./tenant";
import { couponInputSchema, couponUpdateSchema, validateCoupon } from "./coupons";
import { ConfiguredWhatsAppSender, normalizeBrazilianPhone } from "./integrations";

const prisma = new PrismaClient();

async function organizer(req: Request, res: Response) {
  const session = await authenticateRequest(req);
  if (!session) { res.status(401).json({ error: "UNAUTHORIZED" }); return null; }
  try { assertAllowedRole(session.role, ["ORGANIZER", "SUPER_ADMIN"]); } catch { res.status(403).json({ error: "FORBIDDEN" }); return null; }
  if (!session.organizationId && session.role !== "SUPER_ADMIN") { res.status(403).json({ error: "ORGANIZATION_REQUIRED" }); return null; }
  return session;
}

function tenantFilter(session: { role: string; organizationId?: string }, query: Record<string, unknown>) {
  const organizationId = session.role === "SUPER_ADMIN" && query.organizationId ? String(query.organizationId) : session.organizationId;
  return organizationId;
}

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export function registerManagementRoutes(router: Router) {
  router.get("/api/v1/manage/orders", async (req, res) => {
    const session = await organizer(req, res); if (!session) return;
    const organizationId = tenantFilter(session, req.query as Record<string, unknown>);
    if (!organizationId) return res.status(400).json({ error: "ORGANIZATION_REQUIRED" });
    const { page, pageSize } = paginationSchema.parse(req.query);
    const status = req.query.status ? String(req.query.status) : undefined;
    const eventId = req.query.eventId ? String(req.query.eventId) : undefined;
    const search = req.query.search ? String(req.query.search).trim() : undefined;
    const where: Prisma.OrderWhereInput = {
      organizationId,
      ...(status ? { status } : {}),
      ...(eventId ? { eventId } : {}),
      ...(search ? { OR: [{ id: { contains: search, mode: "insensitive" } }, { buyer: { email: { contains: search, mode: "insensitive" } } }, { buyer: { name: { contains: search, mode: "insensitive" } } }] } : {}),
    };
    const [total, orders] = await Promise.all([
      prisma.order.count({ where }),
      prisma.order.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { buyer: { select: { id: true, name: true, email: true } }, event: { select: { id: true, name: true, slug: true } }, payment: { select: { status: true, method: true, externalId: true } }, items: { include: { lot: { select: { name: true } }, tickets: { select: { id: true, status: true } } } }, coupon: { select: { code: true } } },
      }),
    ]);
    return res.json({ total, page, pageSize, orders });
  });

  router.get("/api/v1/manage/orders/:orderId", async (req, res) => {
    const session = await organizer(req, res); if (!session) return;
    const organizationId = tenantFilter(session, req.query as Record<string, unknown>);
    const order = await prisma.order.findFirst({
      where: { id: req.params.orderId, ...(organizationId ? { organizationId } : {}) },
      include: { buyer: { select: { id: true, name: true, email: true, createdAt: true } }, event: true, payment: true, coupon: true, items: { include: { lot: true, tickets: { include: { checkIns: { orderBy: { createdAt: "desc" }, take: 5 } } } } } },
    });
    if (!order) return res.status(404).json({ error: "ORDER_NOT_FOUND" });
    return res.json(order);
  });

  router.get("/api/v1/manage/customers", async (req, res) => {
    const session = await organizer(req, res); if (!session) return;
    const organizationId = tenantFilter(session, req.query as Record<string, unknown>);
    if (!organizationId) return res.status(400).json({ error: "ORGANIZATION_REQUIRED" });
    const { page, pageSize } = paginationSchema.parse(req.query);
    const search = req.query.search ? String(req.query.search).trim() : undefined;
    const where: Prisma.UserWhereInput = {
      orders: { some: { organizationId } },
      ...(search ? { OR: [{ email: { contains: search, mode: "insensitive" } }, { name: { contains: search, mode: "insensitive" } }] } : {}),
    };
    const [total, customers] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true, name: true, email: true, createdAt: true,
          orders: { where: { organizationId }, select: { id: true, status: true, totalCents: true, createdAt: true }, orderBy: { createdAt: "desc" } },
        },
      }),
    ]);
    return res.json({
      total, page, pageSize,
      customers: customers.map((customer) => ({
        id: customer.id, name: customer.name, email: customer.email, createdAt: customer.createdAt,
        ordersCount: customer.orders.length,
        paidOrders: customer.orders.filter((order) => order.status === "PAID").length,
        lifetimeValueCents: customer.orders.filter((order) => order.status === "PAID").reduce((sum, order) => sum + order.totalCents, 0),
        lastOrderAt: customer.orders[0]?.createdAt ?? null,
      })),
    });
  });

  router.get("/api/v1/manage/coupons", async (req, res) => {
    const session = await organizer(req, res); if (!session) return;
    const organizationId = tenantFilter(session, req.query as Record<string, unknown>);
    if (!organizationId) return res.status(400).json({ error: "ORGANIZATION_REQUIRED" });
    const coupons = await prisma.coupon.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" }, include: { _count: { select: { orders: true } } } });
    return res.json(coupons.map((coupon) => ({ ...coupon, ordersCount: coupon._count.orders })));
  });

  router.post("/api/v1/manage/coupons", async (req, res) => {
    const session = await organizer(req, res); if (!session) return;
    const organizationId = tenantFilter(session, req.body ?? {});
    if (!organizationId) return res.status(400).json({ error: "ORGANIZATION_REQUIRED" });
    const parsed = couponInputSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "INVALID_COUPON", details: parsed.error.flatten() });
    const existing = await prisma.coupon.findUnique({ where: { organizationId_code: { organizationId, code: parsed.data.code } } });
    if (existing) return res.status(409).json({ error: "COUPON_ALREADY_EXISTS" });
    const coupon = await prisma.coupon.create({ data: { ...parsed.data, organizationId, percentageOff: parsed.data.percentageOff ?? null, fixedOffCents: parsed.data.fixedOffCents ?? null, maxUses: parsed.data.maxUses ?? null, startsAt: parsed.data.startsAt ?? null, endsAt: parsed.data.endsAt ?? null } });
    return res.status(201).json(coupon);
  });

  router.patch("/api/v1/manage/coupons/:couponId", async (req, res) => {
    const session = await organizer(req, res); if (!session) return;
    const organizationId = tenantFilter(session, req.body ?? {});
    const parsed = couponUpdateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "INVALID_COUPON", details: parsed.error.flatten() });
    const coupon = await prisma.coupon.findFirst({ where: { id: req.params.couponId, ...(organizationId ? { organizationId } : {}) } });
    if (!coupon) return res.status(404).json({ error: "COUPON_NOT_FOUND" });
    const updated = await prisma.coupon.update({ where: { id: coupon.id }, data: { ...parsed.data, percentageOff: parsed.data.percentageOff === null ? null : parsed.data.percentageOff ?? coupon.percentageOff, fixedOffCents: parsed.data.fixedOffCents === null ? null : parsed.data.fixedOffCents ?? coupon.fixedOffCents } });
    return res.json(updated);
  });

  router.delete("/api/v1/manage/coupons/:couponId", async (req, res) => {
    const session = await organizer(req, res); if (!session) return;
    const organizationId = tenantFilter(session, req.query as Record<string, unknown>);
    const coupon = await prisma.coupon.findFirst({ where: { id: req.params.couponId, ...(organizationId ? { organizationId } : {}) } });
    if (!coupon) return res.status(404).json({ error: "COUPON_NOT_FOUND" });
    const usage = await prisma.order.count({ where: { couponId: coupon.id } });
    if (usage > 0) {
      await prisma.coupon.update({ where: { id: coupon.id }, data: { active: false } });
      return res.json({ deactivated: true, reason: "COUPON_HAS_ORDERS" });
    }
    await prisma.coupon.delete({ where: { id: coupon.id } });
    return res.status(204).send();
  });

  router.post("/api/v1/manage/orders/:orderId/send-whatsapp", async (req, res) => {
    const session = await organizer(req, res); if (!session) return;
    const organizationId = tenantFilter(session, req.body ?? {});
    const phone = z.string().trim().min(10).max(20).safeParse(req.body?.phone);
    if (!phone.success) return res.status(400).json({ error: "INVALID_PHONE" });
    try { normalizeBrazilianPhone(phone.data); } catch { return res.status(400).json({ error: "INVALID_PHONE" }); }
    const order = await prisma.order.findFirst({
      where: { id: req.params.orderId, status: "PAID", ...(organizationId ? { organizationId } : {}) },
      include: { buyer: { select: { name: true } }, event: { select: { name: true } }, items: { include: { tickets: { select: { checkInCode: true } } } } },
    });
    if (!order) return res.status(404).json({ error: "ORDER_NOT_FOUND_OR_NOT_PAID" });
    const codes = order.items.flatMap((item) => item.tickets.map((ticket) => ticket.checkInCode));
    if (!codes.length) return res.status(409).json({ error: "ORDER_HAS_NO_TICKETS" });
    const sender = new ConfiguredWhatsAppSender();
    try {
      const orderUrl = process.env.PUBLIC_WEB_URL ? `${process.env.PUBLIC_WEB_URL}/buyer/orders/${order.id}` : undefined;
      await sender.sendVoucher({ phone: phone.data, holderName: order.buyer.name, eventName: order.event.name, checkInCode: codes.join(", "), orderUrl });
      return res.json({ sent: true, tickets: codes.length });
    } catch (error: any) {
      if (String(error?.message).includes("WHATSAPP_NOT_CONFIGURED")) return res.status(503).json({ error: "WHATSAPP_NOT_CONFIGURED" });
      return res.status(502).json({ error: "WHATSAPP_DELIVERY_FAILED" });
    }
  });

  router.post("/api/v1/public/coupons/validate", async (req, res) => {
    const parsed = z.object({ organizationId: z.string().min(1), code: z.string().trim().min(3), subtotalCents: z.number().int().nonnegative() }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "INVALID_REQUEST" });
    const coupon = await prisma.coupon.findUnique({ where: { organizationId_code: { organizationId: parsed.data.organizationId, code: parsed.data.code.toUpperCase() } } });
    if (!coupon) return res.status(404).json({ valid: false, reason: "COUPON_NOT_FOUND" });
    const validation = validateCoupon(coupon);
    if (!validation.valid) return res.status(422).json(validation);
    const { computeCouponDiscountCents } = await import("./coupons");
    return res.json({ valid: true, code: coupon.code, discountCents: computeCouponDiscountCents(coupon, parsed.data.subtotalCents) });
  });
}
