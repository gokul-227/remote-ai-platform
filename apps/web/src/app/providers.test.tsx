import { render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
const auth = vi.hoisted(() => ({ user: null as null | { id: string } }));
vi.mock("@/lib/auth", () => ({
  useAuth: () => auth,
  AuthProvider: ({ children }: { children: ReactNode }) => children,
}));
import { Providers } from "./providers";
afterEach(() => {
  auth.user = null;
  delete document.documentElement.dataset.theme;
});
it("resets guest appearance on logout without overwriting the member preference", () => {
  localStorage.setItem("rap-theme", "dark");
  document.documentElement.dataset.theme = "dark";
  const view = render(<Providers>Guest</Providers>);
  expect(document.documentElement.dataset.theme).toBe("light");
  expect(document.documentElement.style.colorScheme).toBe("light");
  expect(localStorage.getItem("rap-theme")).toBe("dark");
  auth.user = { id: "member" };
  document.documentElement.dataset.theme = "dark";
  view.rerender(<Providers>Member</Providers>);
  expect(document.documentElement.dataset.theme).toBe("dark");
  auth.user = null;
  view.rerender(<Providers>Guest</Providers>);
  expect(document.documentElement.dataset.theme).toBe("light");
});
