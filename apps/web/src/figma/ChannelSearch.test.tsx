import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
const get = vi.fn();
vi.mock("@/lib/api", () => ({
  default: { get: (...args: unknown[]) => get(...args) },
  extractErrorMessage: () => "Search unavailable",
}));
import { ChannelSearch } from "./ChannelSearch";
const message = (id: string, parent_id: string | null = null) => ({
  id,
  body: `Decision ${id}`,
  author_name: "Teammate",
  parent_id,
  created_at: "2026-11-05T10:00:00Z",
});
describe("channel message search", () => {
  beforeEach(() => get.mockReset());
  it("searches explicitly and pages thread replies using the full cursor", async () => {
    get.mockResolvedValueOnce({ data: { items: [message("first")], has_more: true } });
    render(<ChannelSearch channelId="channel" />);
    expect(screen.getByRole("button", { name: /^Search$/ })).toBeDisabled();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "decision" } });
    expect(get).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /^Search$/ }));
    await screen.findByText("Decision first");
    get.mockResolvedValueOnce({ data: { items: [message("reply", "root")], has_more: false } });
    fireEvent.click(screen.getByRole("button", { name: "Load more matches" }));
    await screen.findByText("Thread reply");
    expect(get).toHaveBeenLastCalledWith("/channels/channel/search", {
      params: { q: "decision", limit: 25, before: "2026-11-05T10:00:00Z", before_id: "first" },
    });
    expect(screen.getByText("Decision first")).toBeInTheDocument();
  });
  it("clears private retained matches on an access failure and allows a fresh search", async () => {
    get.mockResolvedValueOnce({ data: { items: [message("secret")], has_more: true } });
    render(<ChannelSearch channelId="channel" />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "decision" } });
    fireEvent.click(screen.getByRole("button", { name: /^Search$/ }));
    await screen.findByText("Decision secret");
    get.mockRejectedValueOnce({ response: { status: 404 } });
    fireEvent.click(screen.getByRole("button", { name: "Load more matches" }));
    await screen.findByRole("alert");
    expect(screen.queryByText("Decision secret")).not.toBeInTheDocument();
    get.mockResolvedValueOnce({ data: { items: [], has_more: false } });
    fireEvent.click(screen.getByRole("button", { name: /^Search$/ }));
    await screen.findByText("No messages match “decision”.");
  });
  it("ignores a response that finishes after clearing the search", async () => {
    let resolve!: (value: unknown) => void;
    get.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    render(<ChannelSearch channelId="channel" />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "decision" } });
    fireEvent.click(screen.getByRole("button", { name: /^Search$/ }));
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    resolve({ data: { items: [message("late")], has_more: false } });
    await waitFor(() => expect(screen.getByRole("searchbox")).toHaveValue(""));
    expect(screen.queryByText("Decision late")).not.toBeInTheDocument();
  });
});
