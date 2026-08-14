import { describe, expect, it } from "vitest";
import { assertAllowedRole, assertTenantAccess, resolveTenant } from "./tenant";

describe("tenant access", () => {
  const tenants = [{ id: "org-a", slug: "aurora", domain: "tickets.aurora.com", active: true }, { id: "org-b", slug: "beta", domain: null, active: true }];

  it("resolves by slug or custom domain", () => {
    expect(resolveTenant(tenants, "tickets.aurora.com")?.id).toBe("org-a");
    expect(resolveTenant(tenants, "beta")?.id).toBe("org-b");
  });

  it("blocks an organizer from another tenant", () => {
    expect(() => assertTenantAccess({ role: "ORGANIZER", sessionOrganizationId: "org-a", resourceOrganizationId: "org-b" })).toThrow("TENANT_ACCESS_DENIED");
    expect(assertTenantAccess({ role: "SUPER_ADMIN", resourceOrganizationId: "org-b" })).toBe(true);
  });

  it("enforces role allowlists", () => {
    expect(assertAllowedRole("ORGANIZER", ["ORGANIZER"])).toBe(true);
    expect(() => assertAllowedRole("BUYER", ["ORGANIZER"])).toThrow("ROLE_NOT_ALLOWED");
  });
});
