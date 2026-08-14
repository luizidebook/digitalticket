import { createHash, randomBytes } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";

export type ApiRole = "SUPER_ADMIN" | "ORGANIZER" | "BUYER";

const secret = new TextEncoder().encode(process.env.JWT_SECRET ?? "digitalticket-dev-secret-change-me");

export async function createAccessToken(input: { userId: string; role: ApiRole; organizationId?: string }) {
  return new SignJWT({ role: input.role, organizationId: input.organizationId ?? null })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(input.userId)
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(secret);
}

export async function verifyAccessToken(token: string) {
  const result = await jwtVerify(token, secret);
  return {
    userId: result.payload.sub as string,
    role: result.payload.role as ApiRole,
    organizationId: (result.payload.organizationId as string | null) ?? undefined,
  };
}

export function createRefreshToken() {
  const rawToken = randomBytes(48).toString("base64url");
  return { rawToken, tokenHash: hashToken(rawToken) };
}

export function hashToken(rawToken: string) {
  return createHash("sha256").update(rawToken).digest("hex");
}

export function requireRole(role: ApiRole, allowed: readonly ApiRole[]) {
  if (!allowed.includes(role)) {
    throw new Error("FORBIDDEN");
  }
}
