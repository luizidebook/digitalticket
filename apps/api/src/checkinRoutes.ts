import { PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";
import type { Request, Response, Router } from "express";
import { z } from "zod";
import { authenticateRequest } from "./authRoutes";
import { verifyTicketToken } from "./integrations";

const prisma = new PrismaClient();
const inputSchema = z.object({ code: z.string().trim().min(4), eventId: z.string().optional(), deviceId: z.string().max(120).optional(), consume: z.boolean().default(true), note: z.string().max(300).optional() });

export function registerCheckinRoutes(router: Router) {
  router.post("/api/v1/tickets/:ticketId/cancel", async (req: Request, res: Response) => {
    const session = await authenticateRequest(req); if (!session) return res.status(401).json({ error: "UNAUTHORIZED" });
    if (!["ORGANIZER", "SUPER_ADMIN"].includes(session.role)) return res.status(403).json({ error: "FORBIDDEN" });
    const ticketId = String(req.params.ticketId); const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } }); if (!ticket) return res.status(404).json({ error: "TICKET_NOT_FOUND" });
    if (ticket.status === "USED") return res.status(409).json({ error: "USED_TICKET_CANNOT_BE_CANCELLED" });
    const updated = await prisma.$transaction(async (tx) => { const changed = await tx.ticket.updateMany({ where: { id: ticket.id, status: { in: ["ISSUED", "VALIDATED"] } }, data: { status: "CANCELLED", cancelledAt: new Date() } }); if (changed.count !== 1) throw new Error("TICKET_STATE_CHANGED"); await tx.checkIn.create({ data: { ticketId: ticket.id, operatorId: session.userId, result: "CANCELLED", note: req.body?.note } }); return tx.ticket.findUnique({ where: { id: ticket.id } }); });
    return res.json({ cancelled: true, ticket: updated });
  });

  router.post("/api/v1/check-in/validate", async (req: Request, res: Response) => {
    const session = await authenticateRequest(req);
    if (!session) return res.status(401).json({ error: "UNAUTHORIZED" });
    if (!["ORGANIZER", "SUPER_ADMIN"].includes(session.role)) return res.status(403).json({ error: "FORBIDDEN" });
    const parsed = inputSchema.safeParse(req.body); if (!parsed.success) return res.status(400).json({ error: "INVALID_CHECKIN", details: parsed.error.flatten() });
    const code = parsed.data.code.replace(/^digitalticket:\/\/ticket\//, "");
    const rawQrToken = code.includes(".") ? verifyTicketToken(code) : null;
    if (code.includes(".") && !rawQrToken) return res.status(401).json({ accepted: false, state: "INVALID_TOKEN", message: "QR Code inválido ou adulterado." });
    const qrTokenHash = createHash("sha256").update(rawQrToken ?? code).digest("hex");
    const ticket = await prisma.ticket.findFirst({ where: { OR: [{ checkInCode: parsed.data.code }, { checkInCode: parsed.data.code.toUpperCase() }, { qrTokenHash } ] }, include: { orderItem: { include: { order: { include: { event: true } } } } } });
    if (!ticket) return res.status(404).json({ accepted: false, state: "NOT_FOUND", message: "Ingresso não encontrado." });
    const event = ticket.orderItem.order.event;
    if (parsed.data.eventId && parsed.data.eventId !== event.id) return res.status(409).json({ accepted: false, state: "WRONG_EVENT", message: "Ingresso pertence a outro evento." });
    if (ticket.status === "CANCELLED") { await prisma.checkIn.create({ data: { ticketId: ticket.id, operatorId: session.userId, deviceId: parsed.data.deviceId, result: "CANCELLED", note: parsed.data.note } }); return res.status(409).json({ accepted: false, state: ticket.status, ticketId: ticket.id, message: "Ingresso cancelado." }); }
    if (ticket.status === "USED") { await prisma.checkIn.create({ data: { ticketId: ticket.id, operatorId: session.userId, deviceId: parsed.data.deviceId, result: "ALREADY_USED", note: parsed.data.note } }); return res.status(409).json({ accepted: false, state: ticket.status, ticketId: ticket.id, message: "Ingresso já utilizado." }); }
    const nextStatus = parsed.data.consume ? "USED" : "VALIDATED";
    const updated = await prisma.$transaction(async (tx) => {
      const guarded = await tx.ticket.updateMany({ where: { id: ticket.id, status: "ISSUED" }, data: { status: nextStatus, validatedAt: new Date(), usedAt: parsed.data.consume ? new Date() : undefined } });
      if (guarded.count !== 1) throw new Error("CHECKIN_RACE_LOST");
      await tx.checkIn.create({ data: { ticketId: ticket.id, operatorId: session.userId, deviceId: parsed.data.deviceId, result: nextStatus, note: parsed.data.note } });
      return tx.ticket.findUnique({ where: { id: ticket.id } });
    });
    return res.json({ accepted: true, state: updated?.status, ticketId: ticket.id, holderName: ticket.holderName, eventName: event.name, message: "Entrada autorizada." });
  });

  router.get("/api/v1/check-in/tickets/:ticketId/history", async (req, res) => {
    const session = await authenticateRequest(req); if (!session) return res.status(401).json({ error: "UNAUTHORIZED" });
    if (!["ORGANIZER", "SUPER_ADMIN"].includes(session.role)) return res.status(403).json({ error: "FORBIDDEN" });
    const history = await prisma.checkIn.findMany({ where: { ticketId: req.params.ticketId }, orderBy: { createdAt: "desc" } });
    return res.json(history);
  });
}
