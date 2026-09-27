import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

// UX-04: every job in the list can be selected without a pointer, the current
// selection is exposed to assistive technology, and Save stays its own control.

const jobs = [
  { id: "j1", title: "Backend Engineer", company_name: "Acme", location: "Remote", source: "REMOTEOK" },
  { id: "j2", title: "Frontend Engineer", company_name: "Globex", location: "Remote", source: "REMOTEOK" },
];

vi.mock("@/lib/auth", () => ({ useAuth: () => ({ user: { role: "ENGINEER" } }) }));
vi.mock("@/lib/api", () => ({
  default: { post: vi.fn(async () => ({})), delete: vi.fn(async () => ({})) },
  extractErrorMessage: (_e: unknown, fallback: string) => fallback,
}));
vi.mock("./live", async (importOriginal) => {
  const real = await importOriginal<typeof import("./live")>();
  return {
    ...real,
    useApi: (path: string | null) => ({
      data: path === "/jobs" ? jobs : path === "/saved-jobs" || path === "/applications/me" ? [] : undefined,
      total: path === "/jobs" ? jobs.length : undefined,
      loading: false,
      error: null,
      reload: vi.fn(),
    }),
  };
});

import { Jobs } from "./rap_jobs";

describe("job list keyboard selection", () => {
  beforeEach(() => localStorage.clear());

  it("selects a job with Tab and Enter and marks it current", async () => {
    const user = userEvent.setup();
    render(<Jobs />);
    const second = screen.getByRole("button", { name: /Frontend Engineer.*Globex/ });
    expect(second).not.toHaveAttribute("aria-current");

    second.focus();
    await user.keyboard("{Enter}");
    expect(second).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("button", { name: /Backend Engineer.*Acme/ })).not.toHaveAttribute("aria-current");
    expect(screen.getByText("Showing Frontend Engineer at Globex")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Job details" })).toHaveTextContent("Frontend Engineer");
  });

  it("selects with Space too", async () => {
    const user = userEvent.setup();
    render(<Jobs />);
    const second = screen.getByRole("button", { name: /Frontend Engineer.*Globex/ });
    second.focus();
    await user.keyboard(" ");
    expect(second).toHaveAttribute("aria-current", "true");
  });

  it("keeps Save as a separate control that does not change the selection", async () => {
    const user = userEvent.setup();
    render(<Jobs />);
    const card = screen.getByRole("button", { name: /Frontend Engineer.*Globex/ });
    const save = screen.getByRole("button", { name: "Save Frontend Engineer" });
    expect(card.contains(save)).toBe(false);
    save.focus();
    await user.keyboard("{Enter}");
    expect(card).not.toHaveAttribute("aria-current");
  });
});
