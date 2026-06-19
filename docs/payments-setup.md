# Payments Setup — Stripe & RevenueCat

How to configure the two payment processors and their dashboards. The *why* and
the runtime behaviour live in `technical-decisions.md` → "Subscriptions /
Entitlements"; this file is the dashboard/env runbook that can't be read off the
code.

Recap of the model: one `entitlements` row per Supabase user is the **single
source of truth**. Two verified webhooks write it — **Stripe** for web, **RevenueCat**
for mobile — each keyed to the Supabase user id. Clients only read access via
`GET /api/subscription`. Plans: €9.99/month, €99.99/year, 7-day free trial
(`TRIAL_DAYS` in `src/lib/subscription.ts`).

Production host is `https://app.volnar.nl` (the bundled iOS app hardcodes this as
its API origin — `scripts/build-native.mjs`). Use that host in the webhook URLs
below.

## Where env vars live

Server-side vars (everything **not** `NEXT_PUBLIC_*`) go in **Vercel → the Volnar
project → Settings → Environment Variables**, scoped per environment
(Production / Preview / Development). `NEXT_PUBLIC_*` vars are inlined at build
time. Locally, everything goes in `.env.local` (gitignored). Every name is listed
in `.env.example`. **Env changes only take effect on the next deployment** —
redeploy after editing.

| Var | Where | Purpose |
|---|---|---|
| `STRIPE_SECRET_KEY` | Vercel (server) | Stripe API calls (checkout, portal, cancel, customer delete) |
| `STRIPE_WEBHOOK_SECRET` | Vercel (server) | Verifies the `Stripe-Signature` on `/api/webhooks/stripe` |
| `STRIPE_PRICE_MONTHLY` / `STRIPE_PRICE_ANNUAL` | Vercel (server) | Stripe Price IDs the checkout maps the plan to |
| `NEXT_PUBLIC_REVENUECAT_IOS_KEY` | Build-time (public) | RevenueCat **public** iOS SDK key used by `configure()` |
| `NEXT_PUBLIC_REVENUECAT_ENTITLEMENT_ID` | Build-time (public) | Entitlement id checked on-device (default `premium`) |
| `REVENUECAT_WEBHOOK_AUTH` | Vercel (server) | Shared secret matched against the `Authorization` header on `/api/webhooks/revenuecat` |
| `REVENUECAT_MONTHLY_PRODUCT_ID` / `REVENUECAT_ANNUAL_PRODUCT_ID` | Vercel (server) | Maps a store product to monthly/annual server-side |
| `REVENUECAT_ALLOW_SANDBOX` | Vercel (server) | `true` **only** on staging/dev to accept SANDBOX events; never Production |
| `REVENUECAT_SECRET_API_KEY` | Vercel (server) | Optional **secret** key; enables RevenueCat-side customer deletion on account deletion |

> ⚠️ Never put a `_SECRET_` or webhook key in a `NEXT_PUBLIC_*` var — those ship
> in the client bundle.

## Stripe (web)

1. **Product & prices.** Create one Product ("Volnar") with two recurring Prices:
   monthly €9.99 and annual €99.99. Copy each Price ID (`price_…`) into
   `STRIPE_PRICE_MONTHLY` / `STRIPE_PRICE_ANNUAL`. The plan→price mapping is
   `stripePriceId()` in `src/lib/stripe.ts`; no trial is configured on the Price —
   the 7-day trial is applied at checkout via `trial_period_days: TRIAL_DAYS`
   (`src/app/api/checkout/route.ts`), and **only when no entitlement row exists
   yet** (one trial per account).
2. **API key.** Put the secret key in `STRIPE_SECRET_KEY`. The code does not pin an
   `apiVersion` — it uses the SDK's bundled version so types and payloads agree
   (`src/lib/stripe.ts`).
3. **Webhook.** Add an endpoint → `https://app.volnar.nl/api/webhooks/stripe`,
   subscribed to: `checkout.session.completed`, `customer.subscription.created`,
   `customer.subscription.updated`, `customer.subscription.deleted`. Copy the
   endpoint's **Signing secret** into `STRIPE_WEBHOOK_SECRET`. Other event types
   are intentionally ignored.
4. **Billing portal.** Enable the Customer Portal (cancel, update card, switch
   plan). The Profile "Manage subscription" → `POST /api/billing-portal` opens it
   for web subscribers.

The checkout stamps `client_reference_id` + `subscription_data.metadata.supabase_user_id`
(and customer metadata) so the webhook maps the purchase to the account.

## RevenueCat + App Store Connect (iOS)

### App Store Connect
1. Create an **auto-renewable subscription group** with two products:
   `nl.volnar.monthly` and `nl.volnar.annual` (must match the bundle id
   `nl.volnar.app`).
