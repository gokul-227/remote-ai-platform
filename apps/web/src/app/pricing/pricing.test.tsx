import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { formatPrice, priceLabel, type Catalog, type CatalogItem } from "@/lib/billing";
import { PricingView } from "./PricingView";

const base: Omit<CatalogItem, "slug" | "name" | "price_cents" | "billing_interval" | "mode" | "audience"> = {
  description: "x",
  currency: "eur",
  duration_days: null,
  target: null,
  trial_days: null,
  is_active: true,
  entitlements: {},
};
const items: CatalogItem[] = [
  {
    ...base,
    slug: "featured_job",
    name: "Featured job",
    price_cents: 4900,
    billing_interval: "one_time",
    mode: "payment",
    audience: "employer",
    target: "job",
  },
  {
    ...base,
    slug: "hire",
    name: "Hire",
    price_cents: 9900,
    billing_interval: "month",
    mode: "subscription",
    audience: "employer",
  },
  {
    ...base,
    slug: "premium_yearly",
    name: "Premium (yearly)",
    price_cents: 7900,
    billing_interval: "year",
    mode: "subscription",
    audience: "member",
  },
  {
    ...base,
    slug: "verified_badge",
    name: "Verified badge",
    price_cents: 1900,
    billing_interval: "one_time",
    mode: "payment",
    audience: "member",
    is_active: false,
  },
];
const catalog = (enabled: boolean): Catalog => ({ enabled, currency: "eur", prices_include_vat: true, items });

describe("pricing page", () => {
  it("says coming soon and offers nothing to buy while billing is off", () => {
    render(<PricingView catalog={catalog(false)} />);
    expect(screen.getByRole("status")).toHaveTextContent("coming soon");
    expect(screen.queryByRole("link", { name: /Buy/ })).toBeNull();
    expect(within(screen.getByTestId("plan-hire")).getByText("Coming soon")).toBeInTheDocument();
  });

  it("links each available item to checkout when billing is on", () => {
    render(<PricingView catalog={catalog(true)} />);
    expect(screen.queryByRole("status")).toBeNull();
    expect(within(screen.getByTestId("plan-hire")).getByRole("link", { name: "Buy" })).toHaveAttribute(
      "href",
      "/#billing?plan=hire",
    );
    expect(within(screen.getByTestId("plan-featured_job")).getByRole("link")).toHaveTextContent("Choose a job");
    expect(within(screen.getByTestId("plan-verified_badge")).getByText("Not available yet")).toBeInTheDocument();
  });

  it("is honest: free core features, VAT note, labelled placements and terms links", () => {
    render(<PricingView catalog={catalog(true)} />);
    expect(screen.getByText("Search, view and apply for jobs")).toBeInTheDocument();
    expect(screen.getByText(/include VAT where it applies/)).toBeInTheDocument();
    expect(screen.getByText(/always labelled as paid/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Paid services/ })).toHaveAttribute("href", "/terms#paid-services");
    expect(screen.getByRole("link", { name: /Employer Terms/ })).toHaveAttribute("href", "/employer-terms");
  });

  it("handles an unreachable catalogue", () => {
    render(<PricingView catalog={{ enabled: false, currency: "eur", prices_include_vat: true, items: [] }} />);
    expect(screen.getByText(/Prices are not available right now/)).toBeInTheDocument();
  });

  it("formats euro prices", () => {
    expect(formatPrice(4900)).toBe("€49");
    expect(formatPrice(50)).toBe("€0.50");
    expect(priceLabel({ price_cents: 7900, currency: "eur", billing_interval: "year" })).toBe("€79 / year");
    expect(priceLabel({ price_cents: 1900, currency: "eur", billing_interval: "one_time" })).toBe("€19 one-off");
  });
});
