# Tempo

Tempo is a Hungarian-first appointment booking app by OneHorizon. The owner app opens on today's agenda; customers book without creating an account.

## Local setup

1. Install Node.js 20+ and pnpm, then run `pnpm install`.
2. Copy `.env.example` to `.env.local` and fill the required keys below. Without external keys, the app runs in a local demo mode with sample data.
3. Apply the SQL files in `supabase/migrations/` in filename order in the Supabase SQL editor, or run `supabase db push` with the Supabase CLI linked to your project.
4. In Clerk, enable Organizations and organization slugs, configure the `org:admin` and `org:member` roles, and enable the Clerk integration for your Supabase project so Clerk session tokens are accepted by Supabase Auth. In Clerk's organization settings, allow personal accounts and turn off automatic creation of the first organization. Organization creation happens in Tempo's `/setup` flow after sign-up. Keep organization creation enabled for the application so that flow can create one on the user's behalf.
5. Run `pnpm dev`, open `http://localhost:3000`, and sign up. The local demo tenant is available at `http://editfodraszat.localhost:3000`.

Wildcard subdomains use the special `.localhost` loopback domain; no hosts-file entry is needed in current browsers. For local development set `APP_URL=http://localhost:3000`, `ROOT_DOMAIN=localhost:3000`, and `NEXT_PUBLIC_ROOT_DOMAIN=localhost:3000`. Open the owner app at `http://localhost:3000` and a tenant page at `http://editfodraszat.localhost:3000`. The app recognizes `.localhost` separately, even if the environment still has a tunnel or production root domain configured. API calls remain on the tenant host and carry the organization slug in their validated request data.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `APP_URL` | Canonical owner-app origin used in Stripe redirects, such as `http://localhost:3000`. |
| `ROOT_DOMAIN` | Root host suffix used to resolve tenant subdomains; include the port locally. |
| `NEXT_PUBLIC_ROOT_DOMAIN` | Root host displayed in the setup wizard. |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk browser key. |
| `CLERK_SECRET_KEY` | Clerk server key. |
| `CLERK_WEBHOOK_SIGNING_SECRET` | Signing secret for `/api/webhooks/clerk`. |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase publishable/anonymous key used with the Clerk session token. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only key for public booking, webhooks, scheduled email and trusted setup tasks. Never expose it to the browser. |
| `STRIPE_SECRET_KEY` | Stripe platform secret key. |
| `STRIPE_WEBHOOK_SECRET` | Signing secret for platform billing and appointment payment events at `/api/webhooks/stripe`. |
| `STRIPE_CONNECT_WEBHOOK_SECRET` | Signing secret for Connect account events at `/api/webhooks/stripe-connect`. |
| `STRIPE_ORG_PRICE_ID` | Stripe recurring Price ID for the configurable organization plan. |
| `STRIPE_TRIAL_DAYS` | Trial length for new organization subscriptions; defaults to 14. |
| `STRIPE_CONNECT_COUNTRY` | Connect account country; defaults to `HU`. |
| `RESEND_API_KEY` | Resend key for confirmation, reminder, cancellation and owner emails. |
| `EMAIL_FROM` | Verified sender, for example `Tempo <foglalas@example.com>`. |
| `CRON_SECRET` | Bearer secret required by the reminder endpoint. |

## Supabase

Apply migrations in order. Every tenant table has RLS policies based on Clerk's `org_id` claim. Owner and team requests use a Clerk session token; public routes use the service-role client only on the server, validate input with Zod, and apply request limits. Do not add public browser access to tenant tables.

The appointment exclusion constraint protects staff calendars in Postgres. A trigger serializes writes for each staff member so even a deliberately overlapped owner appointment blocks later customer bookings. Owner overlap confirmation goes through an authenticated server path. The SQL tests in `supabase/tests/` check that behavior and webhook claim idempotency; run them with `supabase test db` against a local Supabase stack.

## Stripe

Tempo uses Stripe Connect Express for business payouts. Express provides Stripe-hosted identity and payout onboarding, which keeps setup short for a solo business owner. Stripe Checkout sends appointment funds to the connected account. The platform's organization subscription is a separate Stripe Billing Checkout session; the active plan is configured by `STRIPE_ORG_PRICE_ID` rather than hard-coded in the app.

Use the Stripe CLI to forward both webhook families during development:

```sh
stripe listen --forward-to localhost:3000/api/webhooks/stripe --forward-connect-to localhost:3000/api/webhooks/stripe-connect
```

Copy the CLI's platform and Connect signing secrets into `STRIPE_WEBHOOK_SECRET` and `STRIPE_CONNECT_WEBHOOK_SECRET`. The webhook endpoints verify Stripe signatures and claim event IDs atomically in Postgres before processing. A paid appointment changes to paid/confirmed only after a verified Stripe webhook.

Payment methods use the `PaymentProvider` interface. To add a provider, implement `src/lib/payments/types.ts` and register it in `src/lib/payments/index.ts`; booking routes should continue to depend on the interface. SimplePay is an intentionally unimplemented extension point.

## Email reminders

`POST /api/cron/reminders` sends due reminders for confirmed appointments. Schedule it every 15 minutes with your hosting provider's cron service and send `Authorization: Bearer $CRON_SECRET`. Notification claims are stored in `notification_log` so repeated runs do not resend successful mail. Email delivery is implemented with Resend behind a provider interface that also leaves an optional SMS method for a future adapter.

## Deployment

Set `ROOT_DOMAIN` to the product root domain and `APP_URL` to its HTTPS owner origin. Configure wildcard DNS (`*.example.com`) and add both the root domain and wildcard tenant domain (`*.example.com`) to the hosting provider. Add the root and wildcard domains to Clerk's allowed origins/redirect URLs. Configure Supabase's Clerk JWT verification and production environment variables in the hosting platform. Route both Stripe webhook endpoints to the deployed HTTPS URLs, and configure a scheduled POST to the reminder route.

Use the normal app build commands:

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```
