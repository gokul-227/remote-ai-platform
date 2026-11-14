import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
const get = vi.fn();
const post = vi.fn();
vi.mock("@/lib/api", () => ({
  default: { get: (...a: unknown[]) => get(...a), post: (...a: unknown[]) => post(...a) },
  extractErrorMessage: (_e: unknown, fallback: string) => fallback,
}));
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ user: { id: "member" } }) }));
import { PrivateGroupAccess } from "./PrivateGroupAccess";
import { MessageAttachments } from "./ChannelAttachments";

describe("private group requests and direct-message files", () => {
  beforeEach(() => {
    get.mockReset();
    post.mockReset();
  });
  it("requests access, shows pending, cancels, and opens only after approval", async () => {
    let status: string | null = null;
    get.mockImplementation(() => Promise.resolve({ data: { status } }));
    post.mockImplementation((path: string) => {
      status = path.endsWith("/join") ? "pending" : null;
      return Promise.resolve({ data: {} });
    });
    const approved = vi.fn();
    render(<PrivateGroupAccess groupId="private" onApproved={approved} />);
    fireEvent.click(await screen.findByRole("button", { name: "Request to join" }));
    await screen.findByText(/Your request is pending/);
    expect(approved).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel request" }));
    await screen.findByRole("button", { name: "Request to join" });
    expect(post).toHaveBeenLastCalledWith("/groups/private/leave");
    fireEvent.click(screen.getByRole("button", { name: "Request to join" }));
    await screen.findByText(/Your request is pending/);
    status = "active";
    fireEvent.click(screen.getByRole("button", { name: "Check approval" }));
    await waitFor(() => expect(approved).toHaveBeenCalled());
  });
  it("hides request controls for banned users", async () => {
    get.mockResolvedValue({ data: { status: "banned" } });
    render(<PrivateGroupAccess groupId="private" onApproved={vi.fn()} />);
    await screen.findByText(/access to this group is restricted/);
    expect(screen.queryByRole("button", { name: "Request to join" })).not.toBeInTheDocument();
  });
  it("uses a conversation-scoped download and removes a previous link after revocation", async () => {
    get.mockResolvedValueOnce({ data: { url: "https://storage.test/signed" } });
    render(
      <MessageAttachments
        conversationId="dm"
        messageId="message"
        attachments={[{ id: "file", name: "Plan.txt", size: 10, mime: "text/plain" }]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Plan.txt/ }));
    expect(await screen.findByRole("link", { name: "Download file" })).toHaveAttribute(
      "href",
      "https://storage.test/signed",
    );
    expect(get).toHaveBeenCalledWith("/conversations/dm/messages/message/attachments/file/download");
    get.mockRejectedValueOnce({ response: { status: 404 } });
    fireEvent.click(screen.getByRole("button", { name: /Plan.txt/ }));
    await screen.findByRole("alert");
    expect(screen.queryByRole("link", { name: "Download file" })).not.toBeInTheDocument();
  });
});
