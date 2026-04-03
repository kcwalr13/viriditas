# Viriditas — Project Instructions for Claude

## What This App Is
Viriditas is a houseplant care guide, companion, and plant registry app. Users can photograph
plants for AI-powered health analysis and species identification, register and track individual
plants over time (care logs, health history, photo records), and access expert care guidance.
The goal is for each registered plant to have a rich, comprehensive profile — combining
encyclopedic species knowledge with the user's personal observations, photos, and care history.

Viriditas is a **web app** (not a native app). It runs in the browser on desktop, Android,
and iOS. Users can add it to their home screen on any device for a full-screen, app-like
experience (Progressive Web App).

## The Developer
Kyle is a beginner developer who relies on Claude to write most of the code. Always:
- Explain decisions and tradeoffs before writing code
- Anticipate problems the user may not know to ask about
- Give explicit step-by-step instructions for any manual setup steps
- Add comments to code explaining what each part does
- Specify filenames and where they belong in the project structure
- Build incrementally — get something working first, then improve it

## Tech Stack
| Layer | Tool |
|---|---|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS |
| Auth | Supabase Auth via `@supabase/ssr` (cookie-based, SSR-safe) |
| Database | Supabase (PostgreSQL) |
| File/Photo Storage | Supabase Storage |
| AI Integration | Supabase Edge Functions → Claude API (`claude-haiku-4-5-20251001`; Gemini also supported via `AI_PROVIDER` secret) |
| Deployment | Vercel (auto-deploys on every push to main) |

**Language:** TypeScript throughout. No `any` types.

## Project Structure
```
viriditas/
  app/
    layout.tsx              # Root layout: metadata, global styles, PWA viewport
    globals.css             # Tailwind base import
    (auth)/
      layout.tsx            # Unauthenticated layout (centered card, green brand header)
      sign-in/
        page.tsx            # Sign in form
      sign-up/
        page.tsx            # Sign up form
    (app)/
      layout.tsx            # Protected layout: auth guard + bottom nav bar
      page.tsx              # My Plants screen — Server Component (fetches + enriches data)
      MyPlantsClient.tsx    # My Plants screen — Client Component (renders grid, banners, streak)
      add-plant/
        page.tsx            # Add Plant form
      plant/
        [id]/
          page.tsx          # Plant Detail screen (Client Component — all data fetched client-side)
      settings/
        page.tsx            # Settings: account info, sign out, about
  components/               # (currently empty — UI is inline in page files)
  lib/
    supabase/
      client.ts             # Browser Supabase client (for Client Components)
      server.ts             # Server Supabase client (for Server Components / Route Handlers)
    types.ts                # Shared TypeScript types (Plant, PlantPhoto, CareLog, etc.)
    utils.ts                # Helpers: formatDate, computeWateringStatus, computeStreak, etc.
    notifications.ts        # Stub — push notifications not supported on web; no-op exports
  supabase/
    functions/
      analyze-plant/
        index.ts            # Edge Function: AI plant analysis (provider-swappable)
      fetch-species-info/
        index.ts            # Edge Function: AI species profile fetch (provider-swappable)
  scripts/
    patch-ua-parser.js      # Prebuild script: patches __dirname out of ua-parser-js for Edge Runtime
  public/
    icon.png                # App icon (plant sprout on brand green)
    manifest.json           # PWA manifest
  middleware.ts             # Auth-gates all (app) routes; refreshes session cookies
  next.config.ts            # Supabase Storage image domain allowlist
  tailwind.config.ts        # Brand color palette
  eslint.config.mjs
  .env.local                # Never commit — NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
```

## What Has Been Built
- [x] Next.js 15 project initialized with TypeScript, Tailwind CSS, App Router
- [x] `@supabase/ssr` installed — cookie-based auth, works in Server Components and Client Components
- [x] `lib/supabase/client.ts` — browser client (for Client Components)
- [x] `lib/supabase/server.ts` — server client (reads cookies, for Server Components)
- [x] `middleware.ts` — protects all `/(app)` routes; redirects to sign-in if no session
- [x] `app/(auth)/sign-in/page.tsx` — sign in form with email/password
- [x] `app/(auth)/sign-up/page.tsx` — sign up form with email/password
- [x] `app/(app)/layout.tsx` — protected layout with bottom nav (My Plants / Settings)
- [x] `app/(app)/page.tsx` + `MyPlantsClient.tsx` — My Plants: 2-col photo grid, urgency banners, care streak chip
- [x] `app/(app)/add-plant/page.tsx` — Add Plant form (nickname, species, location, date, notes)
- [x] `app/(app)/plant/[id]/page.tsx` — Plant Detail: Overview / History / Species tabs, photo upload, AI analysis, care logging, edit/delete, watering reminder
- [x] `app/(app)/settings/page.tsx` — Settings: email, sign out, app version
- [x] `lib/types.ts` — Plant, PlantPhoto, CareLog, AnalysisResult, SpeciesProfile types
- [x] `lib/utils.ts` — formatDate(), formatTimestamp(), computeWateringStatus(), computeStreak(), toLocalDateStr(), CARE_LOG_LABELS, CARE_LOG_ICONS, URGENCY_ORDER
- [x] Supabase database schema, RLS policies, and Edge Functions (see schema section below)
- [x] `scripts/patch-ua-parser.js` — prebuild patch so Next.js middleware works in Vercel Edge Runtime
- [x] Vercel deployment — auto-deploys on push to main; framework preset: Next.js; output: default

