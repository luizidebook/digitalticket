import { z } from "zod";

export const eventInputSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  type: z.string().trim().min(2).max(60),
  category: z.string().trim().max(60).optional(),
  tags: z.array(z.string().trim().min(1).max(30)).max(20).default([]),
  description: z.string().max(10000).optional(),
  imageUrl: z.string().url().optional(),
  startsAt: z.coerce.date().optional(),
  endsAt: z.coerce.date().optional(),
});

export const lotInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  priceInCents: z.number().int().nonnegative(),
  capacity: z.number().int().positive(),
  saleStartsAt: z.coerce.date().optional(),
  saleEndsAt: z.coerce.date().optional(),
  maxPerOrder: z.number().int().positive().max(50).default(10),
  eventDateId: z.string().trim().min(1).nullish(),
});

export const eventDateInputSchema = z.object({
  label: z.string().trim().max(80).nullish(),
  startsAt: z.coerce.date().nullish(),
  endsAt: z.coerce.date().nullish(),
  sortOrder: z.number().int().min(0).default(0),
  active: z.boolean().default(true),
});

export function assertEventDateWindow(input: { startsAt?: Date | null; endsAt?: Date | null }) {
  if (input.startsAt && input.endsAt && input.endsAt < input.startsAt) throw new Error("EVENT_DATE_END_BEFORE_START");
}

export function assertLotAvailable(input: { capacity: number; sold: number; quantity: number; maxPerOrder: number }) {
  if (input.quantity < 1) throw new Error("QUANTITY_MUST_BE_POSITIVE");
  if (input.quantity > input.maxPerOrder) throw new Error("MAX_PER_ORDER_EXCEEDED");
  if (input.sold + input.quantity > input.capacity) throw new Error("INSUFFICIENT_STOCK");
}

export function getOrderTotalCents(items: Array<{ unitPriceCents: number; quantity: number }>, discountCents = 0) {
  const subtotalCents = items.reduce((sum, item) => sum + item.unitPriceCents * item.quantity, 0);
  return { subtotalCents, discountCents, totalCents: Math.max(0, subtotalCents - discountCents) };
}
