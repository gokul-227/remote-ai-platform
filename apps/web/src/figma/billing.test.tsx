import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), enabled: false }));
vi.mock("@/lib/api", () => ({
  default: { get: mocks.get, post: mocks.post },
  extractErrorMessage: (_e: unknown, fallback: string) => fallback,
}));
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ user: { id: "member" } }) }));
import { BillingPanel, PaidPlacements, PromotionChip } from "./rap_billing";

const item = {
  slug: "premium_monthly",
  name: "Premium (monthly)",
  description: "More AI",
  audience: "member",
  mode: "subscription",
  price_cents: 900,
  currency: "eur",
  billing_interval: "month",
  duration_days: null,
  target: null,
  trial_days: 7,
  is_active: true,
  entitlements: {},
};
const me = {
  enabled: true,
  has_customer: true,
  entitlements: [],
  subscriptions: [
    { id: "s", plan: "premium_monthly", plan_name: "Premium (monthly)", status: "active", current_period_end: "2026-12-16T00:00:00Z", cancel_at_period_end: true },
  ],
  purchases: [],
  invoices: [
    { id: "i", amount_paid: 900, currency: "eur", created_at: "2026-11-16T00:00:00Z", hosted_invoice_url: null, invoice_pdf: "https://pay.example/pdf" },
  ],
  balances: {
    featured_job_credits: 0,
    ad_balance_cents: 0,
    ai_tokens: 0,
    proposals: { available: 20, monthly_remaining: 20, pack_remaining: 0, included_monthly: 20 },
    messaging: { available: 0, monthly_remaining: 0, pack_remaining: 0, included_monthly: 0 },
  },
};

beforeEach(() => {
  mocks.get.mockReset();
  mocks.post.mockReset();
  mocks.get.mockImplementation((path: string) => {
    if (path === "/billing/catalog")
      return Promise.resolve({ data: { enabled: mocks.enabled, currency: "eur", prices_include_vat: true, items: [item] } });
    if (path === "/billing/me") return Promise.resolve({ data: { ...me, enabled: mocks.enabled } });
    if (path === "/billing/referral") return Promise.resolve({ data: { code: "ABC123", credit_cents: 1000 } });
    if (path === "/billing/placements/jobs")
      return Promise.resolve({
        data: mocks.enabled
          ? { featured: [], sponsored: [{ label: "Sponsored", campaign_id: "c1", job: { id: "j1", title: "Editor", company_name: "Acme" } }] }
          : { featured: [], sponsored: [] },
      });
    return Promise.resolve({ data: [] });
  });
});

describe("billing gate", () => {
  it("shows coming soon and no buy buttons while billing is off", async () => {
    mocks.enabled = false;
    render(<BillingPanel />);
    expect(await screen.findByText(/Paid features are coming soon/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Buy" })).toBeNull();
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it("lists plans, invoices and starts checkout when billing is on", async () => {
    mocks.enabled = true;
    mocks.post.mockResolvedValue({ data: { url: "https://checkout.example/s" } });
    const assign = vi.fn();
    Object.defineProperty(window, "location", { value: { ...window.location, assign, hash: "" }, writable: true });
    render(<BillingPanel />);
    expect(await screen.findByText(/ends/)).toBeInTheDocument();
    expect(screen.getByText("€9 / month")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Download PDF" })).toHaveAttribute("href", "https://pay.example/pdf");
    expect(screen.getByText("ABC123")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Buy" }));
    await waitFor(() => expect(mocks.post).toHaveBeenCalledWith("/billing/checkout", { plan: "premium_monthly", subject_id: undefined }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("https://checkout.example/s"));
    fireEvent.click(screen.getByRole("button", { name: "Manage billing and cancel" }));
    await waitFor(() => expect(mocks.post).toHaveBeenCalledWith("/billing/portal"));
  });
});

describe("paid placements", () => {
  it("are always labelled and nothing renders while billing is off", async () => {
    mocks.enabled = false;
    const { container } = render(<PaidPlacements />);
    await waitFor(() => expect(mocks.get).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("labels sponsored jobs and records the click", async () => {
    mocks.enabled = true;
    mocks.post.mockResolvedValue({ data: {} });
    render(<PaidPlacements />);
    expect(await screen.findByText("Sponsored")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Editor/ }));
    expect(mocks.post).toHaveBeenCalledWith("/billing/placements/sponsored/c1/click");
  });

  it("renders only known labels", () => {
    render(<PromotionChip kind="featured" />);
    expect(screen.getByText("Featured")).toBeInTheDocument();
    const { container } = render(<PromotionChip kind="organic" />);
    expect(container).toBeEmptyDOMElement();
  });
});
