import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { SlackLink } from "./slack";

const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("@/lib/client", () => ({
  api,
  ApiError: class extends Error {
    status = 0;
  },
}));
afterEach(() => {
  cleanup();
  api.mockReset();
});

it("generates a one-time link code and shows the /rap command", async () => {
  api.mockImplementation(async (path: string, init?: { method?: string }) => {
    if (path === "/admin/slack/link-code" && init?.method === "POST")
      return { data: { code: "ABCD-EFGH", expires_at: "2026-11-16T10:10:00Z", command: "/rap link ABCD-EFGH" } };
    return { data: [] };
  });
  render(<SlackLink />);
  await screen.findByText("No Slack account linked yet.");
  fireEvent.click(screen.getByRole("button", { name: "Generate link code" }));
  expect(await screen.findByText("/rap link ABCD-EFGH")).toBeTruthy();
});

it("lists linked accounts and unlinks one", async () => {
  api.mockImplementation(async (path: string, init?: { method?: string }) => {
    if (init?.method === "DELETE") return { data: null };
    return {
      data: [
        {
          id: "i1",
          slack_user_id: "U1",
          slack_team_id: "T1",
          slack_username: "owner",
          created_at: "2026-11-16T10:00:00Z",
          last_used_at: null,
        },
      ],
    };
  });
  render(<SlackLink />);
  await screen.findByText("owner");
  fireEvent.click(screen.getByRole("button", { name: "Unlink" }));
  await vi.waitFor(() =>
    expect(api.mock.calls.some(([p, i]) => p === "/admin/slack/identities/i1" && i?.method === "DELETE")).toBe(true),
  );
});

it("shows an error when the code cannot be generated", async () => {
  api.mockImplementation(async (_path: string, init?: { method?: string }) => {
    if (init?.method === "POST") throw new Error("offline");
    return { data: [] };
  });
  render(<SlackLink />);
  fireEvent.click(await screen.findByRole("button", { name: "Generate link code" }));
  expect(await screen.findByText(/Network error/)).toBeTruthy();
});
