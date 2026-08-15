export type OfflineTicket = {
  id: string;
  holderName: string;
  holderEmail: string;
  checkInCode: string;
  qrTokenHash: string;
  status: "ISSUED" | "VALIDATED" | "USED" | "CANCELLED";
};

export type OfflineDecision = "approved" | "used" | "cancelled" | "invalid";

export function normalizeOfflineCode(value: string) {
  return value.trim().replace(/^digitalticket:\/\/ticket\//, "");
}

export function findCachedTicket(tickets: OfflineTicket[], candidate: string, qrTokenHash = "") {
  const normalized = normalizeOfflineCode(candidate).toUpperCase();
  return tickets.find((ticket) => ticket.checkInCode.toUpperCase() === normalized || (qrTokenHash.length > 0 && ticket.qrTokenHash === qrTokenHash));
}

export function decideOfflineTicket(ticket?: OfflineTicket): OfflineDecision {
  if (!ticket) return "invalid";
  if (ticket.status === "USED") return "used";
  if (ticket.status === "CANCELLED") return "cancelled";
  return "approved";
}

export function searchCachedTickets<T extends { holderName: string; holderEmail: string; checkInCode: string }>(tickets: T[], query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return tickets.slice(0, 100);
  return tickets.filter((ticket) => `${ticket.holderName} ${ticket.holderEmail} ${ticket.checkInCode}`.toLowerCase().includes(normalizedQuery)).slice(0, 100);
}

export function incrementOfflineStats<T extends { totalSold: number; entered: number; remaining: number; entryRate: number }>(stats: T): T {
  const entered = Math.min(stats.totalSold, stats.entered + 1);
  return { ...stats, entered, remaining: Math.max(0, stats.totalSold - entered), entryRate: stats.totalSold ? Math.round((entered / stats.totalSold) * 10000) / 100 : 0 };
}
