import { describe, expect, it } from "vitest";
import { createAccessToken, createRefreshToken, hashToken, verifyAccessToken } from "./auth";

describe("authentication primitives", () => {
  it("creates and verifies a role-scoped access token", async () => {
    const token = await createAccessToken({ userId: "user-1", role: "ORGANIZER", organizationId: "org-1" });
    await expect(verifyAccessToken(token)).resolves.toMatchObject({ userId: "user-1", role: "ORGANIZER", organizationId: "org-1" });
  });

  it("hashes refresh credentials without storing the raw token", () => {
    const token = createRefreshToken();
    expect(token.rawToken.length).toBeGreaterThan(20);
    expect(token.tokenHash).toBe(hashToken(token.rawToken));
    expect(token.tokenHash).not.toContain(token.rawToken);
  });
});
