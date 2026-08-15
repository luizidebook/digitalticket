import { PrismaClient } from "@prisma/client";
import type { Request, Response, Router } from "express";
import { authenticateRequest } from "./authRoutes";
import { assertAllowedRole } from "./tenant";
import { buildDailySalesSeries, buildEventReport, toCsv } from "./reports";

const prisma = new PrismaClient();

async function organizer(req: Request, res: Response) {
  const session = await authenticateRequest(req);
  if (!session) { res.status(401).json({ error: "UNAUTHORIZED" }); return null; }
  try { assertAllowedRole(session.role, ["ORGANIZER", "SUPER_ADMIN"]); } catch { res.status(403).json({ error: "FORBIDDEN" }); return null; }
  if (!session.organizationId && session.role !== "SUPER_ADMIN") { res.status(403).json({ error: "ORGANIZATION_REQUIRED" }); return null; }
  return session;
}

function resolveOrganizationId(session: { role: string; organizationId?: string }, query: Record<string, unknown>) {
  return session.role === "SUPER_ADMIN" && query.organizationId ? String(query.organizationId) : session.organizationId;
}

function csvResponse(res: Response, filename: string, csv: string) {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  return res.send(csv);
}

export function registerReportRoutes(router: Router) {
  router.get("/api/v1/reports/summary", async (req, res) => {
    const session = await organizer(req, res); if (!session) return;
    const organizationId = resolveOrganizationId(session, req.query as Record<string, unknown>);
    if (!organizationId) return res.status(400).json({ error: "ORGANIZATION_REQUIRED" });
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [paidOrders, ticketsIssued, checkIns, customers, events] = await Promise.all([
      prisma.order.findMany({ where: { organizationId, status: "PAID" }, select: { totalCents: true, createdAt: true } }),
      prisma.ticket.count({ where: { status: { not: "CANCELLED" }, orderItem: { order: { organizationId } } } }),
      prisma.checkIn.count({ where: { result: "USED", ticket: { orderItem: { order: { organizationId } } } } }),
      prisma.user.count({ where: { orders: { some: { organizationId, status: "PAID" } } } }),
      prisma.event.count({ where: { organizationId } }),
    ]);
    const grossRevenueCents = paidOrders.reduce((sum, order) => sum + order.totalCents, 0);
    const last30Days = buildDailySalesSeries(paidOrders.filter((order) => order.createdAt >= since));
    return res.json({ grossRevenueCents, paidOrders: paidOrders.length, ticketsIssued, checkIns, customers, events, last30Days });
  });

  router.get("/api/v1/reports/events", async (req, res) => {
    const session = await organizer(req, res); if (!session) return;
    const organizationId = resolveOrganizationId(session, req.query as Record<string, unknown>);
    if (!organizationId) return res.status(400).json({ error: "ORGANIZATION_REQUIRED" });
    const events = await prisma.event.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      include: {
        lots: true,
        orders: { where: { status: "PAID" }, select: { totalCents: true, items: { select: { tickets: { select: { status: true, checkIns: { select: { id: true } } } } } } } },
      },
    });
    return res.json(events.map((event) => buildEventReport({
      eventId: event.id,
      eventName: event.name,
      status: event.status,
      lots: event.lots,
      paidOrders: event.orders,
      tickets: event.orders.flatMap((order) => order.items.flatMap((item) => item.tickets)),
    })));
  });

  router.get("/api/v1/reports/orders.csv", async (req, res) => {
    const session = await organizer(req, res); if (!session) return;
    const organizationId = resolveOrganizationId(session, req.query as Record<string, unknown>);
    if (!organizationId) return res.status(400).json({ error: "ORGANIZATION_REQUIRED" });
    const orders = await prisma.order.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      take: 5000,
      include: { buyer: { select: { name: true, email: true } }, event: { select: { name: true } }, payment: { select: { method: true, status: true } }, coupon: { select: { code: true } }, items: { select: { quantity: true } } },
    });
    const csv = toCsv(
      ["pedido_id", "data", "comprador", "email", "evento", "itens", "status", "pagamento_metodo", "pagamento_status", "cupom", "subtotal_centavos", "desconto_centavos", "total_centavos"],
      orders.map((order) => [order.id, order.createdAt.toISOString(), order.buyer.name, order.buyer.email, order.event.name, order.items.reduce((sum, item) => sum + item.quantity, 0), order.status, order.payment?.method ?? "", order.payment?.status ?? "", order.coupon?.code ?? "", order.subtotalCents, order.discountCents, order.totalCents]),
    );
    return csvResponse(res, `digitalticket-pedidos-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  });

  router.get("/api/v1/reports/customers.csv", async (req, res) => {
    const session = await organizer(req, res); if (!session) return;
    const organizationId = resolveOrganizationId(session, req.query as Record<string, unknown>);
    if (!organizationId) return res.status(400).json({ error: "ORGANIZATION_REQUIRED" });
    const customers = await prisma.user.findMany({
      where: { orders: { some: { organizationId } } },
      orderBy: { createdAt: "desc" },
      take: 5000,
      select: { name: true, email: true, createdAt: true, orders: { where: { organizationId, status: "PAID" }, select: { totalCents: true } } },
    });
    const csv = toCsv(
      ["nome", "email", "cliente_desde", "pedidos_pagos", "valor_total_centavos"],
      customers.map((customer) => [customer.name, customer.email, customer.createdAt.toISOString(), customer.orders.length, customer.orders.reduce((sum, order) => sum + order.totalCents, 0)]),
    );
    return csvResponse(res, `digitalticket-clientes-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  });

  router.get("/api/v1/reports/tickets.csv", async (req, res) => {
    const session = await organizer(req, res); if (!session) return;
    const organizationId = resolveOrganizationId(session, req.query as Record<string, unknown>);
    if (!organizationId) return res.status(400).json({ error: "ORGANIZATION_REQUIRED" });
    const eventId = req.query.eventId ? String(req.query.eventId) : undefined;
    const tickets = await prisma.ticket.findMany({
      where: { orderItem: { order: { organizationId, ...(eventId ? { eventId } : {}) } } },
      orderBy: { issuedAt: "desc" },
      take: 10000,
      include: { orderItem: { include: { lot: { select: { name: true } }, order: { select: { event: { select: { name: true } } } } } }, checkIns: { select: { id: true } } },
    });
    const csv = toCsv(
      ["codigo", "titular", "email", "evento", "lote", "status", "emitido_em", "usado_em", "checkins"],
      tickets.map((ticket) => [ticket.checkInCode, ticket.holderName, ticket.holderEmail, ticket.orderItem.order.event.name, ticket.orderItem.lot.name, ticket.status, ticket.issuedAt.toISOString(), ticket.usedAt?.toISOString() ?? "", ticket.checkIns.length]),
    );
    return csvResponse(res, `digitalticket-ingressos-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  });
}
