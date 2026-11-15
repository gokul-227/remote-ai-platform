import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
const get = vi.fn();
const post = vi.fn();
vi.mock("@/lib/api", () => ({
  default: { get: (...a: unknown[]) => get(...a), post: (...a: unknown[]) => post(...a) },
  extractErrorMessage: () => "Request failed",
}));
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ user: { id: "member", full_name: "Member" } }) }));
import { ExternalReading } from "./ExternalReading";
import { Feed } from "./rap_social";
import { InviteBanner, InviteLink, PeopleYouMayKnow } from "./NetworkColdStart";

const item = {
  id: "n1",
  title: "Async standups",
  excerpt: "Short summary.",
  url: "https://example.org/a",
  discussion_url: "javascript:alert(1)",
  tags: ["remote"],
  published_at: new Date().toISOString(),
  source: { name: "NEWS_DEVTO", label: "DEV Community", homepage: "https://dev.to" },
};

describe("From around the web", () => {
  beforeEach(() => {
    get.mockReset();
    post.mockReset();
  });
  it("labels items as external, attributes the source and only links http(s)", async () => {
    get.mockResolvedValue({ data: { items: [item], has_more: false }, headers: {} });
    render(<ExternalReading />);
    const title = await screen.findByRole("link", { name: "Async standups" });
    expect(title).toHaveAttribute("href", "https://example.org/a");
    expect(title).toHaveAttribute("rel", expect.stringContaining("noopener"));
    expect(screen.getByText("External")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Read on DEV Community" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Discussion" })).not.toBeInTheDocument();
    expect(screen.getByText(/not posts by members/)).toBeInTheDocument();
  });
  it("shows an honest empty state", async () => {
    get.mockResolvedValue({ data: { items: [], has_more: false }, headers: {} });
    render(<ExternalReading />);
    await screen.findByText("Nothing from around the web yet");
  });
  it("is a separate tab in the feed, not mixed into member posts", async () => {
    get.mockResolvedValue({ data: { posts: [], items: [], has_more: false }, headers: {} });
    render(<Feed />);
    fireEvent.click(await screen.findByRole("tab", { name: "From around the web" }));
    await waitFor(() =>
      expect(get).toHaveBeenLastCalledWith("/social/external", { params: { page: 1, page_size: 20 } }),
    );
  });
});

describe("network cold start", () => {
  beforeEach(() => {
    get.mockReset();
    post.mockReset();
    localStorage.clear();
  });
  it("shows suggestions with reasons and sends a request", async () => {
    get.mockResolvedValue({
      data: [{ id: "u2", full_name: "Ada", headline: "Backend", reasons: ["Same organisation"] }],
      headers: {},
    });
    post.mockResolvedValue({ data: {} });
    const notice = vi.fn();
    render(<PeopleYouMayKnow onNotice={notice} />);
    expect(await screen.findByText("Same organisation")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));
    await waitFor(() => expect(post).toHaveBeenCalledWith("/connections", { receiver_id: "u2" }));
    await screen.findByRole("button", { name: "Requested" });
  });
  it("guides people when there are no suggestions", async () => {
    get.mockResolvedValue({ data: [], headers: {} });
    render(<PeopleYouMayKnow onNotice={() => {}} />);
    await screen.findByRole("button", { name: "Find a community" });
  });
  it("creates a personal invite link without asking for anyone's address", async () => {
    post.mockResolvedValue({ data: { token: "tok123" } });
    render(<InviteLink onNotice={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Create invite link" }));
    const box = (await screen.findByRole("textbox", { name: "Your invite link" })) as HTMLInputElement;
    expect(box.value).toContain("#network?invite=tok123");
    expect(screen.getByRole("link", { name: "Send it from your email app" })).toHaveAttribute(
      "href",
      expect.stringMatching(/^mailto:\?subject=/),
    );
    expect(screen.queryByRole("textbox", { name: /email/i })).not.toBeInTheDocument();
  });
  it("accepts an invite from the link", async () => {
    window.location.hash = "#network?invite=tok123";
    get.mockResolvedValue({ data: { inviter: { full_name: "Grace", headline: "CTO" } }, headers: {} });
    post.mockResolvedValue({ data: { status: "PENDING" } });
    const notice = vi.fn();
    render(<InviteBanner onNotice={notice} />);
    fireEvent.click(await screen.findByRole("button", { name: "Send connection request" }));
    await waitFor(() => expect(post).toHaveBeenCalledWith("/invites/accept/tok123"));
    expect(notice).toHaveBeenCalledWith("Connection request sent to Grace");
    window.location.hash = "";
  });
});
