import { describe, expect, it } from "vitest";
import { computeCouponDiscountCents, couponInputSchema, validateCoupon, type CouponLike } from "./coupons";

const baseCoupon: CouponLike = { percentageOff: 10, fixedOffCents: null, maxUses: null, usedCount: 0, startsAt: null, endsAt: null, active: true };

describe("coupon validation", () => {
  it("accepts an active coupon within window and usage limits", () => {
    expect(validateCoupon(baseCoupon).valid).toBe(true);
  });
  it("rejects inactive, expired, not-started and exhausted coupons", () => {
    expect(validateCoupon({ ...baseCoupon, active: false })).toMatchObject({ valid: false, reason: "COUPON_INACTIVE" });
    expect(validateCoupon({ ...baseCoupon, endsAt: new Date(Date.now() - 1000) })).toMatchObject({ valid: false, reason: "COUPON_EXPIRED" });
    expect(validateCoupon({ ...baseCoupon, startsAt: new Date(Date.now() + 60000) })).toMatchObject({ valid: false, reason: "COUPON_NOT_STARTED" });
    expect(validateCoupon({ ...baseCoupon, maxUses: 5, usedCount: 5 })).toMatchObject({ valid: false, reason: "COUPON_EXHAUSTED" });
  });
});

describe("coupon discount computation", () => {
  it("computes percentage discount capped at subtotal", () => {
    expect(computeCouponDiscountCents({ percentageOff: 10, fixedOffCents: null }, 10000)).toBe(1000);
    expect(computeCouponDiscountCents({ percentageOff: 100, fixedOffCents: null }, 5000)).toBe(5000);
  });
  it("computes fixed discount capped at subtotal", () => {
    expect(computeCouponDiscountCents({ percentageOff: null, fixedOffCents: 1500 }, 10000)).toBe(1500);
    expect(computeCouponDiscountCents({ percentageOff: null, fixedOffCents: 1500 }, 1000)).toBe(1000);
  });
});

describe("coupon input schema", () => {
  it("requires exactly one discount type", () => {
    expect(couponInputSchema.safeParse({ code: "BEMVINDO10", percentageOff: 10 }).success).toBe(true);
    expect(couponInputSchema.safeParse({ code: "BEMVINDO10", fixedOffCents: 500 }).success).toBe(true);
    expect(couponInputSchema.safeParse({ code: "BEMVINDO10" }).success).toBe(false);
    expect(couponInputSchema.safeParse({ code: "BEMVINDO10", percentageOff: 10, fixedOffCents: 500 }).success).toBe(false);
  });
  it("normalizes code to uppercase and rejects invalid codes", () => {
    const parsed = couponInputSchema.safeParse({ code: "promo-10", percentageOff: 10 });
    expect(parsed.success && parsed.data.code === "PROMO-10").toBe(true);
    expect(couponInputSchema.safeParse({ code: "ab", percentageOff: 10 }).success).toBe(false);
  });
});
