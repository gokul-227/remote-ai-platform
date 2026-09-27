import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const get = vi.fn();
vi.mock("@/lib/api", () => ({ default: { get: (...a: unknown[]) => get(...a) } }));
let currentUser: { id: string } | null = { id: "u1" };
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ user: currentUser }) }));

import { useApi } from "./live";

const ok = (data: unknown) => Promise.resolve({ data, headers: {} });

describe("useApi (Phase 03: no stale private content)", () => {
  beforeEach(() => {
    get.mockReset();
    currentUser = { id: "u1" };
  });

  it("does not show the previous resource while a new one loads or after it fails", async () => {
    get.mockImplementation((path: string) => (path === "/a" ? ok({ secret: "A" }) : Promise.reject(new Error("boom"))));
    const { result, rerender } = renderHook(({ p }) => useApi<{ secret: string }>(p), { initialProps: { p: "/a" } });
    await waitFor(() => expect(result.current.data?.secret).toBe("A"));

    rerender({ p: "/b" });
    expect(result.current.data).toBeUndefined();
    await waitFor(() => expect(result.current.error).toBeDefined());
    expect(result.current.data).toBeUndefined();
  });

  it("keeps showing the same resource while it reloads", async () => {
    get.mockImplementation(() => ok({ n: 1 }));
    const { result } = renderHook(() => useApi<{ n: number }>("/a"));
    await waitFor(() => expect(result.current.data?.n).toBe(1));
    get.mockImplementation(() => new Promise(() => {}));
    result.current.reload();
    await waitFor(() => expect(result.current.loading).toBe(true));
    expect(result.current.data?.n).toBe(1);
  });

  it("drops data when the signed-in user changes", async () => {
    get.mockImplementation(() => ok({ owner: "u1" }));
    const { result, rerender } = renderHook(() => useApi<{ owner: string }>("/me"));
    await waitFor(() => expect(result.current.data?.owner).toBe("u1"));

    get.mockImplementation(() => new Promise(() => {}));
    currentUser = { id: "u2" };
    rerender();
    expect(result.current.data).toBeUndefined();
  });

  it("returns nothing when there is no path", async () => {
    get.mockImplementation(() => ok({ x: 1 }));
    const { result, rerender } = renderHook(({ p }) => useApi<{ x: number }>(p), {
      initialProps: { p: "/a" as string | null },
    });
    await waitFor(() => expect(result.current.data?.x).toBe(1));
    rerender({ p: null });
    expect(result.current.data).toBeUndefined();
    expect(result.current.loading).toBe(false);
  });
});
