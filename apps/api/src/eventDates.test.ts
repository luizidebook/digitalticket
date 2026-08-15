import { describe, expect, it } from "vitest";
import { assertEventDateWindow, eventDateInputSchema, lotInputSchema } from "./events";

describe("event date window validation", () => {
  it("accepts valid windows and open-ended dates", () => {
    expect(() => assertEventDateWindow({ startsAt: new Date("2026-09-01"), endsAt: new Date("2026-09-02") })).not.toThrow();
    expect(() => assertEventDateWindow({ startsAt: new Date("2026-09-01"), endsAt: null })).not.toThrow();
    expect(() => assertEventDateWindow({ startsAt: null, endsAt: null })).not.toThrow();
  });
  it("rejects end before start", () => {
    expect(() => assertEventDateWindow({ startsAt: new Date("2026-09-02"), endsAt: new Date("2026-09-01") })).toThrow("EVENT_DATE_END_BEFORE_START");
  });
});

describe("event date input schema", () => {
  it("accepts a full date entry and defaults", () => {
    const parsed = eventDateInputSchema.safeParse({ label: "Sexta", startsAt: "2026-09-04T20:00:00.000Z", endsAt: "2026-09-05T02:00:00.000Z" });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.sortOrder).toBe(0);
      expect(parsed.data.active).toBe(true);
    }
  });
  it("accepts a product without a fixed date", () => {
    const parsed = eventDateInputSchema.safeParse({ label: "Produto sem data" });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.startsAt ?? null).toBeNull();
  });
});

describe("lot input schema with optional event date", () => {
  it("accepts lots linked to a date or standalone", () => {
    expect(lotInputSchema.safeParse({ name: "VIP", priceInCents: 100, capacity: 10, eventDateId: "date-1" }).success).toBe(true);
    expect(lotInputSchema.safeParse({ name: "Geral", priceInCents: 100, capacity: 10 }).success).toBe(true);
  });
});
