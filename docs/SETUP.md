# Viriditas — Zero-to-Running Setup

**Purpose:** take a fresh clone to a working app — local dev and production — including the
Supabase project, schema, storage, Edge Functions, secrets, and Vercel. If you already have
access to the existing Supabase project, you only need steps 1, 6, and 7.

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
2. The **`diagnoses` and `propagations`** blocks from the same file.

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
```

`--no-verify-jwt` is required — the functions validate the user token themselves (see
[EDGE-FUNCTIONS.md](EDGE-FUNCTIONS.md)).

## 4. Set the Edge Function secrets

```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
# Claude is the sole provider (Gemini + AI_PROVIDER retired in v1.8.0) —
# no other AI secrets are needed.
```

Redeploy the functions after changing any secret.

## 5. (Production) Vercel

1. Import the GitHub repo into Vercel.
2. **Settings → Build and Deployment:** Framework Preset **Next.js**; leave Output Directory
   at the **default**. (Both were once misconfigured Expo leftovers that broke the site.)
3. **Settings → Environment Variables:** add `NEXT_PUBLIC_SUPABASE_URL` and
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
4. Every push to `main` now deploys automatically. **Check the deployment actually succeeded
   in the Vercel dashboard after pushing** — a broken build fails silently from git's point
   of view.

The build command (`package.json`) is `node scripts/patch-ua-parser.js && next build`; the
patch step fixes a `ua-parser-js` crash in Vercel's Edge Runtime and re-runs on every build
on purpose.

## 6. Local environment

Create `.env.local` in the project root:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

AI keys never go here — they live only in Supabase secrets. Restart `npm run dev` after any
change to `.env.local`.

## 7. Run and verify

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

If step 2–4 fail with 401s, the function wasn't deployed with a valid session being passed —
make sure you're signed in and the functions were deployed from step 3. If they fail with
500s, check `supabase functions logs <name>` (usually a missing secret).
