import { PrismaClient } from "@prisma/client";
import argon2 from "argon2";

const prisma = new PrismaClient();

async function main() {
  const superAdminPassword = process.env.SEED_SUPER_ADMIN_PASSWORD ?? "super-admin-dev-123";
  const organizerPassword = process.env.SEED_ORGANIZER_PASSWORD ?? "organizer-dev-123";

  const superAdmin = await prisma.user.upsert({
    where: { email: "admin@digitalticket.local" },
    update: { role: "SUPER_ADMIN" },
    create: {
      name: "Super Admin",
      email: "admin@digitalticket.local",
      passwordHash: await argon2.hash(superAdminPassword),
      role: "SUPER_ADMIN",
    },
  });

  const organization = await prisma.organization.upsert({
    where: { slug: "aurora" },
    update: {},
    create: {
      name: "Aurora Produções",
      slug: "aurora",
      domain: null,
      primaryColor: "#ff5c7a",
      accentColor: "#8b5cf6",
    },
  });

  const organizer = await prisma.user.upsert({
    where: { email: "organizador@aurora.local" },
    update: { role: "ORGANIZER", organizationId: organization.id },
    create: {
      name: "Organizador Aurora",
      email: "organizador@aurora.local",
      passwordHash: await argon2.hash(organizerPassword),
      role: "ORGANIZER",
      organizationId: organization.id,
    },
  });

  const event = await prisma.event.upsert({
    where: { organizationId_slug: { organizationId: organization.id, slug: "aurora-sessions" } },
    update: { status: "PUBLISHED", publishedAt: new Date() },
    create: {
      organizationId: organization.id,
      name: "Aurora Sessions",
      slug: "aurora-sessions",
      type: "show",
      category: "Música",
      tags: ["show", "ao-vivo"],
      description: "Uma noite de música ao vivo com artistas convidados.",
      startsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      status: "PUBLISHED",
      publishedAt: new Date(),
    },
  });

  const existingLot = await prisma.lot.findFirst({ where: { eventId: event.id, name: "Lote promocional" } });
  if (!existingLot) {
    await prisma.lot.create({
      data: { eventId: event.id, name: "Lote promocional", priceInCents: 8900, capacity: 200, maxPerOrder: 4, sortOrder: 0 },
    });
  }

  console.log("[seed] super-admin:", superAdmin.email);
  console.log("[seed] organization:", organization.slug);
  console.log("[seed] organizer:", organizer.email);
  console.log("[seed] event:", event.slug, event.status);
}

main().finally(() => prisma.$disconnect());
