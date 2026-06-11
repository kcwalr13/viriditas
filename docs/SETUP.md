# Viriditas — Zero-to-Running Setup

**Purpose:** take a fresh clone to a working app — local dev and production — including the
Supabase project, schema, storage, Edge Functions, secrets, and Vercel. If you already have
access to the existing Supabase project, you only need steps 1, 7, and 8.

## Prerequisites

- **Node.js 18.18+** (20+ recommended — Next.js 15's supported range is
  `^18.18.0 || ^19.8.0 || >= 20.0.0`) and npm
- **Supabase account** + [Supabase CLI](https://supabase.com/docs/guides/cli) (for Edge
  Function deploys and secrets)
- **Anthropic API key** (the AI features call Claude)
- **Vercel account** (production deploys only; local dev doesn't need it)

## 1. Clone and install

```bash
git clone https://github.com/kcwalr13/viriditas.git
cd viriditas
npm install
```

## 2. Create the Supabase project

1. Create a new project at [supabase.com/dashboard](https://supabase.com/dashboard).
2. Note two values from **Settings → API**: the **Project URL** and the **anon public key**.

### Database schema

Open **SQL Editor** and run, in order:

1. The **fresh-project baseline** from [DATABASE.md](DATABASE.md) (core tables + RLS).
2. The **`diagnoses`, `propagations`, `care_recommendations`, `diagnosis_sessions`,
   `species_profile_flags`, and `push_subscriptions`** blocks from the same file's
   Tables section.

> The baseline DDL is reconstructed from the documented schema (the original production DDL
> was never committed) — see the provenance caveat at the top of DATABASE.md.

### Storage

1. **Storage → New bucket** → name it exactly **`plant-photos`**.
2. Make it a **public** bucket (the app and Edge Functions read photos via public URLs).
3. Photos upload from the browser to paths like `{userId}/{plantId}/{timestamp}.jpg`.
   (The exact storage policies used in production aren't recorded in the repo — at minimum,
   authenticated users need insert/delete on their own paths; see the TODO in DATABASE.md.)

### Auth settings

- Email/password auth is the only method used.
- The production project currently has **email confirmation disabled** for development
  convenience. Decide deliberately for a new project — and re-enable it before exposing the
  app to real users.

## 3. Deploy the Edge Functions

```bash
supabase login
supabase link --project-ref <your-project-ref>

supabase functions deploy analyze-plant --no-verify-jwt
supabase functions deploy fetch-species-info --no-verify-jwt
supabase functions deploy identify-species --no-verify-jwt
supabase functions deploy suggest-species --no-verify-jwt
supabase functions deploy diagnose-plant --no-verify-jwt
supabase functions deploy send-care-push --no-verify-jwt
```

`--no-verify-jwt` is required — the five AI functions validate the user token themselves,
and `send-care-push` has no user at all (it's invoked by pg_cron and authenticates the
caller with a `CRON_SECRET` header — see [EDGE-FUNCTIONS.md](EDGE-FUNCTIONS.md)).

## 4. Set the Edge Function secrets

```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
# Claude is the sole provider (Gemini + AI_PROVIDER retired in v1.8.0) —
# no other AI secrets are needed.
```

For **Care reminders** (web push, v1.9.0), also generate a VAPID key pair and a cron
secret. Run these locally and paste the values — **never commit or print the private key
anywhere else**:

```bash
npx web-push generate-vapid-keys   # prints a Public Key and a Private Key
openssl rand -hex 32               # a strong random value for CRON_SECRET

supabase secrets set \
  VAPID_PUBLIC_KEY=<public key from above> \
  VAPID_PRIVATE_KEY=<private key from above> \
  VAPID_SUBJECT=mailto:kcwalr13@gmail.com \
  CRON_SECRET=<random value from above>
```

Redeploy the functions after changing any secret.

## 5. Care reminders — schedule the daily push (manual SQL)

`send-care-push` is invoked by **pg_cron + pg_net inside Supabase** (spec decision #4),
not by the app. Both extensions are enabled in the production project (pg_cron 1.6.4,
pg_net 0.20.0, verified 2026-06-11); on a fresh project enable them under
**Database → Extensions** first (or with the `create extension` lines below).

Run this **once** in the SQL Editor, substituting your project ref and the same
`CRON_SECRET` value you set in step 4:

```sql
-- Fresh project only — production already has both enabled:
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Daily care digest. pg_cron runs in UTC and does NOT follow daylight saving:
-- 13:00 UTC = 9 am EDT (summer) / 8 am EST (winter). If the winter 8 am send
-- bothers you, reschedule to '0 14 * * *' in November.
select cron.schedule(
  'send-care-push-daily',
  '0 13 * * *',
  $$
  select net.http_post(
    url     := 'https://<PROJECT-REF>.supabase.co/functions/v1/send-care-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', '<CRON_SECRET>'
    ),
    body    := '{}'::jsonb
  );
  $$
);
```

Useful management queries:

```sql
select jobid, jobname, schedule, active from cron.job;          -- verify it's scheduled
select * from cron.job_run_details order by start_time desc limit 5;  -- recent runs
select cron.unschedule('send-care-push-daily');                 -- remove it
```

> **Note:** the cron job's SQL — including the `CRON_SECRET` value — is stored in plain
> text in the `cron.job` table, readable by anyone with database access. For this
> single-developer project that's acceptable; rotate the secret (re-set it in step 4,
> redeploy, unschedule + reschedule) if it ever leaks.

To test the function without waiting for 9 am (a real push arrives only if a subscribed
user actually has something due):

```bash
curl -i -X POST 'https://<PROJECT-REF>.supabase.co/functions/v1/send-care-push' \
  -H 'Content-Type: application/json' \
  -H 'x-cron-secret: <CRON_SECRET>' \
  -d '{}'
```

## 6. (Production) Vercel

1. Import the GitHub repo into Vercel.
2. **Settings → Build and Deployment:** Framework Preset **Next.js**; leave Output Directory
   at the **default**. (Both were once misconfigured Expo leftovers that broke the site.)
3. **Settings → Environment Variables:** add `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (the VAPID
   **public** key from step 4 — it's safe to expose; the private key stays in
   Supabase secrets).
4. Every push to `main` now deploys automatically. **Check the deployment actually succeeded
   in the Vercel dashboard after pushing** — a broken build fails silently from git's point
   of view.

The build command (`package.json`) is `node scripts/patch-ua-parser.js && next build`; the
patch step fixes a `ua-parser-js` crash in Vercel's Edge Runtime and re-runs on every build
on purpose.

## 7. Local environment

Create `.env.local` in the project root:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_VAPID_PUBLIC_KEY=your-vapid-public-key
```

AI keys and the VAPID **private** key never go here — they live only in Supabase secrets.
Restart `npm run dev` after any change to `.env.local`.

## 8. Run and verify

```bash
npm run dev
```

Open http://localhost:3000 and walk through the smoke test:

1. **Sign up** → you should land on the Today screen.
2. **Add a plant** (Add Plant wizard; try a photo — step 1 should auto-identify the species,
   which proves Edge Function auth + secrets are wired).
3. **Upload a photo** on Plant Detail, then **Analyze** — a health card with a 1–5 score
   should appear (proves `analyze-plant` + the storage bucket).
4. Open **Explore** and search a plant name — a suggestion grid should appear
   (proves `suggest-species`), and selecting one loads a care profile
   (proves `fetch-species-info` + the `species_profiles` table).
5. Log **water** from Today or Plants — a toast should confirm and the task should clear.
6. *(If you set up push in steps 4–5)* **Me → Care reminders → Turn on for this device** —
   the browser asks for notification permission, then the card shows "On · this device"
   and a row appears in `push_subscriptions`. The next 9 am digest will arrive only if
   something is actually due (quiet days send nothing).

If step 2–4 fail with 401s, the function wasn't deployed with a valid session being passed —
make sure you're signed in and the functions were deployed from step 3. If they fail with
500s, check `supabase functions logs <name>` (usually a missing secret).
