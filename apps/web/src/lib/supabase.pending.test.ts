import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const patch = vi.fn();
const get = vi.fn();
vi.mock("axios", () => ({ default: { patch: (...a: unknown[]) => patch(...a), get: (...a: unknown[]) => get(...a) } }));

import { applyPendingRegistration, rememberOAuthSignUp } from "./supabase";

const session = { access_token: "t" } as never;
const user = (createdMinutesAgo: number, role = "ENGINEER") => ({
  email: "new@example.com",
  role,
  full_name: "From Google",
  created_at: new Date(Date.now() - createdMinutesAgo * 60_000).toISOString(),
});

describe("OAuth sign-up keeps the chosen role", () => {
  beforeEach(() => {
    localStorage.clear();
    patch.mockReset().mockResolvedValue({});
    get.mockReset().mockResolvedValue({ data: { role: "COMPANY" } });
  });
  afterEach(() => vi.useRealTimers());

  it("applies 'Hire talent' to the account the provider just created", async () => {
    rememberOAuthSignUp("COMPANY", "");
    await applyPendingRegistration(session, user(1));
    expect(patch).toHaveBeenCalledWith(
      expect.stringContaining("/auth/role"),
      null,
      expect.objectContaining({ params: { role: "COMPANY" } }),
    );
    expect(localStorage.getItem("pending_registration")).toBeNull();
  });

  it("never switches an existing account", async () => {
    rememberOAuthSignUp("COMPANY", "");
    const result = await applyPendingRegistration(session, user(60 * 24 * 30));
    expect(patch).not.toHaveBeenCalled();
    expect(result.role).toBe("ENGINEER");
    expect(localStorage.getItem("pending_registration")).toBeNull();
  });

  it("ignores a stale choice", async () => {
    rememberOAuthSignUp("COMPANY", "");
    const raw = JSON.parse(localStorage.getItem("pending_registration")!);
    localStorage.setItem("pending_registration", JSON.stringify({ ...raw, createdAt: Date.now() - 60 * 60_000 }));
    await applyPendingRegistration(session, user(1));
    expect(patch).not.toHaveBeenCalled();
  });

  it("does not overwrite the provider's name with an empty one", async () => {
    rememberOAuthSignUp("ENGINEER", "");
    await applyPendingRegistration(session, user(1));
    expect(patch).not.toHaveBeenCalled();
  });
});
