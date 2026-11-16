# Billing (paid features on Stripe)

Paid features for members and employers, sold with Stripe Checkout and managed in the Stripe Customer
Portal. This is separate from marketplace money movement (escrow, Connect payouts), which stays off behind
`MARKETPLACE_PAYMENTS_ENABLED` and is out of scope here.

Code: `apps/api/app/domains/billing/` (catalogue, models, grants, placements, service, routers),
`apps/api/app/services/billing/stripe_gateway.py` (the only module that calls Stripe for billing),
`apps/api/app/scripts/stripe_sync.py`, migration `077_billing_catalog`. Web: `/pricing`
(`apps/web/src/app/pricing`), Settings > Billing and `#billing` (`apps/web/src/figma/rap_billing.tsx`).
Staff console: Billing & Revenue (`apps/admin/src/console/billing.tsx`).

## The switch

| Setting | Default | Effect |
|---|---|---|
| `BILLING_ENABLED` | `false` | Off: `/pricing` and Settings say "coming soon", checkout/portal/spend endpoints answer 404, placements are empty, billing webhooks are acknowledged but ignored, AI allowances and proposals are not metered by billing. Nothing is chargeable. |
| `STRIPE_SECRET_KEY` | unset | `sk_test_`/`rk_test_` always allowed. A live key (`sk_live_`/`rk_live_`) is refused unless `APP_ENV=production` **and** `BILLING_ENABLED=true`. |
| `STRIPE_WEBHOOK_SECRET` | unset | Signing secret of the endpoint below. Without it the webhook answers 404. |
| `STRIPE_PUBLISHABLE_KEY` | unset | Not needed by Checkout (hosted page); kept for later client-side use. |
| `BILLING_FREE_PROPOSALS_MONTHLY` | 20 | Free proposals on freelance projects per month. |
| `BILLING_SPONSORED_DEFAULT_CPC_CENTS` | 50 | Default max cost per click for sponsored jobs. |
| `BILLING_REFERRAL_CREDIT_CENTS` | 1000 | Give/get referral credit (Stripe customer balance). |
| `BILLING_MESSAGE_REFUND_DAYS` | 14 | A messaging credit comes back if there is no reply in this many days. |

Tests always mock Stripe (`apps/api/tests/test_billing_phase1.py`); never put a live key in a test or a
local `.env`. For a local manual run use a Stripe test-mode key and `stripe listen --forward-to
localhost:8000/api/v1/payments/webhooks/stripe`.

## Catalogue

Defined as data in `app/domains/billing/catalog.py`, seeded once into `plans` by migration
`077_billing_catalog` (existing slugs are never overwritten). After that the `plans` table is the source of
truth: staff change prices and availability in the console (Billing & Revenue > Prices). A price change
creates a new tax-inclusive Stripe Price at once when Stripe is configured (otherwise the sync script does);
existing subscribers keep their price until it is changed in Stripe.

| Slug | Price (EUR, incl. VAT) | Grants |
|---|---|---|
| `featured_job` | 49 one-off | Job pinned and labelled "Featured" for 30 days |
| `job_pack_5` / `job_pack_10` | 199 / 349 | 5 / 10 credits; each features a job for 30 days; credits expire after 12 months |
| `urgent_badge` | 19 | "Urgent" label on a job for 30 days |
| `social_boost` | 29 | Recorded and queued for staff (Purchases, "Mark done") |
| `sponsored_topup_50/100/250` | 50 / 100 / 250 | Prepaid pay-per-click balance (12 months) |
| `messaging_pack_10` / `_50` | 29 / 99 | Messaging credits (12 months); refunded without reply in 14 days |
| `hire` | 99 / month | Feature any own job while subscribed, applicant pipeline, featured company page |
| `hire_pro` | 299 / month | Hire + candidate search + 50 messaging credits a month |
| `candidate_database` | 149 / month | Candidate search only |
| `extra_seat` | 39 / month (quantity) | Team seats |
| `employer_branding` | 49 / month | Branding entitlement (cover video, testimonials, labelled hub highlight) |
| `premium_monthly` | 9 / month, 7-day trial once per member | 5x AI allowance, profile insights, Premium badge, priority applicant flag |
| `premium_yearly` | 79 / year | Same as Premium |
| `freelancer_plus` | 12 / month | Promoted profile, +80 proposals a month |
| `proposal_pack_20` / `_80` | 6 / 19 | Proposal credits (12 months) |
| `profile_boost` | 5 | "Promoted" placement in people search for 7 days |
| `ai_pack_5/10/25` | 5 / 10 / 25 | 200k / 450k / 1.2M AI tokens used after the monthly allowance (12 months) |
| `verified_badge` | 19, **disabled** | Listed as "not available yet" until a verification provider is chosen |

Free stays real: job search, viewing and applying, posting jobs, profiles, messaging connections, the
monthly AI allowance (`AI_FREE_MONTHLY_TOKENS`) and 20 freelance proposals a month never need payment.

## How it works