## What Comes Next
See ROADMAP.md for the full feature breakdown and phase plan.

## Plant Profile Architecture
Each plant has two layers of information:

**Layer 1 — Personal data (user-specific, evolves over time):**
- Nickname, notes, location, pot size, acquisition date, last repotted date, photos
- AI health analyses and species identifications
- Care logs (watered, fertilized, note, repotted, pruned, misted, pest_treatment, moved)
- Watering reminder interval (stored in DB, shown as urgency badge in the grid)

**Layer 2 — Species reference data (encyclopedic, fetched once and cached permanently):**
- Generated by `fetch-species-info` Edge Function using the Claude API when a species is identified
- Stored in `species_profiles` table, keyed by species name, shared across all users
- Covers: light, watering, humidity, soil, temperature, toxicity, common problems, growth habits, propagation
- Fetched at most once per species globally — cached instantly for any subsequent user with the same plant
- Refreshable by the user on demand
- Passed as context to `analyze-plant` so health analyses are species-aware

## Coding Conventions
- Use TypeScript (`.tsx` for files with JSX, `.ts` for pure logic); no `any` types
- Use Tailwind CSS utility classes for all styling — no inline style objects, no CSS files
- Custom colors: `text-brand` / `bg-brand` = `#2d6a4f`; `bg-brand-light` = `#40916c`; `bg-brand-bg` = `#f0faf4` (defined in tailwind.config.ts)
- Mark interactive components `'use client'` at the top; leave layouts and data-fetching pages as Server Components where possible
- Import Supabase browser client via `import { createClient } from '@/lib/supabase/client'`
- Import Supabase server client via `import { createClient } from '@/lib/supabase/server'`
- Import types via `import type { Plant } from '@/lib/types'`
- Keep pages in `app/`, reusable components in `components/`, shared logic in `lib/`
- Never put API keys or secrets in app code — use `.env.local` and Supabase Edge Functions
- Use `npm install` for all packages (no Expo-specific install commands)
- Dynamic routes use `app/[param]/page.tsx` pattern
- After any mutation in a Client Component, call `router.refresh()` to re-run Server Component data fetching

## Supabase Database Schema

**Tables:**

`plants`
- id, user_id, nickname, species (nullable), location (nullable), pot_size (nullable)
- acquired_date (nullable, YYYY-MM-DD), last_repotted_date (nullable, YYYY-MM-DD)
- notes (nullable), watering_interval_days (nullable int), created_at

`photos`
- id, plant_id, user_id, storage_path, created_at

`care_logs`
- id, plant_id, user_id, type (CHECK constraint — see below), notes (nullable), logged_at

`analysis_results`
- id, plant_id, user_id, photo_id (nullable), species (nullable)
- **health** (nullable) — 2-3 sentence health assessment from the AI
- **care** (nullable) — 2-3 actionable care recommendations from the AI
- created_at

`species_profiles`
- id, species_name (unique), common_names (nullable), scientific_name (nullable)
- light, watering, humidity, temperature, soil, toxicity
- common_problems, growth_habits, propagation
- fetched_at, updated_at

**care_logs type constraint** — allowed values: `watered`, `fertilized`, `note`, `repotted`, `pruned`, `misted`, `pest_treatment`, `moved`. To add new types:
```sql
ALTER TABLE care_logs DROP CONSTRAINT IF EXISTS care_logs_type_check;
ALTER TABLE care_logs ADD CONSTRAINT care_logs_type_check CHECK (type IN (...all values...));
```

**Note on analysis_results field names:** The columns are `health` and `care` (short names). CLAUDE.md previously listed these incorrectly as `health_summary` and `care_tips` — those are wrong. The Edge Function prompt and all client code consistently uses `health` and `care`.

## Important Notes

