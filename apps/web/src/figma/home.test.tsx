import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
const get = vi.fn();
vi.mock("@/lib/api", () => ({
  default: { get: (...a: unknown[]) => get(...a), post: vi.fn() },
  extractErrorMessage: () => "Request failed",
}));
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ user: { id: "me", full_name: "Ada Lovelace" } }) }));
import { Home } from "./rap_start";

describe("Home overview", () => {
  it("greets a new member with a checklist, empty-state CTAs and every area", async () => {
    get.mockImplementation((path: string) =>
      path === "/engineers/me"
        ? Promise.reject({ response: { status: 404 } })
        : Promise.resolve({ data: [], headers: {} }),
    );
    render(<Home />);
    expect(screen.getByRole("heading", { name: "Welcome, Ada" })).toBeInTheDocument();
    const list = await screen.findByRole("list", { name: "Getting started" });
    expect(within(list).getByText("Create your professional profile")).toBeInTheDocument();
    expect(within(list).getByText("Ask the AI assistant")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create a project" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Upload a file" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Find people" })).toBeInTheDocument();
    for (const area of ["Network", "Collaboration", "Jobs", "Freelancing", "Projects", "Account"])
      expect(screen.getByRole("heading", { level: 3, name: area })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hiring dashboard" })).toBeInTheDocument();
  });
});
