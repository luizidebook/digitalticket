import { describe, expect, it } from "vitest";
import { createTicketIdentity, processIdempotentWebhook, transitionTicket, validateTicket, type TicketRecord } from "./checkin";

describe("ticket check-in domain", () => {
  it("creates a unique QR hash and alternative code", () => {
    const first = createTicketIdentity();
    const second = createTicketIdentity();
    expect(first.qrTokenHash).not.toBe(second.qrTokenHash);
    expect(first.checkInCode).toMatch(/^DT-[A-F0-9]{10}$/);
  });

  it("accepts a valid code and rejects a used ticket", () => {
    const identity = createTicketIdentity();
    const ticket: TicketRecord = { id: "ticket-1", ...identity, state: "ISSUED", holderName: "Comprador", eventName: "Evento" };
    expect(validateTicket(ticket, identity.checkInCode).accepted).toBe(true);
    const used = transitionTicket(transitionTicket(ticket, "VALIDATED"), "USED");
    expect(validateTicket(used, identity.checkInCode).message).toContain("já foi utilizado");
  });

  it("does not apply a webhook twice", () => {
    const seen = new Set<string>();
    let applications = 0;
    expect(processIdempotentWebhook(seen, "payment-1", () => { applications += 1; })).toMatchObject({ applied: true, duplicate: false });
    expect(processIdempotentWebhook(seen, "payment-1", () => { applications += 1; })).toMatchObject({ applied: false, duplicate: true });
    expect(applications).toBe(1);
  });
});
