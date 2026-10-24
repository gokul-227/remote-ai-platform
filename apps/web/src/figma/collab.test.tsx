import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const get = vi.fn();
const post = vi.fn();
vi.mock("@/lib/api", () => ({
  default: { get: (...a: unknown[]) => get(...a), post: (...a: unknown[]) => post(...a) },
  extractErrorMessage: (_e: unknown, fallback: string) => fallback,
}));
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ user: { id: "worker" } }) }));

import { Assistant, Deliverables } from "./rap_collab";

const ok = (data: unknown) => Promise.resolve({ data, headers: {} });

describe("Assistant", () => {
  beforeEach(() => {
    get.mockReset();
    post.mockReset();
  });

  it("never performs a write until the user confirms it", async () => {
    post.mockImplementation((path: string) =>
      path === "/assistant/chat"
        ? ok({
            reply: "I can add that.",
            tool: "create_task",
            kind: "WRITE",
            result: null,
            pending_action: { id: "a1", summary: "Create work item “Fix login”", expires_at: "2030-01-01T00:00:00Z" },
          })
        : ok({ status: "EXECUTED", result: { ok: true, link: "#projects" } }),
    );
    render(<Assistant />);
    fireEvent.change(screen.getByLabelText("Message the assistant"), { target: { value: "add a task" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await screen.findByText("Confirm: Create work item “Fix login”");
    expect(post).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await screen.findByText(/Done\./);
    expect(post).toHaveBeenLastCalledWith("/assistant/actions/a1/confirm");
  });
});

describe("Deliverables", () => {
  it("does not render an unsafe demo link as a link", async () => {
    get.mockImplementation(() =>
      ok([
        {
          id: "d1",
          milestone_id: "m1",
          kind: "DEMO",
          title: "Legacy demo",
          notes: null,
          version: 1,
          status: "SUBMITTED",
          review_note: null,
          repo_url: null,
          branch: null,
          commit_sha: null,
          file_name: null,
          file_size: null,
          demo_url: "javascript:alert(1)",
          environment: "staging",
          created_at: "2030-01-01T00:00:00Z",
        },
      ]),
    );
    render(
      <Deliverables
        contractId="c1"
        party="client"
        active
        milestones={[{ id: "m1", title: "MVP", status: "DELIVERED" }]}
      />,
    );
    const link = await screen.findByText("Open demo in a new tab");
    expect(link.closest("a")).not.toHaveAttribute("href");
    await waitFor(() => expect(screen.getByRole("button", { name: "Accept" })).toBeInTheDocument());
  });
});
