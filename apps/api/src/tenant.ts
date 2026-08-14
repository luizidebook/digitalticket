import type { ApiRole } from "./auth";

export type TenantRecord = { id: string; slug: string; domain?: string | null; active: boolean };

export function resolveTenant(tenants: readonly TenantRecord[], hostOrSlug: string) {
  const normalized = hostOrSlug.trim().toLowerCase().split(":")[0];
  return tenants.find((tenant) => tenant.active && (tenant.slug.toLowerCase() === normalized || tenant.domain?.toLowerCase() === normalized));
}

export function assertTenantAccess(input: { role: ApiRole; sessionOrganizationId?: string; resourceOrganizationId: string }) {
  if (input.role === "SUPER_ADMIN") return true;
  if (!input.sessionOrganizationId || input.sessionOrganizationId !== input.resourceOrganizationId) throw new Error("TENANT_ACCESS_DENIED");
  return true;
}

export function assertAllowedRole(role: ApiRole, allowed: readonly ApiRole[]) {
  if (!allowed.includes(role)) throw new Error("ROLE_NOT_ALLOWED");
  return true;
}