### Environment Variables
- In Next.js, client-visible env vars use `NEXT_PUBLIC_` prefix
- `.env.local` keys: `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- These must also be set in the Vercel dashboard (Settings → Environment Variables)
- Restart `npm run dev` after any changes to `.env.local`
- AI API keys live in Supabase secrets only — never in Next.js env files

### Vercel Deployment
- Framework Preset must be **Next.js** (not "Other") — this was a migration gotcha
- Output Directory must be **default** (not overridden to "dist") — that was an Expo-era leftover
- Every push to `main` triggers a new production deployment automatically
- The `NEXT_PUBLIC_` env vars must be set in the Vercel dashboard

### Build Script
- `package.json` build command: `"node scripts/patch-ua-parser.js && next build"`
- `scripts/patch-ua-parser.js` patches `__dirname` out of the ncc-compiled ua-parser-js bundle before webpack runs, preventing `ReferenceError: __dirname is not defined` in Vercel's Edge Runtime (where Next.js middleware executes)
- This patch is required every time `npm install` runs and updates Next.js, since `node_modules` is re-downloaded on each Vercel build

### Supabase Auth with Next.js
- Use `@supabase/ssr` (not the plain `@supabase/supabase-js` auth helpers)
- The browser client (`lib/supabase/client.ts`) uses `createBrowserClient`
- The server client (`lib/supabase/server.ts`) uses `createServerClient` with cookie helpers
- `middleware.ts` handles session refresh on every request and gates `/(app)` routes
- After sign-out, call `router.push('/sign-in')` and `router.refresh()` — the middleware handles the rest
- `middleware.ts` uses `getUser()` (not `getSession()`) to validate sessions server-side
- Supabase email confirmation is currently disabled (for development); re-enable before launch

### Calling Supabase Edge Functions from the Browser
- Always get the session first: `const { data: { session } } = await supabase.auth.getSession()`
- Pass the token explicitly: `headers: { Authorization: \`Bearer ${session.access_token}\` }`
- This is required because `supabase.functions.invoke` doesn't always inject the token reliably
- Edge Functions are deployed with `--no-verify-jwt` flag; they do their own auth via the passed token

### Photo Uploads
- Use `<input type="file" accept="image/*" capture="environment">` for camera/library access on mobile
- On desktop, this opens a file picker (no camera capture)
- Upload to Supabase Storage using `file.arrayBuffer()` — no base64 conversion needed on web
- Always use `file.type` (not a hardcoded content type) to get the correct MIME type
- Path pattern: `{userId}/{plantId}/{timestamp}.{ext}`

### Image Format Detection in Edge Functions
- Never trust the `Content-Type` header from Supabase Storage — detect from magic bytes
- WebP: `RIFF....WEBP` (bytes 0–3 and 8–11), PNG: `\x89PNG`, GIF: `GIF8`, JPEG: `\xFF\xD8\xFF`
- See `fetchImageAsBase64` in `supabase/functions/analyze-plant/index.ts`

### AI Provider
- Controlled by the `AI_PROVIDER` Supabase secret (`claude` or `gemini`)
- Requires Edge Function redeploy after changing
- Current: `claude` using `claude-haiku-4-5-20251001`
- Base64 encoding in Edge Functions: use Deno's std library (`import { encode as encodeBase64 } from 'https://deno.land/std@0.168.0/encoding/base64.ts'`)

### Date Handling
- Always use `<input type="date">` for date fields — gives the browser's native date picker
- Values are always `YYYY-MM-DD` strings (what the database stores)
- Display with: `new Date(\`${ymd}T12:00:00\`).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })`
- Append `T12:00:00` to YYYY-MM-DD strings before constructing a Date — prevents midnight UTC from shifting to the previous local day
- For timezone-safe date strings from timestamps: use `getFullYear()/getMonth()/getDate()` (local time methods), NOT `toISOString().split('T')[0]`
- `lib/utils.ts` exports `toLocalDateStr()` and `formatDate()` for this

### Two Species Fields — Don't Conflate Them
- `plants.species` — set only when the user manually types a species in the Edit form
- `analysis_results.species` — what the AI identified from the photo
- Always check both: `const knownSpecies = plant?.species || latestAnalysis?.species`
- Using only `plant.species` will make species-dependent UI appear broken even after a successful analysis

### Urgency and Care Status
- Plant watering status computed from `watering_interval_days` + most recent `watered` care log
- `overdue`: days since last watering > interval; `due-soon`: within 1 day of interval; `good`: more than 1 day left; `unset`: no interval configured
- Sort order: `{ overdue: 0, 'due-soon': 1, good: 2, unset: 3 }` — stable sort preserves creation order within tiers
- `lib/utils.ts` exports `computeWateringStatus()`, `URGENCY_ORDER`, and `WateringStatus` type

### Care Streak Computation
- Counts consecutive local calendar days (ending today or yesterday) with any care log entry
- If today has no care yet, streak is still "alive" if yesterday was logged
- `lib/utils.ts` exports `computeStreak(logTimestamps: string[])`

### Enriching Plant List Data Efficiently
- Fetch plants, then fetch photos and care_logs with `.in('plant_id', plantIds)` — 3 total queries regardless of collection size
- Build lookup maps in JavaScript (first occurrence per plant_id = most recent, since queries are ordered descending)
- See `app/(app)/page.tsx` for the reference implementation

### Plant Detail Screen Architecture
- `app/(app)/plant/[id]/page.tsx` is a Client Component — all data is fetched client-side via the browser Supabase client
- This is because the screen is highly interactive (uploads, care logs, AI analysis, edit mode) and needs real-time state
- The pattern: `useEffect(() => { loadAll() }, [id])` triggers a full refresh when the plant ID changes
- A second `useEffect` watches `plant?.species || latestAnalysis?.species` and triggers species profile lookup when species becomes known
