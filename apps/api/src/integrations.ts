import QRCode from "qrcode";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export type PaymentMethod = "PIX" | "CREDIT_CARD";
export type PaymentIntent = { provider: "MERCADO_PAGO"; externalId: string; status: "PENDING" | "APPROVED" | "REJECTED" | "IN_PROCESS" | "REFUNDED"; method: PaymentMethod; amountCents: number; qrCode?: string; qrCodeBase64?: string; statusDetail?: string };
type MercadoPagoPayment = { id: number; status: string; status_detail?: string; transaction_amount: number; payment_method_id?: string; point_of_interaction?: { transaction_data?: { qr_code?: string; qr_code_base64?: string } } };

function paymentStatus(status: string): PaymentIntent["status"] { if (status === "approved") return "APPROVED"; if (["rejected", "cancelled", "charged_back"].includes(status)) return "REJECTED"; if (status === "refunded") return "REFUNDED"; return "IN_PROCESS"; }

export interface PaymentGateway { createPayment(input: { orderId: string; amountCents: number; method: PaymentMethod; payerEmail: string; card?: { token: string; installments: number; paymentMethodId: string; issuerId?: string } }): Promise<PaymentIntent>; getPayment(externalId: string): Promise<PaymentIntent>; }

export class MercadoPagoGateway implements PaymentGateway {
  private readonly accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
  private readonly baseUrl = process.env.MERCADO_PAGO_API_URL ?? "https://api.mercadopago.com";
  private async request<T>(path: string, init: RequestInit & { idempotencyKey?: string } = {}): Promise<T> {
    if (!this.accessToken) throw new Error("MERCADO_PAGO_ACCESS_TOKEN_NOT_CONFIGURED");
    const headers = new Headers(init.headers); headers.set("Authorization", `Bearer ${this.accessToken}`); headers.set("Content-Type", "application/json");
    if (init.idempotencyKey) headers.set("X-Idempotency-Key", init.idempotencyKey);
    const response = await fetch(`${this.baseUrl}${path}`, { ...init, headers }); const body = await response.text(); const data = body ? JSON.parse(body) : null;
    if (!response.ok) throw new Error(`MERCADO_PAGO_${response.status}:${JSON.stringify(data)}`); return data as T;
  }
  async createPayment(input: { orderId: string; amountCents: number; method: PaymentMethod; payerEmail: string; card?: { token: string; installments: number; paymentMethodId: string; issuerId?: string } }): Promise<PaymentIntent> {
    const payload: Record<string, unknown> = { transaction_amount: input.amountCents / 100, description: `DigitalTicket ${input.orderId}`, payer: { email: input.payerEmail }, external_reference: input.orderId, notification_url: process.env.MERCADO_PAGO_WEBHOOK_URL };
    if (input.method === "PIX") payload.payment_method_id = "pix"; else { if (!input.card) throw new Error("CARD_DETAILS_REQUIRED"); Object.assign(payload, { token: input.card.token, installments: input.card.installments, payment_method_id: input.card.paymentMethodId, issuer_id: input.card.issuerId }); }
    const data = await this.request<MercadoPagoPayment>("/v1/payments", { method: "POST", body: JSON.stringify(payload), idempotencyKey: `digitalticket-order-${input.orderId}` });
    const tx = data.point_of_interaction?.transaction_data;
    return { provider: "MERCADO_PAGO", externalId: String(data.id), status: paymentStatus(data.status), method: input.method, amountCents: Math.round(data.transaction_amount * 100), qrCode: tx?.qr_code, qrCodeBase64: tx?.qr_code_base64, statusDetail: data.status_detail };
  }
  async getPayment(externalId: string): Promise<PaymentIntent> {
    const data = await this.request<MercadoPagoPayment>(`/v1/payments/${encodeURIComponent(externalId)}`); const tx = data.point_of_interaction?.transaction_data;
    return { provider: "MERCADO_PAGO", externalId: String(data.id), status: paymentStatus(data.status), method: data.payment_method_id === "pix" ? "PIX" : "CREDIT_CARD", amountCents: Math.round(data.transaction_amount * 100), qrCode: tx?.qr_code, qrCodeBase64: tx?.qr_code_base64, statusDetail: data.status_detail };
  }
}

