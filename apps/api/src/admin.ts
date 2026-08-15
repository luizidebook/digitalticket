import { z } from "zod";

export const organizationInputSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug deve conter apenas letras minúsculas, números e hífens"),
  domain: z.string().trim().toLowerCase().regex(/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/, "domínio inválido").nullish(),
  logoUrl: z.string().url().nullish(),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "cor deve estar no formato #RRGGBB").default("#ff5c7a"),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "cor deve estar no formato #RRGGBB").default("#8b5cf6"),
});

export const organizationUpdateSchema = organizationInputSchema.partial();

export const platformFeeSchema = z.object({
  percentageBps: z.number().int().min(0).max(3000),
  fixedCents: z.number().int().min(0).max(100000),
});

export type PlatformFeeConfig = z.infer<typeof platformFeeSchema>;

export const DEFAULT_PLATFORM_FEE: PlatformFeeConfig = { percentageBps: 1000, fixedCents: 0 };

export function computePlatformFeeCents(totalCents: number, fee: PlatformFeeConfig = DEFAULT_PLATFORM_FEE) {
  if (totalCents < 0) throw new Error("INVALID_AMOUNT");
  return Math.round((totalCents * fee.percentageBps) / 10000) + fee.fixedCents;
}

export function computeNetCents(totalCents: number, fee: PlatformFeeConfig = DEFAULT_PLATFORM_FEE) {
  return Math.max(0, totalCents - computePlatformFeeCents(totalCents, fee));
}

export type ConsolidatedMetrics = {
  organizations: number;
  events: number;
  orders: number;
  ticketsIssued: number;
  grossRevenueCents: number;
  platformFeeCents: number;
  netRevenueCents: number;
};

export function buildConsolidatedMetrics(input: {
  organizations: number;
  events: number;
  paidOrders: Array<{ totalCents: number }>;
  ticketsIssued: number;
  fee?: PlatformFeeConfig;
}): ConsolidatedMetrics {
  const fee = input.fee ?? DEFAULT_PLATFORM_FEE;
  const grossRevenueCents = input.paidOrders.reduce((sum, order) => sum + order.totalCents, 0);
  const platformFeeCents = input.paidOrders.reduce((sum, order) => sum + computePlatformFeeCents(order.totalCents, fee), 0);
  return {
    organizations: input.organizations,
    events: input.events,
    orders: input.paidOrders.length,
    ticketsIssued: input.ticketsIssued,
    grossRevenueCents,
    platformFeeCents,
    netRevenueCents: grossRevenueCents - platformFeeCents,
  };
}
