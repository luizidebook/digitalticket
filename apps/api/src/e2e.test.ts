import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import argon2 from "argon2";
import { createHash } from "node:crypto";
import { createPendingOrder } from "./orderService";
import { issueTicketsForApprovedOrder } from "./paymentService";
import { createTicketSecret, verifyTicketToken } from "./integrations";
import { validateCoupon, computeCouponDiscountCents } from "./coupons";
import { buildConsolidatedMetrics, computePlatformFeeCents } from "./admin";
import { buildDailySalesSeries, toCsv } from "./reports";

const prisma = new PrismaClient();
const RUN = `e2e-${Date.now().toString(36)}`;

describe("end-to-end order lifecycle (PostgreSQL real)", () => {
  let organizationId: string;
  let buyerId: string;
  let eventId: string;
  let lotId: string;
  let couponId: string;

  beforeAll(async () => {
    const organization = await prisma.organization.create({ data: { name: "E2E Org", slug: `${RUN}-org`, primaryColor: "#0ea5e9", accentColor: "#f59e0b" } });
    organizationId = organization.id;
    const buyer = await prisma.user.create({ data: { name: "Comprador E2E", email: `${RUN}@buyer.local`, passwordHash: await argon2.hash("senha-forte-123"), role: "BUYER" } });
    buyerId = buyer.id;
    const event = await prisma.event.create({ data: { organizationId, name: "Evento E2E", slug: `${RUN}-evento`, type: "show", status: "PUBLISHED", publishedAt: new Date() } });
    eventId = event.id;
    const lot = await prisma.lot.create({ data: { eventId, name: "Único", priceInCents: 10000, capacity: 5, maxPerOrder: 4 } });
    lotId = lot.id;
    const coupon = await prisma.coupon.create({ data: { organizationId, code: "E2E10", percentageOff: 10, maxUses: 2 } });
    couponId = coupon.id;
  });

  afterAll(async () => {
    await prisma.organization.delete({ where: { id: organizationId } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: buyerId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it("creates a pending order with coupon discount and reserves stock transactionally", async () => {
    const order = await createPendingOrder({ organizationId, eventId, buyerId, lines: [{ lotId, quantity: 2 }], couponCode: "e2e10" });
    expect(order.status).toBe("PENDING_PAYMENT");
    expect(order.subtotalCents).toBe(20000);
    expect(order.discountCents).toBe(2000);
    expect(order.totalCents).toBe(18000);
    expect(order.couponId).toBe(couponId);
    const lot = await prisma.lot.findUnique({ where: { id: lotId } });
    expect(lot?.sold).toBe(2);
    const coupon = await prisma.coupon.findUnique({ where: { id: couponId } });
    expect(coupon?.usedCount).toBe(1);
  });

  it("prevents overselling beyond capacity", async () => {
    await expect(createPendingOrder({ organizationId, eventId, buyerId, lines: [{ lotId, quantity: 4 }] })).rejects.toThrow();
    const lot = await prisma.lot.findUnique({ where: { id: lotId } });
    expect(lot?.sold).toBe(2);
  });

  it("issues signed tickets idempotently after payment approval", async () => {
    const order = await createPendingOrder({ organizationId, eventId, buyerId, lines: [{ lotId, quantity: 1 }] });
    await prisma.order.update({ where: { id: order.id }, data: { status: "PENDING_PAYMENT" } });
    const first = await issueTicketsForApprovedOrder(order.id);
    expect(first.status).toBe("PAID");
    const second = await issueTicketsForApprovedOrder(order.id);
    const tickets = await prisma.ticket.findMany({ where: { orderItem: { orderId: order.id } } });
    expect(tickets).toHaveLength(1);
    expect(second.items[0].tickets).toHaveLength(1);
  });

  it("signs and verifies ticket tokens with HMAC", () => {
    const secret = createTicketSecret();
    expect(verifyTicketToken(secret.signedToken)).toBe(secret.rawToken);
    expect(verifyTicketToken(`${secret.rawToken}.assinatura-invalida`)).toBeNull();
    expect(createHash("sha256").update(secret.rawToken).digest("hex")).toBe(secret.tokenHash);
  });

  it("validates coupon rules and computes discounts", () => {
    expect(validateCoupon({ percentageOff: 10, fixedOffCents: null, maxUses: 2, usedCount: 1, startsAt: null, endsAt: null, active: true })).toMatchObject({ valid: true });
    expect(validateCoupon({ percentageOff: 10, fixedOffCents: null, maxUses: 2, usedCount: 2, startsAt: null, endsAt: null, active: true })).toMatchObject({ valid: false, reason: "COUPON_EXHAUSTED" });
    expect(computeCouponDiscountCents({ percentageOff: 10, fixedOffCents: null }, 20000)).toBe(2000);
  });

  it("computes platform fees and consolidated metrics", () => {
    expect(computePlatformFeeCents(18000, { percentageBps: 1000, fixedCents: 0 })).toBe(1800);
    const metrics = buildConsolidatedMetrics({ organizations: 1, events: 1, paidOrders: [{ totalCents: 18000 }], ticketsIssued: 3 });
    expect(metrics.netRevenueCents).toBe(16200);
  });

  it("builds sales series and csv exports from real data", async () => {
    const paidOrders = await prisma.order.findMany({ where: { organizationId, status: "PAID" }, select: { createdAt: true, totalCents: true } });
    const series = buildDailySalesSeries(paidOrders, 7);
    expect(series).toHaveLength(7);
    expect(series.reduce((sum, point) => sum + point.revenueCents, 0)).toBe(10000);
    const csv = toCsv(["id", "total"], paidOrders.map((order) => ["x", order.totalCents]));
    expect(csv).toContain("id,total");
    expect(csv).toContain("10000");
  });
});
