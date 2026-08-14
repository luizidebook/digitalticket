import { afterEach, describe, expect, it, vi } from "vitest";
import { MercadoPagoGateway } from "./integrations";

afterEach(() => { vi.unstubAllGlobals(); delete process.env.MERCADO_PAGO_ACCESS_TOKEN; });

describe("MercadoPagoGateway", () => {
  it("creates a PIX payment with idempotency and external reference", async () => {
    process.env.MERCADO_PAGO_ACCESS_TOKEN = "test-token";
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 123, status: "pending", transaction_amount: 49.9, payment_method_id: "pix", point_of_interaction: { transaction_data: { qr_code: "pix-copy-paste", qr_code_base64: "base64" } } }), { status: 201, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const intent = await new MercadoPagoGateway().createPayment({ orderId: "order-1", amountCents: 4990, method: "PIX", payerEmail: "buyer@example.com" });
    expect(intent).toMatchObject({ externalId: "123", method: "PIX", amountCents: 4990, qrCode: "pix-copy-paste" });
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const headers = request.headers as Headers;
    expect(headers.get("authorization")).toBe("Bearer test-token");
    expect(headers.get("x-idempotency-key")).toBe("digitalticket-order-order-1");
    expect(JSON.parse(String(request.body))).toMatchObject({ external_reference: "order-1", payment_method_id: "pix", transaction_amount: 49.9 });
  });

  it("maps an approved card payment from the provider", async () => {
    process.env.MERCADO_PAGO_ACCESS_TOKEN = "test-token";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 456, status: "approved", transaction_amount: 100, payment_method_id: "visa" }), { status: 200 })));
    await expect(new MercadoPagoGateway().getPayment("456")).resolves.toMatchObject({ externalId: "456", status: "APPROVED", method: "CREDIT_CARD", amountCents: 10000 });
  });
});

  it("signs and verifies ticket tokens while rejecting tampering", async () => {
    const { createTicketSecret, verifyTicketToken } = await import("./integrations");
    const secret = createTicketSecret();
    expect(verifyTicketToken(secret.signedToken)).toBe(secret.rawToken);
    expect(verifyTicketToken(`${secret.rawToken}.tampered`)).toBeNull();
  });
