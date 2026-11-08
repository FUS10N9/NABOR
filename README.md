# Nabor

Need a hand? There's someone nearby.

Nabor is a hyperlocal marketplace where neighbours post everyday tasks, helpers apply, and the two people finish the work with a recorded payment. The same account can request help and offer it.

## Architecture

```text
Browser (React, Vite, Tailwind)
  ├─ Supabase Auth session, stored in the browser
  ├─ Supabase Storage for photos
  ├─ Supabase Realtime for messages and notifications
  └─ Express API for every state change
        └─ Postgres functions (security definer) enforce the rules
              └─ Supabase Postgres + PostGIS + row level security
```

The browser never receives the Supabase secret key. Task transitions, applications, reviews, and direct payment records go through SQL functions. Those functions check the signed-in user, age, blocks, and the allowed status change. Row level security still limits direct table reads: private profiles, exact addresses, messages, and payments are not public.

Exact meeting spots live in `task_private_locations`. The map uses a point shifted by about 80–150 metres and a neighbourhood label.

Cash and UPI are self-reported. Both people confirm before a direct payment is marked paid, and the screen says **Self-reported**. Razorpay or Cashfree payments are marked paid only after the server checks a checkout signature or a webhook. If those keys are empty, checkout stays unavailable instead of pretending a payment succeeded.

## Layout

```text
client/                 React application
server/                 Express API
shared/                 Safety checks and labels used by both
supabase/migrations/    Schema, functions, RLS, storage, realtime
```

## Setup

1. Copy `.env.example` to `.env` if you do not already have one.
2. In the Supabase SQL editor, run these files in order:
   - `supabase/migrations/20261106120000_schema.sql`
   - `supabase/migrations/20261106120100_functions.sql`
   - `supabase/migrations/20261106120200_marketplace.sql`
   - `supabase/migrations/20261106120300_social.sql`
   - `supabase/migrations/20261106120400_policies.sql`
   - `supabase/migrations/20261108174500_backfill_existing_users.sql`
3. In Supabase Auth, set the site URL to `http://localhost:5173` and add `http://localhost:5173/**` to the redirect URLs.
4. Install and start both processes:

```bash
npm run setup
npm run dev
```

The web app is at `http://localhost:5173`. The API is at `http://localhost:5000`.

To make an account an administrator after signup:

```sql
update public.users set role = 'admin' where email = 'you@example.com';
```

## Environment

| Variable | Where | Purpose |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Browser | Project URL, without `/rest/v1` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Browser | Publishable key only |
| `VITE_MAPBOX_ACCESS_TOKEN` | Browser | Map and place search. Restrict it by URL in Mapbox. |
| `VITE_API_URL` | Browser | API origin in production. Empty locally. |
| `SUPABASE_URL` | Server | Same project URL |
| `SUPABASE_PUBLISHABLE_KEY` | Server | Used to call the API as the signed-in user |
| `SUPABASE_SECRET_KEY` | Server | Admin and webhook updates. Never expose this. |
| `CLIENT_ORIGIN` | Server | Comma-separated allowed web origins |
| `RESEND_API_KEY` | Server | Optional email. Off unless a user enables email notifications. |
| `EMAIL_FROM` | Server | Verified sender. `onboarding@resend.dev` only delivers to the Resend account owner. |
| `RAZORPAY_KEY_ID` | Server | Public checkout key, returned to the browser only when configured |
| `RAZORPAY_KEY_SECRET` | Server | Order creation and checkout signature check |
| `RAZORPAY_WEBHOOK_SECRET` | Server | Webhook signature check |
| `CASHFREE_CLIENT_ID` | Server | Cashfree app id |
| `CASHFREE_CLIENT_SECRET` | Server | Cashfree secret |
| `CASHFREE_WEBHOOK_SECRET` | Server | Falls back to the client secret when empty |
| `CASHFREE_ENV` | Server | `sandbox` or `production` |

The Supabase URL in the client is normalised if it accidentally includes `/rest/v1`.

## What to try

1. Create two accounts and confirm both emails if confirmation is enabled.
2. Finish onboarding with a date of birth of 16 or older and a neighbourhood.
3. Post a task from one account.
4. From the other account, set the same area on Explore. The default radius is 1 km. Options are 500 m, 1 km, 3 km, and 5 km.
5. Apply, accept the application, send a message, mark the task started, submit completion, and confirm it.
6. Record a cash or UPI payment from each side. It stays pending until both confirm, and it is labelled self-reported.
7. After completion, each person can leave one review.
8. Open `/admin` only with an account whose role is `admin`.

An account under 16 can sign up but cannot post, apply, or enter the marketplace. Categories also carry a minimum age, so some tasks stay hidden from 16 and 17 year olds.

## Payments

Direct payments never become "verified by payment provider". Gateway rows start as `pending` with no verification flag. `/api/payments/verify/razorpay` checks the Razorpay signature on the server. Webhooks at `/api/payments/webhook/razorpay` and `/api/payments/webhook/cashfree` reject unsigned bodies. Refund events mark the row `refunded`.

Nabor does not hold a balance and does not claim escrow.

## Deployment

- Web and API: Vercel, with the project root set to the repository root, install command `npm run setup`, build command `npm run build --prefix client`, and output directory `client/dist`. The repository root is required because the client imports code from `shared/`. The Express API is served by a Vercel Function at `/api/*`. Configure `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_MAPBOX_ACCESS_TOKEN`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, and `CLIENT_ORIGIN` in the Vercel project. Leave `VITE_API_URL` empty when using the same Vercel project for the API.
- Optional separate API: Render, using `render.yaml`. Set `CLIENT_ORIGIN` to the Vercel URL and `VITE_API_URL` to the API origin.
- Database and auth: the same Supabase project. Run the migrations there before inviting people.

## Checks

```bash
npm test
npm run typecheck
```

## Security notes

Rotate the Supabase secret key, Resend key, and Mapbox token if they have been pasted into a chat or committed. The secret key and Resend key must stay in the server environment. Restrict the Mapbox token to your local and production URLs.
