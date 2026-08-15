import { z } from "zod";

export const couponInputSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,32}$/, "código deve ter 3-32 caracteres alfanuméricos"),
  percentageOff: z.number().int().min(1).max(100).nullish(),
  fixedOffCents: z.number().int().positive().nullish(),
  maxUses: z.number().int().positive().nullish(),
  startsAt: z.coerce.date().nullish(),
  endsAt: z.coerce.date().nullish(),
  active: z.boolean().default(true),
}).refine((value) => (value.percentageOff != null) !== (value.fixedOffCents != null), { message: "COUPON_REQUIRES_SINGLE_DISCOUNT_TYPE" });

export const couponUpdateSchema = z.object({
  percentageOff: z.number().int().min(1).max(100).nullish(),
  fixedOffCents: z.number().int().positive().nullish(),
  maxUses: z.number().int().positive().nullish(),
  startsAt: z.coerce.date().nullish(),
  endsAt: z.coerce.date().nullish(),
  active: z.boolean().optional(),
});

export type CouponLike = {
  percentageOff: number | null;
  fixedOffCents: number | null;
  maxUses: number | null;
  usedCount: number;
  startsAt: Date | null;
  endsAt: Date | null;
  active: boolean;
};

export function validateCoupon(coupon: CouponLike, now = new Date()): { valid: true } | { valid: false; reason: string } {
  if (!coupon.active) return { valid: false, reason: "COUPON_INACTIVE" };
  if (coupon.startsAt && coupon.startsAt > now) return { valid: false, reason: "COUPON_NOT_STARTED" };
  if (coupon.endsAt && coupon.endsAt < now) return { valid: false, reason: "COUPON_EXPIRED" };
  if (coupon.maxUses != null && coupon.usedCount >= coupon.maxUses) return { valid: false, reason: "COUPON_EXHAUSTED" };
  return { valid: true };
}

export function computeCouponDiscountCents(coupon: Pick<CouponLike, "percentageOff" | "fixedOffCents">, subtotalCents: number) {
  if (subtotalCents < 0) throw new Error("INVALID_SUBTOTAL");
  if (coupon.percentageOff != null) return Math.min(subtotalCents, Math.round((subtotalCents * coupon.percentageOff) / 100));
  if (coupon.fixedOffCents != null) return Math.min(subtotalCents, coupon.fixedOffCents);
  return 0;
}