const ticketSigningSecret = () => process.env.TICKET_SIGNING_SECRET ?? process.env.JWT_SECRET ?? "development-ticket-secret";
export function createTicketSecret() { const rawToken = randomBytes(32).toString("base64url"); const signature = createHmac("sha256", ticketSigningSecret()).update(rawToken).digest("base64url"); return { rawToken, signedToken: `${rawToken}.${signature}`, tokenHash: createHash("sha256").update(rawToken).digest("hex") }; }
export function verifyTicketToken(signedToken: string) { const [rawToken, signature] = signedToken.split("."); if (!rawToken || !signature) return null; const expected = createHmac("sha256", ticketSigningSecret()).update(rawToken).digest("base64url"); if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null; return rawToken; }
export async function createTicketQrDataUrl(signedToken: string) { return QRCode.toDataURL(`digitalticket://ticket/${signedToken}`, { width: 640, margin: 2, errorCorrectionLevel: "H" }); }
export interface VoucherMailer { sendVoucher(input: { recipient: string; subject: string; ticketQrDataUrl: string; checkInCode: string; holderName: string; eventName: string }): Promise<void>; }

export function normalizeBrazilianPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10) throw new Error("INVALID_PHONE");
  return digits.startsWith("55") ? digits : `55${digits}`;
}

export function buildWhatsAppVoucherMessage(input: { holderName: string; eventName: string; checkInCode: string; orderUrl?: string }) {
  const lines = [
    `Olá ${input.holderName}! Seu ingresso para *${input.eventName}* está confirmado.`,
    `Código de entrada: *${input.checkInCode}*`,
    "Apresente o QR Code do voucher na portaria.",
  ];
  if (input.orderUrl) lines.push(`Acesse seu voucher: ${input.orderUrl}`);
  return lines.join("\n");
}

export interface VoucherWhatsAppSender { sendVoucher(input: { phone: string; holderName: string; eventName: string; checkInCode: string; orderUrl?: string }): Promise<void>; }

export class ConfiguredWhatsAppSender implements VoucherWhatsAppSender {
  async sendVoucher(input: { phone: string; holderName: string; eventName: string; checkInCode: string; orderUrl?: string }) {
    const token = process.env.WHATSAPP_ACCESS_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    if (!token || !phoneNumberId) throw new Error("WHATSAPP_NOT_CONFIGURED");
    const to = normalizeBrazilianPhone(input.phone);
    const response = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { preview_url: true, body: buildWhatsAppVoucherMessage(input) },
      }),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(`WHATSAPP_${response.status}:${JSON.stringify(data)}`);
  }
}
export class ConfiguredVoucherMailer implements VoucherMailer {
  async sendVoucher(input: { recipient: string; subject: string; ticketQrDataUrl: string; checkInCode: string; holderName: string; eventName: string }) {
    if (!process.env.MAIL_FROM || !process.env.SMTP_URL) throw new Error("MAILER_NOT_CONFIGURED");
    const { default: nodemailer } = await import("nodemailer"); const transport = nodemailer.createTransport(process.env.SMTP_URL);
    await transport.sendMail({ from: process.env.MAIL_FROM, to: input.recipient, subject: input.subject, text: `Olá ${input.holderName}, seu ingresso para ${input.eventName} está disponível. Código: ${input.checkInCode}`, html: `<p>Olá ${input.holderName},</p><p>Seu ingresso para <strong>${input.eventName}</strong> está disponível.</p><p>Código de entrada: <strong>${input.checkInCode}</strong></p><img alt="QR Code do ingresso" src="${input.ticketQrDataUrl}" />` });
  }
}
