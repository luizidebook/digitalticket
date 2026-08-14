import { PrismaClient } from "@prisma/client";
import argon2 from "argon2";
import type { Request, Response, Router } from "express";
import { z } from "zod";
import { createAccessToken, createRefreshToken, hashToken, verifyAccessToken, type ApiRole } from "./auth";

const prisma = new PrismaClient();
const credentialsSchema = z.object({ email: z.string().email(), password: z.string().min(8).max(128), name: z.string().min(2).max(100).optional() });

export function registerAuthRoutes(router: Router) {
  router.post("/api/v1/auth/register", async (req: Request, res: Response) => {
    const parsed = credentialsSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "INVALID_CREDENTIALS" });
    const { email, password, name = "Comprador" } = parsed.data;
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.status(409).json({ error: "EMAIL_ALREADY_REGISTERED" });
    const user = await prisma.user.create({ data: { email, name, passwordHash: await argon2.hash(password), role: "BUYER" } });
    const refresh = createRefreshToken();
    await prisma.refreshToken.create({ data: { userId: user.id, tokenHash: refresh.tokenHash, expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) } });
    return res.status(201).json({ accessToken: await createAccessToken({ userId: user.id, role: user.role as ApiRole }), refreshToken: refresh.rawToken, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  });

  router.post("/api/v1/auth/login", async (req: Request, res: Response) => {
    const parsed = credentialsSchema.pick({ email: true, password: true }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "INVALID_CREDENTIALS" });
    const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
    if (!user || !(await argon2.verify(user.passwordHash, parsed.data.password))) return res.status(401).json({ error: "INVALID_CREDENTIALS" });
    const refresh = createRefreshToken();
    await prisma.refreshToken.create({ data: { userId: user.id, tokenHash: refresh.tokenHash, expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) } });
    return res.json({ accessToken: await createAccessToken({ userId: user.id, role: user.role as ApiRole, organizationId: user.organizationId ?? undefined }), refreshToken: refresh.rawToken, user: { id: user.id, name: user.name, email: user.email, role: user.role, organizationId: user.organizationId } });
  });

  router.post("/api/v1/auth/refresh", async (req: Request, res: Response) => {
    const refreshToken = z.string().min(20).safeParse(req.body?.refreshToken);
    if (!refreshToken.success) return res.status(401).json({ error: "INVALID_REFRESH_TOKEN" });
    const stored = await prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(refreshToken.data) }, include: { user: true } });
    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) return res.status(401).json({ error: "INVALID_REFRESH_TOKEN" });
    const next = createRefreshToken();
    await prisma.$transaction([prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } }), prisma.refreshToken.create({ data: { userId: stored.userId, tokenHash: next.tokenHash, expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) } })]);
    return res.json({ accessToken: await createAccessToken({ userId: stored.user.id, role: stored.user.role as ApiRole, organizationId: stored.user.organizationId ?? undefined }), refreshToken: next.rawToken });
  });

  router.post("/api/v1/auth/logout", async (req: Request, res: Response) => {
    const token = z.string().min(20).safeParse(req.body?.refreshToken);
    if (token.success) await prisma.refreshToken.updateMany({ where: { tokenHash: hashToken(token.data), revokedAt: null }, data: { revokedAt: new Date() } });
    return res.status(204).send();
  });
}

export async function authenticateRequest(req: Request) {
  const header = req.header("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  try { return await verifyAccessToken(header.slice(7)); } catch { return null; }
}
