import { describe, expect, it } from "vitest";
import { decideOfflineTicket, findCachedTicket, incrementOfflineStats, normalizeOfflineCode, searchCachedTickets } from "./offline";

const tickets = [
  { id: "1", holderName: "Maria Silva", holderEmail: "maria@example.com", checkInCode: "DT-ABC123", qrTokenHash: "hash-1", status: "ISSUED" as const },
  { id: "2", holderName: "João Costa", holderEmail: "joao@example.com", checkInCode: "DT-XYZ789", qrTokenHash: "hash-2", status: "USED" as const },
  { id: "3", holderName: "Ana Lima", holderEmail: "ana@example.com", checkInCode: "DT-CANCEL", qrTokenHash: "hash-3", status: "CANCELLED" as const },
];

describe("mobile offline check-in rules", () => {
  it("normalizes QR deep links", () => {
    expect(normalizeOfflineCode("digitalticket://ticket/DT-ABC123")).toBe("DT-ABC123");
  });

  it("finds tickets by code or cached QR hash", () => {
    expect(findCachedTicket(tickets, "dt-abc123")?.id).toBe("1");
    expect(findCachedTicket(tickets, "anything", "hash-2")?.id).toBe("2");
    expect(findCachedTicket(tickets, "missing")).toBeUndefined();
  });

  it("returns the correct offline decision", () => {
    expect(decideOfflineTicket(tickets[0])).toBe("approved");
    expect(decideOfflineTicket(tickets[1])).toBe("used");
    expect(decideOfflineTicket(tickets[2])).toBe("cancelled");
    expect(decideOfflineTicket()).toBe("invalid");
  });

  it("searches cached tickets by name, email and code", () => {
    expect(searchCachedTickets(tickets, "maria")).toHaveLength(1);
    expect(searchCachedTickets(tickets, "EXAMPLE.COM")).toHaveLength(3);
    expect(searchCachedTickets(tickets, "xyz789")[0].id).toBe("2");
  });

  it("increments real-time entry statistics without exceeding total", () => {
    const first = incrementOfflineStats({ totalSold: 2, entered: 0, remaining: 2, entryRate: 0 });
    expect(first).toMatchObject({ entered: 1, remaining: 1, entryRate: 50 });
    const second = incrementOfflineStats(first);
    const third = incrementOfflineStats(second);
    expect(second).toMatchObject({ entered: 2, remaining: 0, entryRate: 100 });
    expect(third).toMatchObject({ entered: 2, remaining: 0, entryRate: 100 });
  });
});
