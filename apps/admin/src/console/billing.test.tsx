import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BillingPrices, BillingPurchases, BillingRevenue, eur } from "./billing";

const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("@/lib/client", () => ({ api, ApiError: class extends Error {} }));

const purchase = {
  id: "p1",
  user_id: "u1",
  plan_slug: "featured_job",
  status: "paid",
  amount_total: 4900,
  amount_refunded: 0,
  currency: "eur",
  fulfilment_status: "done",
  subject_id: "j1",
  created_at: "2026-11-16T10:00:00Z",
};
beforeEach(() => {
  api.mockReset();
  api.mockImplementation(async (path: string, options?: { method: string }) => {
    if (options?.method) return { data: {} };
    if (path.startsWith("/admin/billing/revenue"))
      return {
        data: {
          mrr_cents: 9900, active_subscriptions: 1, trialing_subscriptions: 0, churned_30d: 0, churn_rate_30d: 0,
          one_off_revenue_cents_30d: 4900, one_off_revenue_cents_total: 4900, subscription_invoices_cents_30d: 9900,
          ad_spend_cents_30d: 150, billing_enabled: false,
        },
      };
    if (path.startsWith("/admin/billing/plans"))
      return { data: [{ slug: "hire", name: "Hire", price_cents: 9900, billing_interval: "month", is_active: true }] };
    return { data: [purchase] };
  });
});
afterEach(cleanup);

describe("staff billing", () => {
  it("shows revenue from recorded events and says when billing is off", async () => {
    render(<BillingRevenue />);
    expect((await screen.findAllByText("€99")).length).toBe(2);
    expect(screen.getByText(/BILLING_ENABLED=false/)).toBeTruthy();
    expect(screen.getByText("€1.50")).toBeTruthy();
  });

  it("refunds through the API with an audit reason", async () => {
    render(<BillingPurchases writable />);
    fireEvent.click(await screen.findByRole("button", { name: "Refund" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: "Customer asked" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm" }));
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith("/admin/billing/purchases/p1/refund", {
        method: "POST",
        json: { reason: "Customer asked" },
      }),
    );
  });

  it("edits a price in euros", async () => {
    render(<BillingPrices writable />);
    const input = await screen.findByLabelText("Price for Hire");
    fireEvent.change(input, { target: { value: "89" } });
    fireEvent.click(screen.getByRole("button", { name: "Save price" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: "Launch offer" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm" }));
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith("/admin/billing/plans/hire", {
        method: "PATCH",
        json: { reason: "Launch offer", price_cents: 8900 },
      }),
    );
  });

  it("formats cents", () => {
    expect(eur(4900)).toBe("€49");
    expect(eur(null)).toBe("—");
  });
});
