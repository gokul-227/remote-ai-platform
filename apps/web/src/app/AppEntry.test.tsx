import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
const auth = vi.hoisted(() => ({ user: null as null | { id: string } }));
vi.mock("@/lib/auth", () => ({ useAuth: () => auth }));
vi.mock("next/dynamic", () => ({ default: () => () => <div>Member application</div> }));
import { AppEntry } from "./AppEntry";

afterEach(() => {
  auth.user = null;
  window.history.replaceState(null, "", "/");
});
describe("public landing and existing app navigation", () => {
  it("shows public HTML without a hash or member session", () => {
    render(
      <AppEntry>
        <h1>Discover remote work</h1>
      </AppEntry>,
    );
    expect(screen.getByRole("heading", { name: "Discover remote work" })).toBeInTheDocument();
  });
  it("opens the app for signup and returns when the hash is cleared", () => {
    render(
      <AppEntry>
        <h1>Discover remote work</h1>
      </AppEntry>,
    );
    act(() => {
      window.history.replaceState(null, "", "/#register");
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    expect(screen.getByText("Member application")).toBeInTheDocument();
    act(() => {
      window.history.replaceState(null, "", "/");
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    expect(screen.getByRole("heading", { name: "Discover remote work" })).toBeInTheDocument();
  });
  it("preserves signed-in members' home application", () => {
    auth.user = { id: "member" };
    render(
      <AppEntry>
        <h1>Discover remote work</h1>
      </AppEntry>,
    );
    expect(screen.getByText("Member application")).toBeInTheDocument();
  });
});
