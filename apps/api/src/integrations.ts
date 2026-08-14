import QRCode from "qrcode";
import { createHash, randomBytes } from "node:crypto";

export type PaymentMethod = "PIX" | "CREDIT_CARD";

export type PaymentIntent = {
  provider: "MERCADO_PAGO";
  externalId: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  method: PaymentMethod;
  amountCents: number;
  qrCode?: string;
  qrCodeBase64?: string;
};

export interface PaymentGateway {
  createPayment(input: { orderId: string; amountCents: number; method: PaymentMethod; payerEmail: string }): Promise<PaymentIntent>;
  getPayment(externalId: string): Promise<PaymentIntent>;
}

export class MercadoPagoGateway implements PaymentGateway {
  async createPayment(input: { orderId: string; amountCents: number; method: PaymentMethod; payerEmail: string }): Promise<PaymentIntent> {
    if (!process.env.MERCADO_PAGO_ACCESS_TOKEN) {
      throw new Error("MERCADO_PAGO_ACCESS_TOKEN_NOT_CONFIGURED");
    }
    throw new Error(`MERCADO_PAGO_ADAPTER_READY:${input.orderId}`);
  }

  async getPayment(externalId: string): Promise<PaymentIntent> {
    if (!process.env.MERCADO_PAGO_ACCESS_TOKEN) {
      throw new Error("MERCADO_PAGO_ACCESS_TOKEN_NOT_CONFIGURED");
    }
    throw new Error(`MERCADO_PAGO_ADAPTER_READY:${externalId}`);
  }
}

export function createTicketSecret() {
  const rawToken = randomBytes(32).toString("base64url");
  return { rawToken, tokenHash: createHash("sha256").update(rawToken).digest("hex") };
}

export async function createTicketQrDataUrl(rawToken: string) {
  return QRCode.toDataURL(`digitalticket://ticket/${rawToken}`, { width: 640, margin: 2, errorCorrectionLevel: "H" });
}

export interface VoucherMailer {
  sendVoucher(input: { recipient: string; subject: string; ticketQrDataUrl: string; checkInCode: string }): Promise<void>;
}

export class ConfiguredVoucherMailer implements VoucherMailer {
  async sendVoucher(input: { recipient: string; subject: string; ticketQrDataUrl: string; checkInCode: string }) {
    if (!process.env.MAIL_FROM) {
      throw new Error(`MAILER_NOT_CONFIGURED:${input.recipient}`);
    }
  }
}
