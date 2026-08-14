import { PrismaClient } from "@prisma/client";
import type { Request, Response, Router } from "express";
import { z } from "zod";
import { authenticateRequest } from "./authRoutes";
import { createPendingOrder } from "./orderService";
import { createMercadoPagoPayment, reconcileMercadoPagoPayment } from "./paymentService";

const prisma = new PrismaClient();
const orderSchema = z.object({ organizationId: z.string().min(1), eventId: z.string().min(1), lines: z.array(z.object({ lotId: z.string().min(1), quantity: z.number().int().positive() })).min(1), discountCents: z.number().int().nonnegative().default(0) });
const paymentSchema = z.object({ method: z.enum(["PIX", "CREDIT_CARD"]), payerEmail: z.string().email(), card: z.object({ token: z.string().min(1), installments: z.number().int().positive().max(24), paymentMethodId: z.string().min(1), issuerId: z.string().optional() }).optional() });

async function buyer(req: Request, res: Response) {
  const session = await authenticateRequest(req);
  if (!session) { res.status(401).json({ error: "UNAUTHORIZED" }); return null; }
  return session;
}

export function registerPaymentRoutes(router: Router) {
  router.post("/api/v1/orders", async (req, res) => {
    const session = await buyer(req, res); if (!session) return;
    const parsed = orderSchema.safeParse(req.body); if (!parsed.success) return res.status(400).json({ error: "INVALID_ORDER", details: parsed.error.flatten() });
    try { const order = await createPendingOrder({ ...parsed.data, buyerId: session.userId }); return res.status(201).json(order); } catch (error: any) { return res.status(409).json({ error: error?.message ?? "ORDER_CREATION_FAILED" }); }
  });

  router.post("/api/v1/orders/:orderId/payment", async (req, res) => {
    const session = await buyer(req, res); if (!session) return;
    const parsed = paymentSchema.safeParse(req.body); if (!parsed.success) return res.status(400).json({ error: "INVALID_PAYMENT", details: parsed.error.flatten() });
    const order = await prisma.order.findFirst({ where: { id: req.params.orderId, buyerId: session.userId } }); if (!order) return res.status(404).json({ error: "ORDER_NOT_FOUND" });
    try { const result = await createMercadoPagoPayment({ orderId: order.id, ...parsed.data }); return res.status(201).json(result); } catch (error: any) { return res.status(502).json({ error: error?.message ?? "PAYMENT_PROVIDER_ERROR" }); }
  });

  router.get("/api/v1/orders/:orderId", async (req, res) => {
    const session = await buyer(req, res); if (!session) return;
    const order = await prisma.order.findFirst({ where: { id: req.params.orderId, buyerId: session.userId }, include: { payment: true, event: true, items: { include: { tickets: true, lot: true } } } });
    if (!order) return res.status(404).json({ error: "ORDER_NOT_FOUND" });
    if (order.payment?.externalId && ["PENDING", "IN_PROCESS"].includes(order.payment.status)) { try { await reconcileMercadoPagoPayment(order.payment.externalId); } catch (error) { console.error("[Payment] status refresh failed", error); } }
    return res.json(await prisma.order.findUnique({ where: { id: order.id }, include: { payment: true, event: true, items: { include: { tickets: true, lot: true } } } }));
  });
}
