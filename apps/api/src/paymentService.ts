import { PrismaClient } from "@prisma/client";
import { createTicketQrDataUrl, createTicketSecret, ConfiguredVoucherMailer, MercadoPagoGateway, type PaymentIntent } from "./integrations";

const prisma = new PrismaClient();
const gateway = new MercadoPagoGateway();
const mailer = new ConfiguredVoucherMailer();

export async function createMercadoPagoPayment(input: { orderId: string; method: "PIX" | "CREDIT_CARD"; payerEmail: string; card?: { token: string; installments: number; paymentMethodId: string; issuerId?: string } }) {
  const order = await prisma.order.findUnique({ where: { id: input.orderId }, include: { payment: true } });
  if (!order) throw new Error("ORDER_NOT_FOUND");
  if (order.payment?.externalId) return { payment: order.payment, intent: await gateway.getPayment(order.payment.externalId) };
  const intent = await gateway.createPayment({ orderId: order.id, amountCents: order.totalCents, method: input.method, payerEmail: input.payerEmail, card: input.card });
  const payment = await prisma.payment.create({ data: { orderId: order.id, provider: "MERCADO_PAGO", method: intent.method, externalId: intent.externalId, status: intent.status === "APPROVED" ? "APPROVED" : "PENDING", amountCents: intent.amountCents } });
  return { payment, intent };
}

async function issueTicketsForApprovedOrder(orderId: string) {
  const pendingEmails: Array<{ recipient: string; subject: string; ticketQrDataUrl: string; checkInCode: string; holderName: string; eventName: string }> = [];
  const result = await prisma.$transaction(async (tx) => {
    // Lock the order row so concurrent webhook/polling calls serialize here instead of double-issuing tickets.
    await tx.$executeRaw`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`;
    const order = await tx.order.findUnique({ where: { id: orderId }, include: { items: { include: { tickets: true } }, event: true, buyer: true } });
    if (!order) throw new Error("ORDER_NOT_FOUND");
    if (order.status === "PAID" && order.items.every((item) => item.tickets.length >= item.quantity)) return order;
    const ticketData = [];
    for (const item of order.items) {
      const missing = item.quantity - item.tickets.length;
      for (let index = 0; index < missing; index += 1) {
        const secret = createTicketSecret();
        const checkInCode = `DT-${secret.rawToken.slice(0, 10).toUpperCase()}`;
        ticketData.push({ itemId: item.id, rawToken: secret.rawToken, signedToken: secret.signedToken, tokenHash: secret.tokenHash, checkInCode });
      }
    }
    for (const ticket of ticketData) {
      await tx.ticket.create({ data: { orderItemId: ticket.itemId, holderName: order.buyer.name, holderEmail: order.buyer.email, qrTokenHash: ticket.tokenHash, checkInCode: ticket.checkInCode } });
      pendingEmails.push({ recipient: order.buyer.email, subject: `Seu ingresso — ${order.event.name}`, ticketQrDataUrl: await createTicketQrDataUrl(ticket.signedToken), checkInCode: ticket.checkInCode, holderName: order.buyer.name, eventName: order.event.name });
    }
    return tx.order.update({ where: { id: order.id }, data: { status: "PAID" }, include: { items: { include: { tickets: true } } } });
  });
  for (const email of pendingEmails) {
    try { await mailer.sendVoucher(email); } catch (error) { console.error("[Voucher] delivery failed", error); }
  }
  return result;
}

export async function reconcileMercadoPagoPayment(externalId: string, eventPayload?: unknown) {
  const intent: PaymentIntent = await gateway.getPayment(externalId);
  const payment = await prisma.payment.findFirst({ where: { externalId }, include: { order: true } });
  if (!payment) return { matched: false, status: intent.status };
  const nextStatus = intent.status === "APPROVED" ? "APPROVED" : intent.status === "REJECTED" ? "REJECTED" : intent.status === "REFUNDED" ? "REFUNDED" : "PENDING";
  await prisma.payment.update({ where: { id: payment.id }, data: { status: nextStatus, rawPayload: eventPayload as object | undefined } });
  if (nextStatus === "APPROVED") await issueTicketsForApprovedOrder(payment.orderId);
  return { matched: true, status: nextStatus, orderId: payment.orderId };
}

export { issueTicketsForApprovedOrder };
