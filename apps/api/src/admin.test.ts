import { describe, expect, it } from "vitest";
import { buildConsolidatedMetrics, computeNetCents, computePlatformFeeCents, organizationInputSchema, platformFeeSchema, DEFAULT_PLATFORM_FEE } from "./admin";

describe("platform fees", () => {
  it("computes percentage plus fixed fee", () => {
    expect(computePlatformFeeCents(10000, { percentageBps: 1000, fixedCents: 50 })).toBe(1050);
    expect(computePlatformFeeCents(999, { percentageBps: 500, fixedCents: 0 })).toBe(50);
  });
  it("defaults to 10% platform fee", () => {
    expect(computePlatformFeeCents(10000)).toBe(1000);
    expect(computeNetCents(10000)).toBe(9000);
  });
  it("rejects invalid fee configuration", () => {
    expect(platformFeeSchema.safeParse({ percentageBps: 5000, fixedCents: 0 }).success).toBe(false);
    expect(() => computePlatformFeeCents(-1, DEFAULT_PLATFORM_FEE)).toThrow("INVALID_AMOUNT");
  });
});

describe("consolidated metrics", () => {
  it("aggregates revenue across paid orders", () => {
    const metrics = buildConsolidatedMetrics({
      organizations: 3,
      events: 7,
      paidOrders: [{ totalCents: 10000 }, { totalCents: 5000 }],
      ticketsIssued: 12,
      fee: { percentageBps: 1000, fixedCents: 0 },
    });
    expect(metrics.grossRevenueCents).toBe(15000);
    expect(metrics.platformFeeCents).toBe(1500);
    expect(metrics.netRevenueCents).toBe(13500);
    expect(metrics.orders).toBe(2);
  });
});

describe("organization input validation", () => {
  it("accepts a valid organization payload", () => {
    const parsed = organizationInputSchema.safeParse({ name: "Aurora Produções", slug: "aurora", domain: "tickets.aurora.com", primaryColor: "#ff5c7a", accentColor: "#8b5cf6" });
    expect(parsed.success).toBe(true);
  });
  it("rejects invalid slug and color", () => {
    expect(organizationInputSchema.safeParse({ name: "Aurora", slug: "Aurora Inválida!" }).success).toBe(false);
    expect(organizationInputSchema.safeParse({ name: "Aurora", slug: "aurora", primaryColor: "red" }).success).toBe(false);
    expect(organizationInputSchema.safeParse({ name: "Aurora", slug: "aurora", domain: "not a domain" }).success).toBe(false);
  });
});
