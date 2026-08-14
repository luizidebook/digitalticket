import { createHmac, timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";
import { processIdempotentWebhook } from "./checkin";

const processedEvents = new Set<string>();

function isValidSignature(req: Request) {
  const secret = process.env.MERCADO_PAGO_WEBHOOK_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  const signature = req.header("x-signature");
  const requestId = req.header("x-request-id");
  const dataId = String(req.body?.data?.id ?? req.query["data.id"] ?? "");
  if (!signature || !requestId || !dataId) return false;
  const manifest = `id:${dataId};request-id:${requestId};ts:${signature.match(/ts=([^,]+)/)?.[1] ?? ""};`;
  const expected = createHmac("sha256", secret).update(manifest).digest("hex");
  const received = signature.match(/v1=([^,]+)/)?.[1] ?? "";
  if (received.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(received), Buffer.from(expected));
}

export function mercadoPagoWebhook(req: Request, res: Response) {
  if (!isValidSignature(req)) return res.status(401).json({ error: "INVALID_WEBHOOK_SIGNATURE" });
  const eventId = String(req.body?.id ?? req.body?.data?.id ?? req.query.id ?? "");
  if (!eventId) return res.status(400).json({ error: "MISSING_EVENT_ID" });
  const result = processIdempotentWebhook(processedEvents, eventId, () => {
    // A camada de aplicação deve buscar o pagamento no gateway e atualizar a transação Prisma.
    // O evento nunca deve confiar apenas no valor enviado pelo corpo do webhook.
  });
  return res.status(200).json({ received: true, ...result });
}
