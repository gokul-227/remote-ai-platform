# Billing (paid features on Stripe)

Paid features for members and employers, sold with Stripe Checkout and managed in the Stripe Customer
Portal. This is separate from marketplace money movement (escrow, Connect payouts), which stays off behind
`MARKETPLACE_PAYMENTS_ENABLED` and is out of scope here.

Code: `apps/api/app/domains/billing/` (catalogue, models, grants, placements, service, routers),
`apps/api/app/services/billing/stripe_gateway.py` (the only module that calls Stripe for billing),
`apps/api/app/scripts/stripe_sync.py`, migration `078_billing_catalog`. Web: `/pricing`
(`apps/web/src/app/pricing`), Settings > Billing and `#billing` (`apps/web/src/figma/rap_billing.tsx`).
Staff console: Billing & Revenue (`apps/admin/src/console/billing.tsx`).

## The switch

| Setting | Default | Effect |
|---|---|---|
| `BILLING_ENABLED` | `false` | Off: `/pricing` and Settings say "coming soon", checkout/portal/spend endpoints answer 404, placements are empty, billing webhooks are acknowledged but ignored, AI allowances and proposals are not metered by billing. Nothing is chargeable. |
| `STRIPE_SECRET_KEY` | unset | `sk_test_`/`rk_test_` always allowed. A live key (`sk_live_`/`rk_live_`) is refused unless `APP_ENV=production` **and** `BILLING_ENABLED=true`. |
| `STRIPE_WEBHOOK_SECRET` | unset | Signing secret of the endpoint below. Without it the webhook answers 404. |
| `STRIPE_PUBLISHABLE_KEY` | unset | Not needed by Checkout (hosted page); kept for later client-side use. |
| `STRIPE_TAX_ENABLED` | `false` | Off: checkout requests no tax (no `automatic_tax`, no tax-id collection, no retry, no Slack warning); prices are final gross amounts and invoices carry no VAT line. On: Stripe Tax with the fallback described below. |
| `BILLING_FREE_TEAM_SEATS` | 3 | Organisation members (besides the owner) included free; Extra team seat adds one each. |
| `BILLING_REFERRAL_MAX_ATTEMPTS` | 8 | Retries of a failed referral credit before it stops and alerts. |
| `BILLING_FREE_PROPOSALS_MONTHLY` | 20 | Free proposals on freelance projects per month. |
| `BILLING_SPONSORED_DEFAULT_CPC_CENTS` | 50 | Default max cost per click for sponsored jobs. |
| `BILLING_REFERRAL_CREDIT_CENTS` | 1000 | Give/get referral credit (Stripe customer balance). |
| `BILLING_MESSAGE_REFUND_DAYS` | 14 | A messaging credit comes back if there is no reply in this many days. |

Tests always mock Stripe (`apps/api/tests/test_billing_phase1.py`); never put a live key in a test or a
local `.env`. For a local manual run use a Stripe test-mode key and `stripe listen --forward-to
localhost:8000/api/v1/payments/webhooks/stripe`.

## Catalogue

Defined as data in `app/domains/billing/catalog.py`, seeded once into `plans` by migration
`078_billing_catalog` (existing slugs are never overwritten). After that the `plans` table is the source of
truth: staff change prices and availability in the console (Billing & Revenue > Prices). A price change
creates a new tax-inclusive Stripe Price at once when Stripe is configured (otherwise the sync script does);
existing subscribers keep their price until it is changed in Stripe.

| Slug | Price (EUR, final amount) | Grants |
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

- **Checkout** (`POST /billing/checkout`): one Stripe Customer per member; Checkout Session with required
  billing address, promotion codes, terms-of-service consent and the immediate-performance / withdrawal text.
  With `STRIPE_TAX_ENABLED=true` it also sets `automatic_tax` and tax-id collection; if Stripe Tax is not active
  the session is retried without them (prices are tax-inclusive) and a warning goes to the `errors` Slack
  channel. With it off (the default) no tax is requested at all.
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
- **Referrals**: Settings > Billing shows the member's code and share link (`/#billing?ref=CODE`, which
  pre-fills the code box) and lets a member enter a code before their first purchase. On the referred
  member's first paid checkout both get €10 customer-balance credit, each side once; a Stripe failure is
  retried by Celery Beat `billing.retry_referral_credits` (every 10 minutes, exponential backoff capped at a
  day, up to `BILLING_REFERRAL_MAX_ATTEMPTS`, then a Slack alert).
- **Team seats**: while billing is on, inviting to an organisation beyond `BILLING_FREE_TEAM_SEATS` plus the
  owner's Extra team seats is refused (402) with an upgrade prompt; `GET /organisations/{id}/seats` drives the
  "Team seats: used of included" note on the team screen. Pending invites count; re-inviting does not.
- **Employer branding**: with the entitlement, Settings > Billing has an editor for an http(s) cover video
  link and testimonials (`/billing/branding/me...`); the company page shows them only while entitled.
- **Composer messaging credits**: an employer's first message to a candidate they are not connected with
  spends one credit in `POST /conversations/{id}/messages` (402 when none are left); the composer shows the
  balance (`GET /billing/messages/quote`). Replies, connections and non-employers are free.
- **Open to opportunities** is opt-in (migration `079_billing_followups` set it off for everyone, since there
  was no record of deliberate opt-ins). Profiles show a one-time banner inviting members to turn it on. It
  governs only the paid candidate search: free job matching, ranked candidates, task offers and the member
  directory neither filter on it nor score members lower without it.
- **Account deletion** (`auth/retention.py`): live subscriptions are cancelled at period end in Stripe first
  (a Stripe failure refuses the deletion with 503); entitlements go with the account; purchases and invoices
  are kept with `user_id` cleared for accounting. The data export includes purchases, invoices,
  entitlements, campaigns, credit usage and referrals without provider ids.
- **Revenue** (`GET /admin/billing/revenue`): MRR, trials, 30-day churn, one-off revenue, subscription
  invoices and ad spend, computed only from rows written by Stripe webhooks.

## Owner go-live checklist

1. Stripe account: activated, and public details are done (trading name Remote AI Platform, support email
   `contact@remoteaiplatform.com`, website, privacy and terms URLs). Our pages show only that contact
   address, never the owner's name or address; Stripe shows the legal name on receipts.
2. Tax: **pending** the owner's tax adviser (Steuerberater). Until decided, keep `STRIPE_TAX_ENABLED=false`:
   prices are final gross amounts and invoices carry no VAT line. If VAT applies, activate Stripe Tax
   (origin address, registrations, OSS where needed) and set `STRIPE_TAX_ENABLED=true`. If the small-business
   rule (Kleinunternehmer, §19 UStG) applies, invoices need a note that no VAT is charged; that would be a
   future toggle adding the note to Checkout invoices (not built yet).
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
