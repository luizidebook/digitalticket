import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildWhatsAppVoucherMessage, ConfiguredWhatsAppSender, normalizeBrazilianPhone } from "./integrations";

describe("WhatsApp phone normalization", () => {
  it("normalizes Brazilian numbers with country code", () => {
    expect(normalizeBrazilianPhone("(71) 99999-1234")).toBe("5571999991234");
    expect(normalizeBrazilianPhone("5571999991234")).toBe("5571999991234");
    expect(normalizeBrazilianPhone("+55 71 99999-1234")).toBe("5571999991234");
  });
  it("rejects numbers that are too short", () => {
    expect(() => normalizeBrazilianPhone("9999-123")).toThrow("INVALID_PHONE");
  });
});

describe("WhatsApp voucher message", () => {
  it("builds a message with holder, event and check-in code", () => {
    const message = buildWhatsAppVoucherMessage({ holderName: "Maria", eventName: "Aurora Sessions", checkInCode: "DT-ABC123", orderUrl: "https://app.example/buyer/orders/1" });
    expect(message).toContain("Maria");
    expect(message).toContain("Aurora Sessions");
    expect(message).toContain("DT-ABC123");
    expect(message).toContain("https://app.example/buyer/orders/1");
  });
  it("omits the order link when not provided", () => {
    const message = buildWhatsAppVoucherMessage({ holderName: "Maria", eventName: "Aurora", checkInCode: "DT-1" });
    expect(message).not.toContain("Acesse seu voucher");
  });
});

describe("WhatsApp sender", () => {
  beforeEach(() => {
    process.env.WHATSAPP_ACCESS_TOKEN = "wa-token";
    process.env.WHATSAPP_PHONE_NUMBER_ID = "phone-id-1";
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.WHATSAPP_ACCESS_TOKEN;
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
  });

  it("posts a text message to the Cloud API", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ messages: [{ id: "wamid.1" }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const sender = new ConfiguredWhatsAppSender();
    await sender.sendVoucher({ phone: "(71) 99999-1234", holderName: "Maria", eventName: "Aurora", checkInCode: "DT-ABC" });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://graph.facebook.com/v21.0/phone-id-1/messages");
    const payload = JSON.parse(String(init.body));
    expect(payload.messaging_product).toBe("whatsapp");
    expect(payload.to).toBe("5571999991234");
    expect(payload.text.body).toContain("DT-ABC");
  });

  it("fails closed when not configured", async () => {
    delete process.env.WHATSAPP_ACCESS_TOKEN;
    const sender = new ConfiguredWhatsAppSender();
    await expect(sender.sendVoucher({ phone: "71999991234", holderName: "M", eventName: "E", checkInCode: "C" })).rejects.toThrow("WHATSAPP_NOT_CONFIGURED");
  });
});
