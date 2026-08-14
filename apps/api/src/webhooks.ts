import { PrismaClient } from "@prisma/client";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";
import { reconcileMercadoPagoPayment } from "./paymentService";

const prisma = new PrismaClient();

export function isValidMercadoPagoSignature(req: Request) {
  const secret = process.env.MERCADO_PAGO_WEBHOOK_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  const signature = req.header("x-signature"); const requestId = req.header("x-request-id");
  const dataId = String(req.body?.data?.id ?? req.query["data.id"] ?? ""); const ts = signature?.match(/(?:^|,)ts=([^,]+)/)?.[1]; const received = signature?.match(/(?:^|,)v1=([^,]+)/)?.[1];
  if (!signature || !requestId || !dataId || !ts || !received) return false;
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`; const expected = createHmac("sha256", secret).update(manifest).digest("hex");
  if (received.length !== expected.length) return false; return timingSafeEqual(Buffer.from(received), Buffer.from(expected));
}

export async function mercadoPagoWebhook(req: Request, res: Response) {
  if (!isValidMercadoPagoSignature(req)) return res.status(401).json({ error: "INVALID_WEBHOOK_SIGNATURE" });
  const eventId = String(req.body?.id ?? req.body?.data?.id ?? req.query.id ?? ""); const eventType = String(req.body?.type ?? req.body?.action ?? "payment");
  if (!eventId) return res.status(400).json({ error: "MISSING_EVENT_ID" });
  try {
    await prisma.webhookEvent.create({ data: { provider: "MERCADO_PAGO", externalId: eventId, eventType, payload: req.body ?? {} } });
  } catch (error: any) {
    if (error?.code === "P2002") return res.status(200).json({ received: true, duplicate: true });
    throw error;
  }
  try {
    const result = await reconcileMercadoPagoPayment(eventId, req.body);
    await prisma.webhookEvent.update({ where: { provider_externalId: { provider: "MERCADO_PAGO", externalId: eventId } }, data: { processedAt: new Date() } });
    return res.status(200).json({ received: true, ...result });
  } catch (error) {
    console.error("[MercadoPago] reconciliation failed", error);
    return res.status(202).json({ received: true, processed: false });
  }
}
