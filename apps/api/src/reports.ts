export type SalesPoint = { date: string; orders: number; revenueCents: number };

export function buildDailySalesSeries(orders: Array<{ createdAt: Date; totalCents: number }>, days = 30): SalesPoint[] {
  const series = new Map<string, SalesPoint>();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let index = days - 1; index >= 0; index -= 1) {
    const day = new Date(today.getTime() - index * 24 * 60 * 60 * 1000);
    const key = day.toISOString().slice(0, 10);
    series.set(key, { date: key, orders: 0, revenueCents: 0 });
  }
  for (const order of orders) {
    const key = order.createdAt.toISOString().slice(0, 10);
    const point = series.get(key);
    if (point) { point.orders += 1; point.revenueCents += order.totalCents; }
  }
  return Array.from(series.values());
}

export function escapeCsvCell(value: unknown): string {
  const text = value == null ? "" : String(value);
  if (/[",\n;]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function toCsv(headers: readonly string[], rows: ReadonlyArray<readonly unknown[]>): string {
  const lines = [headers.map(escapeCsvCell).join(",")];
  for (const row of rows) lines.push(row.map(escapeCsvCell).join(","));
  return `\uFEFF${lines.join("\n")}`;
}

export type EventReport = {
  eventId: string;
  eventName: string;
  status: string;
  capacity: number;
  sold: number;
  occupancyRate: number;
  revenueCents: number;
  orders: number;
  ticketsIssued: number;
  checkIns: number;
};

export function buildEventReport(input: {
  eventId: string; eventName: string; status: string;
  lots: Array<{ capacity: number; sold: number }>;
  paidOrders: Array<{ totalCents: number }>;
  tickets: Array<{ status: string; checkIns: unknown[] }>;
}): EventReport {
  const capacity = input.lots.reduce((sum, lot) => sum + lot.capacity, 0);
  const sold = input.lots.reduce((sum, lot) => sum + lot.sold, 0);
  return {
    eventId: input.eventId,
    eventName: input.eventName,
    status: input.status,
    capacity,
    sold,
    occupancyRate: capacity > 0 ? Math.round((sold / capacity) * 10000) / 100 : 0,
    revenueCents: input.paidOrders.reduce((sum, order) => sum + order.totalCents, 0),
    orders: input.paidOrders.length,
    ticketsIssued: input.tickets.length,
    checkIns: input.tickets.reduce((sum, ticket) => sum + ticket.checkIns.length, 0),
  };
}
