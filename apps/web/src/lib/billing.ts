/** Paid features: catalogue types, price formatting and the public catalogue fetch. */
import { API_URL } from "./site";

export type CatalogItem = {
  slug: string;
  name: string;
  description: string | null;
  audience: "employer" | "member";
  mode: "payment" | "subscription";
  price_cents: number;
  currency: string;
  billing_interval: "one_time" | "month" | "year";
  duration_days: number | null;
  target: "job" | "profile" | null;
  trial_days: number | null;
  is_active: boolean;
  entitlements: Record<string, unknown>;
};
export type Catalog = {
  enabled: boolean;
  currency: string;
  prices_include_vat: boolean;
  /** Stripe Tax on: VAT is worked out at checkout. Off: prices are final amounts. */
  tax_calculated?: boolean;
  items: CatalogItem[];
};

export const EMPTY_CATALOG: Catalog = { enabled: false, currency: "eur", prices_include_vat: true, items: [] };

export function formatPrice(cents: number, currency = "eur"): string {
  const whole = cents % 100 === 0;
  return new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

export function priceLabel(item: Pick<CatalogItem, "price_cents" | "currency" | "billing_interval">): string {
  const price = formatPrice(item.price_cents, item.currency);
  if (item.billing_interval === "month") return `${price} / month`;
  if (item.billing_interval === "year") return `${price} / year`;
  return `${price} one-off`;
}

/** Labels every paid placement shows; organic results never carry them. */
export const PROMOTION_LABELS: Record<string, string> = {
  featured: "Featured",
  urgent: "Urgent",
  sponsored: "Sponsored",
  promoted: "Promoted",
};

/** Server-side: the live catalogue, or "coming soon" with no items if the API is unreachable. */
export async function fetchCatalog(): Promise<Catalog> {
  try {
    const res = await fetch(`${API_URL}/api/v1/billing/catalog`, { next: { revalidate: 300 } });
    if (!res.ok) return EMPTY_CATALOG;
    return (await res.json()) as Catalog;
  } catch {
    return EMPTY_CATALOG;
  }
}
