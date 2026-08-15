import { describe, expect, it } from "vitest";
import { buildDailySalesSeries, buildEventReport, escapeCsvCell, toCsv } from "./reports";

describe("daily sales series", () => {
  it("fills the full window with zeros and aggregates orders by day", () => {
    const today = new Date(); today.setHours(12, 0, 0, 0);
    const series = buildDailySalesSeries([{ createdAt: today, totalCents: 10000 }, { createdAt: today, totalCents: 5000 }], 7);
    expect(series).toHaveLength(7);
    const todayPoint = series[series.length - 1];
    expect(todayPoint.orders).toBe(2);
    expect(todayPoint.revenueCents).toBe(15000);
    expect(series.slice(0, -1).every((point) => point.orders === 0)).toBe(true);
  });
});

describe("csv generation", () => {
  it("escapes cells containing separators, quotes and newlines", () => {
    expect(escapeCsvCell("simples")).toBe("simples");
    expect(escapeCsvCell('com "aspas"')).toBe('"com ""aspas"""');
    expect(escapeCsvCell("com,virgula")).toBe('"com,virgula"');
    expect(escapeCsvCell(null)).toBe("");
  });
  it("builds a csv with header, rows and BOM for Excel compatibility", () => {
    const csv = toCsv(["a", "b"], [[1, "x"], [2, "y,z"]]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain("a,b");
    expect(csv).toContain('2,"y,z"');
  });
});

describe("event report", () => {
  it("computes occupancy, revenue and check-ins", () => {
    const report = buildEventReport({
      eventId: "evt-1", eventName: "Aurora Sessions", status: "PUBLISHED",
      lots: [{ capacity: 100, sold: 40 }, { capacity: 100, sold: 10 }],
      paidOrders: [{ totalCents: 8900 }, { totalCents: 17800 }],
      tickets: [{ status: "USED", checkIns: [{}] }, { status: "ISSUED", checkIns: [] }],
    });
    expect(report.capacity).toBe(200);
    expect(report.sold).toBe(50);
    expect(report.occupancyRate).toBe(25);
    expect(report.revenueCents).toBe(26700);
    expect(report.checkIns).toBe(1);
  });
  it("handles events without capacity", () => {
    const report = buildEventReport({ eventId: "evt-2", eventName: "Vazio", status: "DRAFT", lots: [], paidOrders: [], tickets: [] });
    expect(report.occupancyRate).toBe(0);
  });
});
