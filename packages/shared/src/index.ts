export const ROLES = {
  SUPER_ADMIN: "SUPER_ADMIN",
  ORGANIZER: "ORGANIZER",
  BUYER: "BUYER",
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export const EVENT_STATUSES = ["DRAFT", "PUBLISHED", "ARCHIVED"] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

export const TICKET_STATUSES = ["ISSUED", "VALIDATED", "USED", "CANCELLED"] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export type WhiteLabelTheme = {
  organizationName: string;
  logoUrl?: string;
  primaryColor: string;
  accentColor: string;
  domain?: string;
};

export type PublicEvent = {
  id: string;
  slug: string;
  name: string;
  type: string;
  category?: string;
  tags: string[];
  description?: string;
  imageUrl?: string;
  startsAt?: string;
  endsAt?: string;
  status: EventStatus;
  organization: WhiteLabelTheme;
  lots: Array<{
    id: string;
    name: string;
    priceInCents: number;
    available: number;
    maxPerOrder: number;
  }>;
};

export type CheckInResult = {
  accepted: boolean;
  ticketId?: string;
  status: TicketStatus;
  message: string;
  holderName?: string;
  eventName?: string;
  checkedInAt?: string;
};

export function formatCents(value: number, locale = "pt-BR") {
  return new Intl.NumberFormat(locale, { style: "currency", currency: "BRL" }).format(value / 100);
}

export function isRoleAllowed(role: Role, allowed: readonly Role[]) {
  return allowed.includes(role);
}
