import { PrismaClient } from "@prisma/client";
import { assertLotAvailable, getOrderTotalCents } from "./events";

const prisma = new PrismaClient();

type OrderLine = { lotId: string; quantity: number };

export async function createPendingOrder(input: { organizationId: string; eventId: string; buyerId: string; lines: OrderLine[]; discountCents?: number }) {
  if (!input.lines.length) throw new Error("ORDER_REQUIRES_ITEMS");
  return prisma.$transaction(async (tx) => {
    const lots = await tx.lot.findMany({ where: { id: { in: input.lines.map((line) => line.lotId) }, eventId: input.eventId, event: { organizationId: input.organizationId } } });
    if (lots.length !== input.lines.length) throw new Error("LOT_NOT_FOUND");
    const pricedLines = input.lines.map((line) => {
      const lot = lots.find((item) => item.id === line.lotId)!;
      assertLotAvailable({ capacity: lot.capacity, sold: lot.sold, quantity: line.quantity, maxPerOrder: lot.maxPerOrder });
      return { lot, quantity: line.quantity, unitPriceCents: lot.priceInCents };
    });
    const totals = getOrderTotalCents(pricedLines, input.discountCents ?? 0);
    for (const line of pricedLines) {
      const updated = await tx.lot.updateMany({ where: { id: line.lot.id, sold: { lte: line.lot.capacity - line.quantity } }, data: { sold: { increment: line.quantity } } });
      if (updated.count !== 1) throw new Error("INSUFFICIENT_STOCK");
    }
    return tx.order.create({ data: { organizationId: input.organizationId, eventId: input.eventId, buyerId: input.buyerId, status: "PENDING_PAYMENT", ...totals, items: { create: pricedLines.map((line) => ({ lotId: line.lot.id, quantity: line.quantity, unitPriceCents: line.unitPriceCents })) } }, include: { items: true } });
  });
}
