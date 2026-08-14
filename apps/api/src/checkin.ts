import { createHash, randomBytes } from "node:crypto";

export type TicketState = "ISSUED" | "VALIDATED" | "USED" | "CANCELLED";

export type TicketRecord = {
  id: string;
  qrTokenHash: string;
  checkInCode: string;
  state: TicketState;
  holderName: string;
  eventName: string;
};

export type CheckInDecision = {
  accepted: boolean;
  state: TicketState;
  message: string;
  ticketId: string;
  holderName: string;
  eventName: string;
};

const transitionMap: Record<TicketState, TicketState[]> = {
  ISSUED: ["VALIDATED", "CANCELLED"],
  VALIDATED: ["USED", "CANCELLED"],
  USED: [],
  CANCELLED: [],
};

export function createTicketIdentity() {
  const rawToken = randomBytes(32).toString("base64url");
  const checkInCode = `DT-${randomBytes(5).toString("hex").toUpperCase()}`;
  return { rawToken, qrTokenHash: hashValue(rawToken), checkInCode };
}

export function hashValue(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function validateTicket(record: TicketRecord, credential: string): CheckInDecision {
  const matches = record.checkInCode === credential || record.qrTokenHash === hashValue(credential);
  if (!matches) return { accepted: false, state: record.state, message: "Ingresso não encontrado.", ticketId: record.id, holderName: record.holderName, eventName: record.eventName };
  if (record.state === "CANCELLED") return { accepted: false, state: record.state, message: "Este ingresso foi cancelado.", ticketId: record.id, holderName: record.holderName, eventName: record.eventName };
  if (record.state === "USED") return { accepted: false, state: record.state, message: "Este ingresso já foi utilizado.", ticketId: record.id, holderName: record.holderName, eventName: record.eventName };
  return { accepted: true, state: record.state, message: "Entrada autorizada.", ticketId: record.id, holderName: record.holderName, eventName: record.eventName };
}

export function transitionTicket(record: TicketRecord, nextState: TicketState) {
  if (!transitionMap[record.state].includes(nextState)) throw new Error(`INVALID_TICKET_TRANSITION:${record.state}:${nextState}`);
  return { ...record, state: nextState };
}

export function processIdempotentWebhook(seenEventIds: Set<string>, eventId: string, apply: () => void) {
  if (seenEventIds.has(eventId)) return { applied: false, duplicate: true } as const;
  apply();
  seenEventIds.add(eventId);
  return { applied: true, duplicate: false } as const;
}