- **Checkout** (`POST /billing/checkout`): one Stripe Customer per member; Checkout Session with
  `automatic_tax`, required billing address, tax-id collection, promotion codes, terms-of-service consent and
  the immediate-performance / withdrawal text. If Stripe Tax is not active the session is retried without
  automatic tax (prices are tax-inclusive) and a warning goes to the `errors` Slack channel.
- **Portal** (`POST /billing/portal`): cancel, change plan, update card, download invoices.
- **Webhook**: the existing signed receiver `POST /api/v1/payments/webhooks/stripe` deduplicates by event id
  (`stripe_webhook_events`) and passes billing events to `billing/service.py`: `checkout.session.completed`
  / `expired`, `invoice.paid` (records invoices incl. PDF link), `invoice.payment_failed` (dunning email
  through the email outbox), `customer.subscription.created/updated/deleted` (status, period end, plan and
  quantity changes; grants follow), `charge.refunded` (full refund revokes the purchase's grants). Handlers
  are idempotent on their own as well (unique session/invoice ids; grants unique on `(source_ref, key)`).
- **Entitlements** (`entitlements` table, helper `billing/grants.py`): `has_entitlement`, `balance`,
  `consume`, monthly allowances + packs. Used by job labels (`promotions` on job responses), the
  Featured/Sponsored block (`/billing/placements/jobs`, also on the public hubs), badges, AI allowance
  (`services/ai/metering.py`), proposal credits (freelance applications only), messaging credits and
  candidate search.
- **Sponsored jobs**: campaign per job with daily budget and max CPC; `POST
  /billing/placements/sponsored/{id}/click` charges a click unless it is a bot user agent, the advertiser,
  a repeat by the same visitor that day (keyed hash, no IP stored) or over the daily budget; the campaign
  stops (`exhausted`) when the balance can't pay a click.
- **Messaging credits**: spent with `POST /billing/messages/spend`; Celery Beat `billing.refund_unanswered_messages`
  (daily 05:10 UTC) returns credits after 14 days without a reply (also runnable from the console API).
- **Referrals**: `GET /billing/referral` gives a code; `POST /billing/referral/claim` before the first
  purchase; on the referred member's first paid checkout both get €10 customer-balance credit.
- **Account deletion** (`auth/retention.py`): live subscriptions are cancelled at period end in Stripe first
  (a Stripe failure refuses the deletion with 503); entitlements go with the account; purchases and invoices
  are kept with `user_id` cleared for accounting. The data export includes purchases, invoices,
  entitlements, campaigns, credit usage and referrals without provider ids.
- **Revenue** (`GET /admin/billing/revenue`): MRR, trials, 30-day churn, one-off revenue, subscription
  invoices and ad spend, computed only from rows written by Stripe webhooks.

## Owner go-live checklist

1. Stripe account: confirm it is activated (done: sole trader, bank and tax id). In Settings > Public
   details set the public business name to **Remote AI Platform**, support email
   `contact@remoteaiplatform.com`, and the Terms of Service URL `https://remoteaiplatform.com/terms`
   (Checkout's terms consent needs it).
2. Stripe Tax: Settings > Tax > activate, set the origin address, add registrations where you must collect
   (your home country; the EU OSS registration once EU B2C sales need it). Until active, checkout falls
   back to no automatic tax and alerts Slack.
3. Customer Portal: Settings > Billing > Customer portal: allow cancel (at period end), plan switching
   between the subscription products, payment method updates and invoice history; save.
4. Infisical (project secrets, production environment): `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`,
   `STRIPE_WEBHOOK_SECRET`, and `BILLING_ENABLED=true` when you are ready. Keep `PAYMENT_PROVIDER=sandbox`
   and `MARKETPLACE_PAYMENTS_ENABLED=false`. Render `/opt/rap/.env` (`ops/vm/render-env.sh`).
5. Deploy, run `alembic upgrade head` (seeds the catalogue).
6. Products and webhook: on the VM, with the production env loaded and `BILLING_ENABLED=true`, run
   `python -m app.scripts.stripe_sync --dry-run`, then `python -m app.scripts.stripe_sync`. It creates
   products `rap_<slug>`, tax-inclusive prices with lookup key `rap_<slug>`, and the webhook endpoint
   `https://api.remoteaiplatform.com/api/v1/payments/webhooks/stripe` with the needed events. It prints ids
   only. If it created the endpoint, reveal its signing secret in the Stripe dashboard, put it in Infisical
   as `STRIPE_WEBHOOK_SECRET`, re-render the env and restart the API.
7. Flip `BILLING_ENABLED=true` (if not already) and restart. Check `/pricing` shows Buy buttons.
8. Smoke test with a real card on the cheapest item (`profile_boost` or `ai_pack_5`), check Settings >
   Billing and the console (Purchases, Revenue), then refund it from the console.
9. Turn on Stripe emails for successful payments and refunds (Settings > Customer emails).

To turn billing off again set `BILLING_ENABLED=false` and restart: nothing new can be bought; existing
subscriptions keep billing in Stripe until cancelled there.