2. Add a **7-day introductory free trial** offer to each (matches the web trial).
3. Fill in localized display names, review screenshot, and the agreements
   (Paid Apps) — products stay "Waiting for Review" until the app is submitted.
4. Create **Sandbox testers** under Users and Access → Sandbox (see testing below).

### RevenueCat dashboard
1. Add the iOS app (bundle `nl.volnar.app`) with the App Store shared secret /
   in-app purchase key so RevenueCat can validate receipts.
2. **API keys** (Project settings → API keys):
   - the **public** Apple key → `NEXT_PUBLIC_REVENUECAT_IOS_KEY`
   - the **secret** key → `REVENUECAT_SECRET_API_KEY` (server, optional — only for
     customer deletion on account deletion)
3. **Entitlement** `premium` (or set `NEXT_PUBLIC_REVENUECAT_ENTITLEMENT_ID`) →
   attach both products to it.
4. **Offering** `default` with packages `$rc_monthly` and `$rc_annual` mapped to
   the two products. The paywall reads `current` offering's monthly/annual
   packages (`src/lib/native/purchases.ts`).
5. **Product mapping** → set `REVENUECAT_MONTHLY_PRODUCT_ID=nl.volnar.monthly` and
   `REVENUECAT_ANNUAL_PRODUCT_ID=nl.volnar.annual` (server-side fallback uses a
   name heuristic, but set these to be explicit).
6. **Webhook** (Project settings → Integrations → Webhooks) →
   `https://app.volnar.nl/api/webhooks/revenuecat`, with an **Authorization**
   header whose value equals `REVENUECAT_WEBHOOK_AUTH`. The route rejects any
   request whose header doesn't match.
7. **Transfer behaviour** (Restore Behavior): default "transfer to the new App
   User ID" is what the `TRANSFER` handling assumes (revokes the previous owner).

The SDK is configured with `appUserID` = Supabase user id, so every event maps to
an account. Identity transitions use `logIn`/`logOut`, never a second `configure()`.

## Sandbox testing (iOS)

Sandbox purchases hit the **same** webhook as production, so they're rejected
unless the server has `REVENUECAT_ALLOW_SANDBOX=true`. To test a real purchase
end-to-end:

1. Set `REVENUECAT_ALLOW_SANDBOX=true` on the Vercel environment the app calls
   (Production, since the bundled app hardcodes `app.volnar.nl`). **Remember to
   remove it before launch.**
2. On the device, sign into a sandbox tester: **Settings → Apps → App Store →
   (bottom) Sandbox Account**.
3. Buy in-app. Manage/cancel/change-plan a sandbox sub from the same
   **Settings → … → Sandbox Account → Manage** screen — *not* from
   apps.apple.com (that shows the device's real Apple ID, not the tester).

Things to expect in sandbox:
- **Accelerated renewals** — an annual sub renews ~hourly, monthly faster; a sub
  auto-renews ~6 times then stops on its own (good for testing `EXPIRATION`).
- **Shared Apple ID = shared subscription.** Two Volnar logins (two emails) backed
  by the **same** sandbox Apple ID can't both be active — the entitlement
  transfers between them (one subscription per group per Apple ID). For two
  simultaneous subscribers, use **two separate sandbox testers**, switching the
  Sandbox Account before each purchase.

## Account deletion & data

`DELETE /api/users/me` stops billing first, then erases data:
- deletes the `entitlements` row (explicit, plus FK cascade);
- cancels an active Stripe subscription and deletes the Stripe customer (PII);
- best-effort deletes the **RevenueCat customer** (`deleteRevenueCatCustomer`,
  gated on `REVENUECAT_SECRET_API_KEY` — no-ops if unset, 404 = already clean,
  5s timeout, errors swallowed to Sentry so deletion never blocks).

A live store subscription can only be cancelled by the user in their store
settings — the delete dialog warns them.

## Going-live checklist

- [ ] `REVENUECAT_ALLOW_SANDBOX` **removed/unset** on Production.
- [ ] Stripe in live mode: live `STRIPE_SECRET_KEY`, live Price IDs, live webhook
      endpoint + `STRIPE_WEBHOOK_SECRET`, Customer Portal enabled.
- [ ] RevenueCat: production iOS key in `NEXT_PUBLIC_REVENUECAT_IOS_KEY`, webhook
      `Authorization` = `REVENUECAT_WEBHOOK_AUTH`, entitlement + offering live.
- [ ] App Store Connect subscriptions + intro offers submitted with the app build.
- [ ] (Optional) `REVENUECAT_SECRET_API_KEY` set if you want RevenueCat-side
      customer deletion on account deletion.
- [ ] Redeploy after any env change.
