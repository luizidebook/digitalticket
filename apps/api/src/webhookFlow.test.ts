import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import argon2 from "argon2";
import { createHash, createHmac } from "node:crypto";
import type { Request } from "express";
import { isValidMercadoPagoSignature } from "./webhooks";
import { createPendingOrder } from "./orderService";
import { issueTicketsForApprovedOrder } from "./paymentService";
import { createTicketSecret } from "./integrations";

const prisma = new PrismaClient();
const RUN = `wh-${Date.now().toString(36)}`;

function fakeWebhookRequest(input: { secret: string; dataId: string; requestId: string; ts: string; sign?: boolean }) {
  const manifest = `id:${input.dataId};request-id:${input.requestId};ts:${input.ts};`;
  const signature = createHmac("sha256", input.secret).update(manifest).digest("hex");
  return {
    header: (name: string) => {
      if (name === "x-signature") return input.sign === false ? `ts=${input.ts},v1=invalid` : `ts=${input.ts},v1=${signature}`;
      if (name === "x-request-id") return input.requestId;
      return undefined;
    },
    body: { data: { id: input.dataId } },
    query: {},
  } as unknown as Request;
}

describe("webhook signature validation", () => {
  const secret = "webhook-secret-test";
  beforeAll(() => { process.env.MERCADO_PAGO_WEBHOOK_SECRET = secret; });
  afterAll(() => { delete process.env.MERCADO_PAGO_WEBHOOK_SECRET; });

  it("accepts a correctly signed webhook", () => {
    const req = fakeWebhookRequest({ secret, dataId: "123", requestId: "req-1", ts: "1700000000" });
    expect(isValidMercadoPagoSignature(req)).toBe(true);
  });

  it("rejects tampered or incomplete signatures", () => {
    expect(isValidMercadoPagoSignature(fakeWebhookRequest({ secret, dataId: "123", requestId: "req-1", ts: "1700000000", sign: false }))).toBe(false);
    const tampered = fakeWebhookRequest({ secret, dataId: "123", requestId: "req-1", ts: "1700000000" });
    tampered.body = { data: { id: "999" } };
    expect(isValidMercadoPagoSignature(tampered)).toBe(false);
    const missing = { header: () => undefined, body: {}, query: {} } as unknown as Request;
    expect(isValidMercadoPagoSignature(missing)).toBe(false);
  });
});

describe("ticket issuance and check-in concurrency (PostgreSQL real)", () => {
  let organizationId: string;
  let buyerId: string;
  let operatorId: string;
  let lotId: string;
  let eventId: string;

  beforeAll(async () => {
    const organization = await prisma.organization.create({ data: { name: "WH Org", slug: `${RUN}-org` } });
    organizationId = organization.id;
    const buyer = await prisma.user.create({ data: { name: "Buyer WH", email: `${RUN}@buyer.local`, passwordHash: await argon2.hash("senha-forte-123"), role: "BUYER" } });
    buyerId = buyer.id;
    const operator = await prisma.user.create({ data: { name: "Operator WH", email: `${RUN}@op.local`, passwordHash: await argon2.hash("senha-forte-123"), role: "ORGANIZER", organizationId } });
    operatorId = operator.id;
    const event = await prisma.event.create({ data: { organizationId, name: "Evento WH", slug: `${RUN}-event`, type: "show", status: "PUBLISHED" } });
    eventId = event.id;
    const lot = await prisma.lot.create({ data: { eventId, name: "Único", priceInCents: 5000, capacity: 10, maxPerOrder: 4 } });
    lotId = lot.id;
  });

  afterAll(async () => {
    await prisma.organization.delete({ where: { id: organizationId } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: buyerId } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: operatorId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it("issues exactly one ticket per unit even when called concurrently", async () => {
    const order = await createPendingOrder({ organizationId, eventId, buyerId, lines: [{ lotId, quantity: 2 }] });
    await Promise.all([issueTicketsForApprovedOrder(order.id), issueTicketsForApprovedOrder(order.id), issueTicketsForApprovedOrder(order.id)]);
    const tickets = await prisma.ticket.findMany({ where: { orderItem: { orderId: order.id } } });
    expect(tickets).toHaveLength(2);
    const finalOrder = await prisma.order.findUnique({ where: { id: order.id } });
    expect(finalOrder?.status).toBe("PAID");
  });

  it("allows only one concurrent check-in to consume a ticket", async () => {
    const order = await createPendingOrder({ organizationId, eventId, buyerId, lines: [{ lotId, quantity: 1 }] });
    await issueTicketsForApprovedOrder(order.id);
    const ticket = await prisma.ticket.findFirstOrThrow({ where: { orderItem: { orderId: order.id } } });

    const consume = () => prisma.$transaction(async (tx) => {
      const guarded = await tx.ticket.updateMany({ where: { id: ticket.id, status: "ISSUED" }, data: { status: "USED", usedAt: new Date(), validatedAt: new Date() } });
      if (guarded.count !== 1) throw new Error("CHECKIN_RACE_LOST");
      await tx.checkIn.create({ data: { ticketId: ticket.id, operatorId, result: "USED" } });
      return true;
    });

    const results = await Promise.allSettled([consume(), consume(), consume()]);
    const succeeded = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");
    expect(succeeded).toHaveLength(1);
    expect(rejected).toHaveLength(2);
    const finalTicket = await prisma.ticket.findUnique({ where: { id: ticket.id } });
    expect(finalTicket?.status).toBe("USED");
    const checkIns = await prisma.checkIn.count({ where: { ticketId: ticket.id } });
    expect(checkIns).toBe(1);
  });

  it("stores only the token hash and verifies signed tokens", async () => {
    const order = await createPendingOrder({ organizationId, eventId, buyerId, lines: [{ lotId, quantity: 1 }] });
    await issueTicketsForApprovedOrder(order.id);
    const ticket = await prisma.ticket.findFirstOrThrow({ where: { orderItem: { orderId: order.id } } });
    expect(ticket.qrTokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(ticket.checkInCode).toMatch(/^DT-[A-Z0-9-]+$/);
    const secret = createTicketSecret();
    expect(createHash("sha256").update(secret.rawToken).digest("hex")).toBe(secret.tokenHash);
  });
});
