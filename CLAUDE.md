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
| PWA | `next-pwa` — home screen install, offline support |

**Language:** TypeScript throughout. No `any` types.

## Project Structure
```
viriditas/
  app/
    layout.tsx              # Root layout: fonts, metadata, global styles
    (auth)/
      layout.tsx            # Unauthenticated layout (centered card, green brand header)
      sign-in/
        page.tsx            # Sign in form
      sign-up/
        page.tsx            # Sign up form
    (app)/
      layout.tsx            # Protected layout: auth guard + bottom nav bar
      page.tsx              # My Plants screen (grid view, urgency banners, streak)
      add-plant/
        page.tsx            # Add Plant form
      plant/
        [id]/
          page.tsx          # Plant Detail (tabs: Overview / History / Species)
      settings/
        page.tsx            # Settings: account info, sign out, about
  components/
    PlantCard.tsx           # Grid card: cover photo, nickname, watering badge
    CareButton.tsx          # Quick-action care log button (Watered, Fertilized, etc.)
    SpeciesProfile.tsx      # Species reference card (rendered on Species tab)
    AnalysisCard.tsx        # AI analysis result card
    TimelineItem.tsx        # Single item in the History tab timeline
  lib/
    supabase/
      client.ts             # Browser Supabase client (singleton, for Client Components)
      server.ts             # Server Supabase client (for Server Components / Route Handlers)
    types.ts                # Shared TypeScript types (Plant, PlantPhoto, CareLog, etc.)
    utils.ts                # Shared helpers: date formatting, urgency computation, streak
  supabase/
    functions/
      analyze-plant/
        index.ts            # Edge Function: AI plant analysis (UNCHANGED from Expo era)
      fetch-species-info/
        index.ts            # Edge Function: AI species profile fetch (UNCHANGED)
  public/
    icon.png                # App icon (plant sprout on brand green)
    manifest.json           # PWA manifest
  middleware.ts             # Next.js middleware: auth-gates all (app) routes
  next.config.ts
  tailwind.config.ts
  .env.local                # Never commit — NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
```

## What Has Been Built (Next.js era)
- [x] Next.js 15 project initialized with TypeScript, Tailwind CSS, App Router
- [x] `@supabase/ssr` installed — cookie-based auth, works in Server Components and Client Components
- [x] `lib/supabase/client.ts` — browser client (singleton pattern, for Client Components)
- [x] `lib/supabase/server.ts` — server client (reads cookies, for Server Components)
- [x] `middleware.ts` — protects all `/(app)` routes; redirects to sign-in if no session
- [x] `app/(auth)/sign-in/page.tsx` — sign in form with email/password
- [x] `app/(auth)/sign-up/page.tsx` — sign up form with email/password
- [x] `app/(app)/layout.tsx` — protected layout with bottom nav (My Plants / Settings)
- [x] `app/(app)/page.tsx` — My Plants: 2-col photo grid, urgency banners, care streak chip
- [x] `app/(app)/add-plant/page.tsx` — Add Plant form (nickname, species, location, date, notes)
- [x] `app/(app)/plant/[id]/page.tsx` — Plant Detail: Overview / History / Species tabs
- [x] `app/(app)/settings/page.tsx` — Settings: email, sign out, app version
- [x] `lib/types.ts` — Plant, PlantPhoto, CareLog, AnalysisResult, SpeciesProfile types
- [x] `lib/utils.ts` — formatDate(), computeWateringStatus(), computeStreak(), toLocalDateStr()

## What Has Been Built (Expo era — archived in `_expo-archive/`)
All Expo/React Native screens, components, and configurations are preserved in `_expo-archive/`
for reference. The Supabase database schema, RLS policies, and Edge Functions are **identical**
between the two eras — nothing in the database changed.

## What Comes Next
See ROADMAP.md for the full feature breakdown and phase plan.

## Plant Profile Architecture
Each plant in Viriditas has two layers of information that together form its complete profile:

**Layer 1 — Personal data (user-specific, evolves over time):**
- Nickname, notes, location, pot size, acquisition date, last repotted date, and photos
- AI health analyses and species identifications over time
- Care logs (watered, fertilized, note, repotted, pruned, misted, pest_treatment, moved)
- Watering reminder interval (displayed in-app; stored as `watering_interval_days`)

**Layer 2 — Species reference data (encyclopedic, fetched once and cached permanently):**
- Generated by the `fetch-species-info` Edge Function using the Claude API when a species is identified
- Stored in the `species_profiles` table, keyed by species name, shared across all users
- Covers: light, water, humidity, soil, temperature, toxicity, common problems, growth habits, propagation
- Fetched at most once per species globally — any subsequent user with the same plant gets the cached version instantly
- Refreshable by the user on demand
- Also passed as context to `analyze-plant` so health analyses are species-aware

**Why Claude for species data:**
Third-party plant databases (e.g. Perenual) restrict most of their species catalog to paid
plans and introduce an additional external dependency. Claude has comprehensive knowledge of
common houseplants, covers any species without catalog limits, returns naturally readable
text, and uses infrastructure already in place. The per-species caching model means ongoing
API costs are negligible — the AI is called once per species, ever.

