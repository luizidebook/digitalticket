import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MercadoPagoGateway } from "./integrations";

const pixPaymentResponse = {
  id: 123456789,
  status: "pending",
  status_detail: "pending_waiting_transfer",
  transaction_amount: 180.0,
  payment_method_id: "pix",
  point_of_interaction: { transaction_data: { qr_code: "00020126pix-payload", qr_code_base64: "cGl4LWJhc2U2NA==" } },
};

const approvedCardResponse = {
  id: 987654321,
  status: "approved",
  status_detail: "accredited",
  transaction_amount: 100.0,
  payment_method_id: "visa",
};

describe("Mercado Pago gateway contract (sandbox-shaped payloads)", () => {
  beforeEach(() => {
    process.env.MERCADO_PAGO_ACCESS_TOKEN = "TEST-sandbox-token";
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.MERCADO_PAGO_ACCESS_TOKEN;
  });

  it("creates a PIX payment and maps qr code fields", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(pixPaymentResponse), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    const gateway = new MercadoPagoGateway();
    const intent = await gateway.createPayment({ orderId: "order-1", amountCents: 18000, method: "PIX", payerEmail: "buyer@test.local" });
    expect(intent.externalId).toBe("123456789");
    expect(intent.status).toBe("IN_PROCESS");
    expect(intent.qrCode).toBe("00020126pix-payload");
    expect(intent.qrCodeBase64).toBe("cGl4LWJhc2U2NA==");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.mercadopago.com/v1/payments");
    expect((init.headers as Headers).get("X-Idempotency-Key")).toBe("digitalticket-order-order-1");
    const payload = JSON.parse(String(init.body));
    expect(payload.payment_method_id).toBe("pix");
    expect(payload.transaction_amount).toBe(180);
    expect(payload.external_reference).toBe("order-1");
  });

  it("creates a credit card payment and maps approved status", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(approvedCardResponse), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    const gateway = new MercadoPagoGateway();
    const intent = await gateway.createPayment({ orderId: "order-2", amountCents: 10000, method: "CREDIT_CARD", payerEmail: "buyer@test.local", card: { token: "card-token", installments: 1, paymentMethodId: "visa" } });
    expect(intent.status).toBe("APPROVED");
    expect(intent.method).toBe("CREDIT_CARD");
    const payload = JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body));
    expect(payload.token).toBe("card-token");
    expect(payload.installments).toBe(1);
  });

  it("requires card details for credit card payments", async () => {
    const gateway = new MercadoPagoGateway();
    await expect(gateway.createPayment({ orderId: "order-3", amountCents: 1000, method: "CREDIT_CARD", payerEmail: "buyer@test.local" })).rejects.toThrow("CARD_DETAILS_REQUIRED");
  });

  it("fetches payment status for reconciliation", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ...pixPaymentResponse, status: "approved" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const gateway = new MercadoPagoGateway();
    const intent = await gateway.getPayment("123456789");
    expect(intent.status).toBe("APPROVED");
    expect((fetchMock.mock.calls[0] as [string])[0]).toBe("https://api.mercadopago.com/v1/payments/123456789");
  });

  it("throws when the access token is not configured", async () => {
    delete process.env.MERCADO_PAGO_ACCESS_TOKEN;
    const gateway = new MercadoPagoGateway();
    await expect(gateway.getPayment("1")).rejects.toThrow("MERCADO_PAGO_ACCESS_TOKEN_NOT_CONFIGURED");
  });

  it("surfaces provider errors with status code", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: "invalid token" }), { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);
    const gateway = new MercadoPagoGateway();
    await expect(gateway.getPayment("1")).rejects.toThrow("MERCADO_PAGO_401");
  });
});
