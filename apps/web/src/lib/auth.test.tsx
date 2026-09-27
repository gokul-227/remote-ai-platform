import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const signOut = vi.fn();
vi.mock("@/lib/supabase", () => ({ supabase: { auth: { signOut: (...args: unknown[]) => signOut(...args) } } }));

import { AuthProvider, useAuth } from "./auth";

const wrapper = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>;
const user = { id: "u1", email: "a@example.com", full_name: "A", role: "ENGINEER" as const };

describe("logout", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    signOut.mockReset().mockResolvedValue({ error: null });
  });

  it("ends the Supabase session for this device and clears per-user state", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    act(() => result.current.login("token", user, "refresh"));
    localStorage.setItem("rap-selected-job", "job-1");
    sessionStorage.setItem("rap-contract-id", "c-1");
    localStorage.setItem("pending_registration", JSON.stringify({ email: "a@example.com" }));
    localStorage.setItem("unrelated", "kept");

    await act(() => result.current.logout());

    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(result.current.user).toBeNull();
    expect(localStorage.getItem("remote_ai_platform_token")).toBeNull();
    expect(localStorage.getItem("remote_ai_platform_refresh_token")).toBeNull();
    expect(localStorage.getItem("rap-selected-job")).toBeNull();
    expect(sessionStorage.getItem("rap-contract-id")).toBeNull();
    expect(localStorage.getItem("pending_registration")).toBeNull();
    expect(localStorage.getItem("unrelated")).toBe("kept");
  });

  it("revokes every device when signing out everywhere", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await act(() => result.current.logout({ everywhere: true }));
    expect(signOut).toHaveBeenCalledWith({ scope: "global" });
  });

  it("still clears this device when the Supabase call fails", async () => {
    signOut.mockRejectedValue(new Error("offline"));
    const { result } = renderHook(() => useAuth(), { wrapper });
    act(() => result.current.login("token", user));
    await act(() => result.current.logout());
    expect(result.current.user).toBeNull();
    expect(localStorage.getItem("remote_ai_platform_token")).toBeNull();
  });
});