## Coding Conventions
- Use TypeScript (`.tsx` for files with JSX, `.ts` for pure logic); no `any` types
- Use Tailwind CSS utility classes for all styling — no inline style objects, no CSS files
- Custom color: `green-brand` = `#2d6a4f` (defined in tailwind.config.ts as `colors.brand.DEFAULT`)
- Mark interactive components `'use client'` at the top; leave layouts and data-fetching pages as Server Components where possible
- Import Supabase browser client via `import { createClient } from '@/lib/supabase/client'`
- Import types via `import type { Plant } from '@/lib/types'`
- Keep pages in `app/`, reusable components in `components/`, shared logic in `lib/`
- Never put API keys or secrets in app code — use `.env.local` and Supabase Edge Functions
- Use `npm install` for all packages (no Expo-specific install commands)
- Dynamic routes use `app/[param]/page.tsx` pattern
- Data fetching in Server Components uses `createClient()` from `@/lib/supabase/server`
- Data fetching in Client Components uses `createClient()` from `@/lib/supabase/client`
- After any mutation, call `router.refresh()` to re-run Server Component data fetching

## Supabase Database Schema (unchanged from Expo era)
All table schemas, RLS policies, and data are identical. Nothing in the database changed
during the migration. The Supabase project URL and anon key are the same.

**Tables:**
- `plants` — id, user_id, nickname, species, location, pot_size, acquired_date, last_repotted_date, notes, watering_interval_days, created_at
- `photos` — id, plant_id, user_id, storage_path, created_at
- `care_logs` — id, plant_id, user_id, type (CHECK constraint), notes, logged_at
- `analysis_results` — id, plant_id, user_id, photo_id, species, health_summary, care_tips, raw_response, created_at
- `species_profiles` — id, species_name (unique), light, water, humidity, temperature, soil, toxicity, common_problems, growth_habits, propagation, created_at

**care_logs type constraint** — allowed values: `watered`, `fertilized`, `note`, `repotted`, `pruned`, `misted`, `pest_treatment`, `moved`. To add new types: `ALTER TABLE care_logs DROP CONSTRAINT IF EXISTS care_logs_type_check; ALTER TABLE care_logs ADD CONSTRAINT care_logs_type_check CHECK (type IN (...all values...));`

## Important Notes

### Environment Variables
- In Next.js, client-visible env vars use `NEXT_PUBLIC_` prefix (not `EXPO_PUBLIC_`)
- `.env.local` keys: `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- These must also be set in the Vercel dashboard (Settings → Environment Variables)
- Restart `npm run dev` after any changes to `.env.local`
- AI API keys live in Supabase secrets only — never in Next.js env files

### Supabase Auth with Next.js
- Use `@supabase/ssr` (not the plain `@supabase/supabase-js` auth helpers)
- The browser client (`lib/supabase/client.ts`) uses `createBrowserClient`
- The server client (`lib/supabase/server.ts`) uses `createServerClient` with cookie helpers
- `middleware.ts` handles session refresh on every request and gates `/(app)` routes
- After sign-out, call `router.push('/sign-in')` and `router.refresh()` — the middleware handles the rest
- Supabase email confirmation is currently disabled (for development); re-enable before launch

### Calling Supabase Edge Functions from the Browser
- Always get the session first: `const { data: { session } } = await supabase.auth.getSession()`
- Pass the token explicitly: `headers: { Authorization: \`Bearer ${session.access_token}\` }`
- This is required because `supabase.functions.invoke` doesn't always inject the token reliably
- Edge Functions are deployed with `--no-verify-jwt` flag; they do their own auth via the passed token

### Photo Uploads
- Use `<input type="file" accept="image/*" capture="environment">` for camera/library access on mobile
- On desktop, this opens a file picker (no camera capture)
- Read as base64: `const reader = new FileReader(); reader.readAsDataURL(file)` then strip the data-URL prefix
- Upload to Supabase Storage using the `ArrayBuffer` from `file.arrayBuffer()`
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
- Base64 encoding in Edge Functions: use Deno's std library, not `btoa()`

### Date Handling
- Always use `<input type="date">` for date fields — it gives the browser's native date picker
- Values are always `YYYY-MM-DD` strings (what the database stores)
- Display with: `new Date(`${ymd}T12:00:00`).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })`
- Append `T12:00:00` to YYYY-MM-DD strings before constructing a Date — prevents midnight UTC from shifting to the previous local day
- For timezone-safe date strings from timestamps: use `getFullYear()/getMonth()/getDate()` (local time methods), NOT `toISOString().split('T')[0]`

### Urgency and Care Status
- Plant watering status: computed from `watering_interval_days` + most recent `watered` care log
- `overdue`: days since last watering > interval; `due-soon`: within 1 day of interval; `good`: more than 1 day left; `unset`: no interval configured
- Sort order: `{ overdue: 0, 'due-soon': 1, good: 2, unset: 3 }` — stable sort preserves creation order within tiers
- `Array.sort` is stable in V8 (Node.js/browser), so plants within each tier keep their original creation order

### Care Streak Computation
- A streak counts consecutive local calendar days with any care log entry (any plant, any type)
- If today has no care yet, the streak is still "alive" if yesterday was logged
- Use `getFullYear/getMonth/getDate` (local time) not `toISOString()` to get date strings — avoids timezone boundary bugs

### Two Species Fields — Don't Conflate Them
- `plants.species` — set only when the user manually types a species in the Edit form
- `analysis_results.species` — what the AI identified from the photo
- Always check both: `const knownSpecies = plant?.species || latestAnalysis?.species`
- Using only `plant.species` will make species-dependent UI appear broken even after a successful analysis

### Enriching Plant List Data Efficiently
- Fetch plants, then fetch photos and care_logs with `.in('plant_id', plantIds)` — 3 total queries regardless of collection size
- Build lookup maps in JavaScript (first occurrence per plant_id = most recent, since queries are ordered descending)

### Vercel Deployment
- Next.js deploys to Vercel with zero configuration — no `vercel.json` needed
- Vercel auto-detects Next.js and sets the correct build command (`next build`) and output
- The `NEXT_PUBLIC_` env vars must be set in the Vercel dashboard
- Every push to `main` triggers a new production deployment automatically
