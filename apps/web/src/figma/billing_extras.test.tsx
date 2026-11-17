import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn() }));
vi.mock("@/lib/api", () => ({
  default: { get: mocks.get, post: mocks.post, put: mocks.put, delete: mocks.del },
  extractErrorMessage: (_e: unknown, fallback: string) => fallback,
}));
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ user: { id: "me" } }) }));
import {
  BrandingEditor,
  CompanyBranding,
  MessageCreditNote,
  OpenToOpportunitiesBanner,
  ReferralBox,
  SeatsNote,
} from "./rap_billing_extras";

const branding = {
  enabled: true,
  cover_video_url: "https://video.example/intro",
  testimonials: [{ id: "t1", author_name: "Sam", author_title: "Engineer", quote: "Great team", sort_order: 0 }],
};
let quote = { required: true, available: 0 };
beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset();
  localStorage.clear();
  mocks.get.mockImplementation((path: string) => {
    if (path.startsWith("/billing/messages/quote")) return Promise.resolve({ data: quote });
    if (path.endsWith("/seats"))
      return Promise.resolve({ data: { enforced: true, used: 3, included: 3, available: 0 } });
    if (path.startsWith("/billing/branding")) return Promise.resolve({ data: branding });
    return Promise.resolve({ data: {} });
  });
  mocks.post.mockResolvedValue({ data: {} });
  mocks.put.mockResolvedValue({ data: {} });
});

describe("billing extras", () => {
  it("composer shows the messaging credit balance and asks the other participant", async () => {
    quote = { required: true, available: 0 };
    render(<MessageCreditNote participants={["me", "them"]} conversationId="c1" />);
    expect(await screen.findByTestId("message-credit-note")).toHaveTextContent("0 left");
    expect(mocks.get.mock.calls[0][0]).toContain("recipient_id=them");
    expect(screen.getByRole("link", { name: "Get messaging credits" })).toBeInTheDocument();
  });

  it("composer says nothing when no credit is needed", async () => {
    quote = { required: false, available: 0 };
    const { container } = render(<MessageCreditNote participants={["them", "me"]} conversationId="c1" />);
    await waitFor(() => expect(mocks.get).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("team seats prompt an upgrade when full", async () => {
    render(<SeatsNote orgId="o1" />);
    expect(await screen.findByTestId("seats-note")).toHaveTextContent("3 of 3 used");
    expect(screen.getByRole("link", { name: "Add a seat" })).toHaveAttribute("href", "/#billing?plan=extra_seat");
  });

  it("referral box applies a code and shows the share link", async () => {
    render(<ReferralBox code="ABC123" creditCents={1000} />);
    expect(screen.getByTestId("share-link")).toHaveTextContent("#billing?ref=ABC123");
    fireEvent.change(screen.getByLabelText("Referral code"), { target: { value: "FRIEND1" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply code" }));
    await waitFor(() => expect(mocks.post).toHaveBeenCalledWith("/billing/referral/claim", { code: "FRIEND1" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Code saved");
  });

  it("branding editor saves the video and adds testimonials", async () => {
    render(<BrandingEditor />);
    fireEvent.change(await screen.findByLabelText("Cover video link"), { target: { value: "https://v.example/new" } });
    fireEvent.click(screen.getByRole("button", { name: "Save video" }));
    await waitFor(() =>
      expect(mocks.put).toHaveBeenCalledWith("/billing/branding/me", { cover_video_url: "https://v.example/new" }),
    );
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Ana" } });
    fireEvent.change(screen.getByLabelText("Quote"), { target: { value: "Love it" } });
    fireEvent.click(screen.getByRole("button", { name: "Add testimonial" }));
    await waitFor(() =>
      expect(mocks.post).toHaveBeenCalledWith("/billing/branding/me/testimonials", {
        author_name: "Ana",
        author_title: null,
        quote: "Love it",
      }),
    );
  });

  it("company page shows branding only with a safe link", async () => {
    render(<CompanyBranding companyId="co" />);
    expect(await screen.findByRole("link", { name: "Watch our company video" })).toHaveAttribute(
      "href",
      "https://video.example/intro",
    );
    expect(screen.getByText("“Great team”")).toBeInTheDocument();
  });

  it("opt-in banner shows once and turns the setting on", async () => {
    const onOptIn = vi.fn().mockResolvedValue(undefined);
    const { unmount } = render(<OpenToOpportunitiesBanner open={false} onOptIn={onOptIn} />);
    fireEvent.click(await screen.findByRole("button", { name: "Turn on" }));
    await waitFor(() => expect(onOptIn).toHaveBeenCalled());
    unmount();
    const { container } = render(<OpenToOpportunitiesBanner open={false} onOptIn={onOptIn} />);
    expect(container).toBeEmptyDOMElement();
  });
});
