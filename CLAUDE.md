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
| AI Integration | Supabase Edge Functions → Claude API (`claude-haiku-4-5-20251001`; `diagnose-plant` uses `claude-sonnet-4-6`; Gemini supported on `analyze-plant`/`fetch-species-info` via `AI_PROVIDER` secret) |
| Deployment | Vercel (auto-deploys on every push to main) |

**Language:** TypeScript throughout. No `any` types.

## Project Structure
```
viriditas/
  app/
    layout.tsx              # Root layout: metadata, Google Fonts preconnect, PWA viewport
    globals.css             # Tailwind base + font imports (Source Serif 4, Inter, JetBrains Mono) + vr-scroll scrollbar hiding
    not-found.tsx           # Custom 404 — editorial paper/ink treatment, outside the route groups
    (auth)/
      layout.tsx            # Unauthenticated layout (centered card)
      sign-in/page.tsx      # Sign in form
      sign-up/page.tsx      # Sign up form
      forgot-password/page.tsx  # Sends the password-reset email (resetPasswordForEmail)
      auth/page.tsx         # Reset-link landing page — exchanges the PKCE code, sets new password
    (app)/
      layout.tsx            # Protected layout: auth guard + <NavGuard/> (floating BottomNav)
      page.tsx              # Today — Server Component (fetches plants + builds tasks, streak, journal peek)
      TodayClient.tsx       # Today — Client Component (masthead, task list, collection strip, journal peek)
      plants/
        page.tsx             # Plants collection — Server Component (fetches + enriches cards)
        PlantsClient.tsx     # Plants collection — Client (grid/list toggle, grouping chips)
      add-plant/
        page.tsx             # Add Plant — 3-step wizard (identify → place → schedule)
      camera/
        page.tsx             # Camera capture + confirm sheet (FAB target; full-screen, nav hidden)
      plant/
        [id]/
          page.tsx           # Plant Detail — Client Component; single-scroll editorial layout
          timelapse/page.tsx # Growth filmstrip — scrubber, play/pause, filmstrip thumbnails
          diagnose/page.tsx  # Examine with AI (bounded diagnose-plant sessions) + Quick triage (static tree) + history
          lineage/page.tsx   # Propagation graph — CRUD on propagations table
      explore/
        page.tsx             # Explore/Field Guide — category grid, featured carousel, search, species detail
      settings/
        page.tsx             # Me — identity, sign out, about (shows package.json version)
  components/
    Icon.tsx                # <Icon name="drop"/> — 38 single-stroke SVGs; replaces all emoji
    PlantPhoto.tsx          # Warm blocky gradient placeholder when no cover photo (deterministic from name)
    ui.tsx                  # StatusPip, Chip, BigTitle, SectionLabel, HairlineButton
    AssistantActionRow.tsx  # Recommendation row + DismissSheet + IntervalConfirmSheet (assistant Phase 1)
    BottomNav.tsx           # Floating pill nav: Today / Plants / Explore / Me + camera FAB (routes to /camera)
    NavGuard.tsx            # Wraps BottomNav — hides it on /plant/*, /add-plant, and /camera
  lib/
    supabase/
      client.ts             # Browser Supabase client
      server.ts             # Server Supabase client (reads cookies)
    types.ts                # Plant, PlantPhoto, CareLog, AnalysisResult, SpeciesProfile, CareRecommendation
    utils.ts                # formatDate, relativeTime, fileToBase64, computeWateringStatus, computeFertilizingStatus, computeStreak, computeMaxStreak, CARE_LOG_LABELS, URGENCY_ORDER
    recommendations.ts      # care_recommendations mutations: accept/done/dismiss/apply-interval/expire + action→care-log map
    notifications.ts        # Stub — web push not supported; no-op exports
  supabase/
    functions/
      _shared/
        plant-context.ts     # Shared context-section builders + types (analyze-plant + diagnose-plant)
        images.ts            # Shared image fetch with magic-byte media-type detection
      analyze-plant/         index.ts   # Edge Function: AI plant analysis (Haiku)
      diagnose-plant/        index.ts   # Edge Function: interactive diagnosis sessions (Sonnet, ≤3 ask-turns)
      fetch-species-info/    index.ts   # Edge Function: AI species profile
      identify-species/      index.ts   # Edge Function: species from base64 photo (no storage)
      suggest-species/       index.ts   # Edge Function: 4-6 candidate species for a query
  scripts/
    patch-ua-parser.js      # Prebuild patch for ua-parser-js in Edge Runtime
  docs/
    SETUP.md                # Zero-to-running guide (Supabase project, secrets, deploys, Vercel)
    ARCHITECTURE.md         # Auth/session model, two-layer plant profile, AI pipeline
    DATABASE.md             # Schema reference — tables, columns, constraints, RLS, migrations
    EDGE-FUNCTIONS.md       # API reference for the five Edge Functions
  public/
    icon.png                # App icon (PWA)
    icon-192.png            # 192×192 PWA icon
    favicon.png             # Browser tab icon
    manifest.json           # PWA manifest
  middleware.ts             # Auth-gates /(app); refreshes session cookies; whitelists password-reset routes
  next.config.ts            # Supabase Storage image domain allowlist
  tailwind.config.ts        # Editorial palette (paper/ink/accent) + font families
  CHANGELOG.md              # Per-version history (mirrors the Versioning Convention section below)
  .env.local                # Gitignored — NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
```

## What Has Been Built
- [x] Next.js 15 project initialized with TypeScript, Tailwind CSS, App Router
- [x] `@supabase/ssr` installed — cookie-based auth, works in Server Components and Client Components
- [x] `middleware.ts` + `lib/supabase/{client,server}.ts` — auth-gates `/(app)` and refreshes session cookies
- [x] `app/(auth)/sign-in/page.tsx` and `sign-up/page.tsx` — email/password auth
- [x] **Editorial Botanical redesign (2026-04-18)** — palette, custom icon set, and screen overhauls applied to every `/(app)` route. See "Editorial Design System" section below.
- [x] `app/(app)/layout.tsx` — paper-bg protected shell + `<NavGuard/>` (renders BottomNav only on routes that need it)
- [x] `app/(app)/page.tsx` + `TodayClient.tsx` — Today home: masthead greeting, streak strip, overdue/due-soon task list, collection carousel, AI journal peek
- [x] `app/(app)/plants/page.tsx` + `PlantsClient.tsx` — Collection: grid/list toggle, group by all/location/status/tag, care filter chips (all/urgent/due-soon/healthy), quick-log water/feed from grid, sort by urgency/A-Z/neglected
- [x] `app/(app)/plant/[id]/page.tsx` — Plant Detail: single-scroll editorial layout (hero carousel + lightbox, status strip, AI diagnosis card, log book with filter tabs, dossier, watering + fertilizing schedule, species guide, photo strip, floating care dock). All data fetched client-side. Includes photo ZIP export via `jszip`.
- [x] `app/(app)/add-plant/page.tsx` — Add Plant: 3-step wizard (identify → place → schedule). Step 1 uses `identify-species` for AI photo ID; plant row is created at step 3 submit.
- [x] `app/(app)/explore/page.tsx` — Field Guide: AI Identify hero, category grid, featured carousel, recently-viewed (localStorage), text + photo search into species detail
- [x] `app/(app)/settings/page.tsx` — Me: identity card, sign out, about
- [x] `components/Icon.tsx` — 38 single-stroke SVGs replacing every emoji in the UI
- [x] `components/ui.tsx` — BigTitle, SectionLabel, Chip, StatusPip, HairlineButton
- [x] `components/BottomNav.tsx` — floating pill with route-based active state + camera FAB (accent-colored, floats above-right of nav; routes to `/camera`)
- [x] `components/NavGuard.tsx` — wraps BottomNav, hides on `/plant/[id]`, `/add-plant`, and `/camera`
- [x] `components/PlantPhoto.tsx` — warm blocky gradient placeholder when a plant has no cover photo
- [x] `lib/types.ts` — Plant (+ fertilizing_interval_days, soil_type, tags, pest_notes, last_treatment_date), PlantPhoto, CareLog (+ measured type), AnalysisResult (+ health_score), SpeciesProfile (+ seasonal_care)
- [x] `lib/utils.ts` — formatDate, formatTimestamp, relativeTime, toLocalDateStr, fileToBase64, computeWateringStatus, computeFertilizingStatus, computeStreak, computeMaxStreak, CARE_LOG_LABELS, URGENCY_ORDER
- [x] Supabase schema, RLS, and Edge Functions (see schema section below)
- [x] `scripts/patch-ua-parser.js` — prebuild patch so middleware works in Vercel Edge Runtime
- [x] Vercel deployment — auto-deploys on push to `main`; production URL: https://viriditas-three.vercel.app/
- [x] `supabase/functions/identify-species` — species from base64 photo (no storage)
- [x] `supabase/functions/suggest-species` — 4-6 candidates for a freeform query
- [x] `species_profiles` table — includes `pruning_tips`, `disease_symptoms`, `seasonal_care`; prompts request bullet-formatted content
- [x] `app/(app)/camera/page.tsx` — Camera capture + confirm sheet; best-guess plant pre-selection (localStorage → first plant); uploads to `plant-photos` storage + `photos` table; saves `viriditas.lastCameraPlant` to localStorage for next session
- [x] `app/(app)/plant/[id]/timelapse/page.tsx` — Growth filmstrip: loads all photos oldest-first, scrubber + play/pause, tap filmstrip thumbnail to jump to frame
- [x] `app/(app)/plant/[id]/diagnose/page.tsx` — Branching diagnostic flow (11 verdicts, 3 question levels max); saves to `diagnoses` table (graceful-fail if migration not run); checklist with tap-to-complete next steps
- [x] `app/(app)/plant/[id]/lineage/page.tsx` — Propagation graph; full CRUD for `propagations` table (graceful-fail if migration not run); log a cutting form with recipient, date, status, note
- [x] Plant Detail `§ 08 · Tools` strip — three ToolTile cards linking to Time-lapse, Diagnose, and Lineage sub-screens
- [x] **AI care assistant Phase 1 (v1.6.0)** — `analyze-plant` v2 emits 0–3 structured `actions` + optional `interval_suggestion`; client persists them to `care_recommendations` (graceful-fail if migration not run); Today gains an "Assistant — proposed" section with Accept/Done/Dismiss (+ dismiss-reason sheet), accepted tasks join the task list, interval changes apply only via a confirm sheet; Plant Detail renders the same rows in the AI diagnosis card; proposals expire after 14 days
- [x] **Species identity verification (v1.6.0, Phase 5 P0 slice)** — dossier Confirm chip / VERIFIED tag, manual species edits set `is_name_verified`, Add Plant saves confirmed/typed species as verified, `analyze-plant` gets an identity-verified context line
- [x] **Interactive AI diagnosis (v1.7.0, Phase 2)** — `diagnose-plant` Edge Function (`claude-sonnet-4-6`, Claude-only): server-assembled context + session transcript + photos; replies with exactly one of question / photo_request / verdict; ≤3 server-tracked ask-turns then a forced verdict; honest Low-confidence verdicts with differential + safe steps; verdicts write `diagnoses` (verdict_id `'ai-session'`) and the client inserts `care_recommendations` proposals (next steps + follow-up). Diagnose screen: "Examine with AI" session UI (field-notes styling), Quick triage (static tree) retained, Past examinations history, 24h resume/abandon. Context builders extracted to `supabase/functions/_shared/`

## What Comes Next
See `ROADMAP.md` for the current state, known gaps, priorities, and development history.
(`ROADMAP_CURRENT.md` was merged into `ROADMAP.md` on 2026-06-10 and no longer exists.)

## Plant Profile Architecture
Each plant has two layers of information:

**Layer 1 — Personal data (user-specific, evolves over time):**
- Nickname, notes, location, pot size, acquisition date, last repotted date, photos
- AI health analyses and species identifications
- Care logs (watered, fertilized, note, repotted, pruned, misted, pest_treatment, moved, measured)
- Watering + fertilizing reminder intervals (stored in DB, shown as urgency badges in the grid)

**Layer 2 — Species reference data (encyclopedic, fetched once and cached permanently):**
- Generated by `fetch-species-info` Edge Function using the Claude API when a species is identified
- Stored in `species_profiles` table, keyed by species name, shared across all users
- Covers: light, watering, humidity, soil, temperature, toxicity, common problems, growth habits, propagation, pruning tips, disease symptoms, seasonal care
- Fetched at most once per species globally — cached instantly for any subsequent user with the same plant
- Refreshable by the user on demand
- Passed as context to `analyze-plant` so health analyses are species-aware

## Editorial Design System
Introduced 2026-04-18. The whole `/(app)` surface is designed to feel like a field-guide
journal — warm paper backgrounds, olive accents, serif display type. **No emoji in the UI.**

### Palette (Tailwind tokens)
| Token | Hex | Use |
|---|---|---|
| `paper` | `#F4EFE6` | Default app background |
| `paper-alt` | `#EDE6D7` | Status strips, subtle inset panels |
| `card` | `#FAF6EC` | Card/pill backgrounds lifted off paper |
| `ink` | `#1F2A24` | Primary text, solid buttons |
| `ink-soft` | `#4E5B52` | Secondary text |
| `ink-muted` | `#8A9389` | Metadata, captions |
| `rule` | `#D9D0BD` | Hairline borders (`border-rule`) and dashed rules |
| `accent` | `#4C6A48` | Olive — primary actions, active links, good status |
| `accent-soft` | `#B9C9A8` | Accent washes, chip backgrounds |
| `warn` | `#B4571E` | Burnt orange — "due soon" |
| `warn-soft` | `#F3E4CF` | |
| `danger` | `#9B3A2E` | "Overdue", destructive |
| `danger-soft` | `#EED8D3` | |

### Typography
- **Display/serif** (`font-serif`): Source Serif 4. Used for `<BigTitle/>`, plant nicknames, pull-quotes, journal entries. Often italic.
- **UI/sans** (`font-sans`): Inter. Body text, buttons, labels.
- **Metadata/mono** (`font-mono`): JetBrains Mono. Section numbers (`§ 01`), uppercase labels, timestamps, small captions. Usually tracked wider.

Fonts are loaded from Google Fonts in `app/globals.css` with a preconnect in `app/layout.tsx`.

### Icons
- `components/Icon.tsx` exports 38 single-stroke SVG icons. The full set (the `IconName` union in that file is the source of truth): leaf, drop, sun, scissors, mist, bug, move, camera, plus, check, chev, chev-down, back, search, home, book, cog, calendar, edit, trash, dots, sparkle, flame, arrow-up, arrow-right, thermometer, humidity, soil, warning, room, pot, clock, heart, close, filter, grid, list, ruler.
- Usage: `<Icon name="drop" size={16} className="text-accent" stroke={1.8}/>`.
- Color via `className` text color (SVG `stroke` uses `currentColor`).

### Primitives (`components/ui.tsx`)
- **`<BigTitle italic={boolean} children>`** — 34px serif headline. Mix italic inline with child spans.
- **`<SectionLabel number="§ 01" title="NEEDS WATER" action="See all" onAction={fn}/>`** — field-guide section header with optional right-side action link.
- **`<Chip tone="accent|warn|danger|neutral" active={bool} onClick>`** — pill-shaped button, used for filters and multi-select.
- **`<StatusPip status="overdue|due-soon|good|unset" withLabel={bool}/>`** — dot indicator for watering status.
- **`<HairlineButton variant="solid|outline" icon="drop" fullWidth>`** — primary/secondary CTA.

### Placeholder imagery (`components/PlantPhoto.tsx`)
Plants without cover photos show a warm blocky gradient. Colors are deterministic from the plant's id or nickname (`paletteFor(key)`), so the same plant always gets the same hue. Used for both grid cards and placeholder hero images.

### Bottom nav (`components/BottomNav.tsx` + `NavGuard.tsx`)
Floating pill with four tabs: **Today / Plants / Explore / Me**, plus an accent-colored camera FAB floating above-right of the pill that routes to `/camera`. Active tab shows the label; inactive tabs show just the icon. Route matching: `/plant/[id]` and `/add-plant` highlight **Plants**. The layout renders `<NavGuard/>` which hides the nav entirely on Plant Detail, Add Plant, and Camera screens.

### Screen conventions
- **Masthead pattern:** every top-level screen opens with a mono caption ("Vol. I · Saturday, April 18" style) then a `<BigTitle/>` with an italic-accent tail — e.g. "Good morning. *2 plants need you.*"
- **Section numbers:** screens use `§ 01`, `§ 02`, `§ —` to number sections like a field guide.
- **Scroll rails:** horizontal carousels use the `vr-scroll` class (hides the scrollbar). See `app/globals.css`.
- **Bottom dock** (Plant Detail only): fixed care-action pill that floats at the bottom of the screen. The global `<BottomNav/>` is hidden on `/plant/[id]` via `<NavGuard/>`, so the dock is the only bottom element on that screen.

## Coding Conventions
- Use TypeScript (`.tsx` for files with JSX, `.ts` for pure logic); no `any` types
- Use Tailwind CSS utility classes wherever possible — inline `style` objects are acceptable only for dynamic values Tailwind can't express (computed gradients in `PlantPhoto`, hero overlays, CSS properties with variable values like `textWrap: 'pretty'`)
- Use Editorial palette tokens, not brand-green: `bg-paper`, `bg-card`, `bg-paper-alt`, `text-ink`, `text-ink-soft`, `text-ink-muted`, `border-rule`, `text-accent` / `bg-accent`, `bg-accent-soft`, `text-warn`, `text-danger`, `bg-warn-soft`, `bg-danger-soft` — all defined in `tailwind.config.ts`. The legacy `brand` token is still in the config (mapped to the new accent) so any un-migrated code keeps compiling, but new code should use the Editorial tokens.
- **Never use emoji in UI.** Use `<Icon name="..."/>` from `components/Icon.tsx`. See the icon list at the top of that file. Emoji are still OK in toast/notification *text* content and server-side AI prompts.
- Use `font-serif` for display headlines (Source Serif 4), `font-sans` for UI (Inter), `font-mono` for metadata/captions (JetBrains Mono)
- Mark interactive components `'use client'` at the top; leave layouts and data-fetching pages as Server Components where possible
- Import Supabase browser client via `import { createClient } from '@/lib/supabase/client'`
- Import Supabase server client via `import { createClient } from '@/lib/supabase/server'`
- Import types via `import type { Plant } from '@/lib/types'`
- Import primitives via `import { BigTitle, SectionLabel, Chip, StatusPip, HairlineButton } from '@/components/ui'`
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
- notes (nullable), watering_interval_days (nullable int), fertilizing_interval_days (nullable int)
- soil_type (nullable), tags (text[] default '{}'), pest_notes (nullable), last_treatment_date (nullable, YYYY-MM-DD)
- is_name_verified (boolean, default false) — see the identity note below
- created_at

`photos`
- id, plant_id, user_id, storage_path, created_at

`care_logs`
- id, plant_id, user_id, type (CHECK constraint — see below), notes (nullable), logged_at
- **category** (nullable, CHECK constraint) — only set on `note` rows; one of `growth`, `pest`, `environment`, `concern`, `general`. Legacy notes carry NULL and render without a badge. (Phase 15 — Gap 4)
- **measurement_value** (nullable numeric) — only set on `measured` rows; structured numeric value for trend tracking. (Phase 15 — Gap 6)
- **measurement_unit** (nullable, CHECK constraint) — pairs with `measurement_value`; one of `cm`, `in`, `mm`, `ft`, `leaves`, `stems`, `flowers`, `pups`. Short allowlist keeps AI trend comparison reliable.

`analysis_results`
- id, plant_id, user_id, photo_id (nullable), species (nullable)
- **health** (nullable) — 2-3 sentence health assessment from the AI
- **health_score** (nullable int, 1–5) — numeric health rating; null for pre-Phase-12A analyses
- **care** (nullable) — 2-3 actionable care recommendations from the AI
- created_at

`species_profiles`
- id, species_name (unique), common_names (nullable), scientific_name (nullable)
- light, watering, humidity, temperature, soil, toxicity
- common_problems, growth_habits, propagation
- pruning_tips (nullable), disease_symptoms (nullable), seasonal_care (nullable)
- fetched_at, updated_at

`diagnoses` *(added 2026-06-09 — see "New Sub-screens" below for the full SQL)*
- id, plant_id, user_id, created_at
- question_path (jsonb), verdict_id, verdict_title, confidence, reasoning (text[]), next_steps (jsonb)

`propagations` *(added 2026-06-09 — see "New Sub-screens" below for the full SQL)*
- id, user_id, parent_plant_id, child_plant_id (nullable), recipient_name (nullable)
- taken_on (date), status (CHECK: rooting/thriving/failed/unknown, default rooting), note (nullable)

`diagnosis_sessions` *(v1.7.0 — assistant Phase 2; full SQL in `docs/DATABASE.md`; **applied in production 2026-06-10** — verified: 10 columns, RLS on, 1 policy)*
- id, plant_id, user_id, created_at, concluded_at (nullable)
- status (CHECK: active/concluded/abandoned), turns (jsonb transcript array), ask_count (int, server-tracked, cap 3)
- verdict (jsonb, nullable), diagnosis_id (nullable → diagnoses.id once concluded)
- All writes happen in the `diagnose-plant` function (service role); the client only reads (resume offer) and flips status to `abandoned`
- Session photos live under `{userId}/{plantId}/diagnosis/…` in storage with **no `photos` row**

`care_recommendations` *(v1.6.0 — assistant Phase 1; full SQL in `docs/DATABASE.md`; **applied in production 2026-06-10** — verified: 14 columns, RLS on, 1 policy)*
- id, plant_id, user_id, created_at, resolved_at (nullable)
- source (CHECK: analysis/diagnosis/seasonal), source_id (uuid, nullable — the analysis row)
- action (imperative text), rationale (nullable), urgency (CHECK: now/soon/routine), due_date (nullable date)
- interval_suggestion (jsonb, nullable — `{type, current_days, suggested_days, reason}`; applied only via the confirm sheet)
- status (CHECK: proposed/accepted/done/dismissed/expired), dismissed_reason (nullable CHECK: wrong/already_done/later)
- All app queries against this table soft-fail to empty on a database without the migration

> **Full schema reference** — column types, constraints, RLS policies, indexes, and the
> consolidated migration SQL live in `docs/DATABASE.md`. Keep both in sync when the schema changes.

> **`is_name_verified` (in use since v1.6.0):** boolean on `plants`, default false,
> confirmed live in production 2026-06-10. Set true when the owner asserts the species
> name (dossier Confirm chip, manual species edit, Add Plant confirm/typed name); cleared
> when the species is removed. `analyze-plant` receives it as `identityContext` so the
> model hedges species-specific claims while the name is AI-assumed.

**care_logs type constraint** — allowed values: `watered`, `fertilized`, `note`, `repotted`, `pruned`, `misted`, `pest_treatment`, `moved`, `measured`. To add new types:
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
- Production URL: **https://viriditas-three.vercel.app/**
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
- **Public (no-session) routes** are exactly: `/sign-in`, `/sign-up`, `/forgot-password`, `/auth`. The last two are the password-reset flow — the reset email lands on `/auth`, which must load while signed out so the one-time PKCE code can be exchanged. Only `/sign-in` and `/sign-up` bounce already-signed-in users to home; `/auth` deliberately does not, so a signed-in user clicking a reset link still reaches the form (v1.5.0)
- After sign-out, call `router.push('/sign-in')` and `router.refresh()` — the middleware handles the rest
- `middleware.ts` uses `getUser()` (not `getSession()`) to validate sessions server-side
- Supabase email confirmation is currently disabled (for development); re-enable before launch

### Calling Supabase Edge Functions from the Browser
- Always get the session first: `const { data: { session } } = await supabase.auth.getSession()`
- Pass the token explicitly: `headers: { Authorization: \`Bearer ${session.access_token}\` }`
- This is required because `supabase.functions.invoke` doesn't always inject the token reliably
- Edge Functions are deployed with `--no-verify-jwt` flag; **all five validate the token themselves** by calling `supabase.auth.getUser()` with the forwarded Authorization header and returning 401 when it's missing or invalid (hardened in v1.5.0)
- Additional v1.5.0 hardening: `analyze-plant` rejects any `imageUrl` outside this project's `plant-photos` storage bucket (SSRF guard); `fetch-species-info` maps AI output field-by-field onto the schema instead of spreading untrusted JSON into the upsert; `identify-species` enforces a MIME allowlist (jpeg/png/webp/gif)
- v1.7.0: `diagnose-plant` accepts session-photo paths only under the caller's own `{userId}/{plantId}/diagnosis/` prefix (the SSRF guard adapted to storage paths) and performs all session writes with the service role
- Full request/response shapes, error codes, and deploy commands: see `docs/EDGE-FUNCTIONS.md`

### Photo Uploads
- Use `<input type="file" accept="image/*" capture="environment">` for camera/library access on mobile
- On desktop, this opens a file picker (no camera capture)
- Upload to Supabase Storage using `file.arrayBuffer()` — no base64 conversion needed on web
- Always use `file.type` (not a hardcoded content type) to get the correct MIME type
- Path pattern: `{userId}/{plantId}/{timestamp}.{ext}`

### Image Format Detection in Edge Functions
- Never trust the `Content-Type` header from Supabase Storage — detect from magic bytes
- WebP: `RIFF....WEBP` (bytes 0–3 and 8–11), PNG: `\x89PNG`, GIF: `GIF8`, JPEG: `\xFF\xD8\xFF`
- See `fetchImageAsBase64` in `supabase/functions/_shared/images.ts` (extracted from analyze-plant in v1.7.0; both analyze-plant and diagnose-plant use it)

### AI Provider
- Controlled by the `AI_PROVIDER` Supabase secret (`claude` or `gemini`)
- Requires Edge Function redeploy after changing
- Current: `claude` using `claude-haiku-4-5-20251001`
- **Provider support is per-function:** only `analyze-plant` and `fetch-species-info` implement the Gemini path (`gemini-2.5-flash`). `identify-species` and `suggest-species` call Claude directly regardless of `AI_PROVIDER`.
- Base64 encoding in Edge Functions: use Deno's std library (`import { encode as encodeBase64 } from 'https://deno.land/std@0.168.0/encoding/base64.ts'`)

### Analyze-Plant Context (Phase 15 — Gaps 1, 2, 3, 5)
The `analyze-plant` Edge Function receives rich context so the AI can deliver plant-specific advice instead of generic species guidance:
- **Species profile**: full row including `pruning_tips`, `disease_symptoms`, `seasonal_care` (not just light/water/temp). Disease symptoms are especially valuable — they let the AI cross-reference what it sees in the photo against known issue signatures for that species.
- **Plant context**: `location`, `pot_size`, `soil_type`, plus `plant_notes` (owner's freeform notes), `pest_notes` (pest history), `last_treatment_date`, and (v1.6.0) `watering_interval_days`/`fertilizing_interval_days` — the current schedules are the baseline any `interval_suggestion` is judged against. The client now always sends `plantContext`. Pest history is consequential — recurring infestations get treated very differently from first occurrences.
- **Previous analyses**: includes `health_score` (1–5 trend) and `care` (prior recommendations). The AI is instructed to comment on whether scores are improving/declining and whether the owner appears to have followed previous recommendations.
- **Recent care logs**: each entry can include `category` (for `note` rows) and `measurement_value`/`measurement_unit` (for `measured` rows). The AI uses categorized notes to understand what the owner was focused on, and measurements to assess growth rate.
- **Season context**: month + hemisphere (currently hardcoded to `northern`).
- **Identity context** (v1.6.0, Phase 5 slice): `identityContext: { verified: boolean } | null` — whether the owner has confirmed the species name. Unverified → the prompt tells the model to hedge species-specific claims and flag photo/species mismatches.

The v2 response adds `actions` (0–3 structured next steps) and `interval_suggestion`, both sanitized in the function before returning — see `docs/EDGE-FUNCTIONS.md` for the exact shapes. The client persists them to `care_recommendations` after saving the analysis.

When adding a new field to one of these context types, update three places: the call-site payload in [`plant/[id]/page.tsx`](app/(app)/plant/[id]/page.tsx) `handleAnalyze`, the type definition in `analyze-plant/index.ts`, and the prompt-builder section that consumes it.

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
- Both **watering** and **fertilizing** have independent status tracking using the same logic
- Status is computed from an interval (days) + the most recent relevant care log
- `overdue`: days since last care > interval; `due-soon`: within 1 day of interval; `good`: more than 1 day left; `unset`: no interval configured
- Sort order: `{ overdue: 0, 'due-soon': 1, good: 2, unset: 3 }` — plants sort by their most urgent status across both watering and fertilizing
- `lib/utils.ts` exports `computeWateringStatus()`, `computeFertilizingStatus` (alias), `URGENCY_ORDER`, and `WateringStatus` type

### Care Streak Computation
- Counts consecutive local calendar days (ending today or yesterday) with any care log entry
- If today has no care yet, streak is still "alive" if yesterday was logged
- `lib/utils.ts` exports `computeStreak(logTimestamps: string[])` (current streak) and `computeMaxStreak()` (all-time best)

### Enriching Plant List Data Efficiently
- Fetch plants, then fetch photos and care_logs with `.in('plant_id', plantIds)` — 3 total queries regardless of collection size (photos + care_logs run in a `Promise.all`)
- Build lookup maps in JavaScript (first occurrence per plant_id = most recent, since queries are ordered descending)
- See `app/(app)/page.tsx` (Today; adds a 4th query for the streak history) and `app/(app)/plants/page.tsx` for the reference implementations

### Plant Detail Screen Architecture
- `app/(app)/plant/[id]/page.tsx` is a Client Component — all data is fetched client-side via the browser Supabase client
- This is because the screen is highly interactive (uploads, care logs, AI analysis, edit mode) and needs real-time state
- The pattern: `useEffect(() => { loadAll() }, [id])` triggers a full refresh when the plant ID changes
- A second `useEffect` watches `plant?.species || latestAnalysis?.species` and triggers species profile lookup when species becomes known

### NavGuard Pattern
- `components/NavGuard.tsx` is a client component that wraps `<BottomNav/>` and hides it on certain routes
- Used in `app/(app)/layout.tsx` in place of `<BottomNav/>` directly
- Currently hidden on: `/add-plant` (full-screen wizard), `/camera` (full-screen capture), and any path starting with `/plant/` (has its own care dock)
- To add a new route that should hide the nav: add it to the `HIDDEN_ROUTES` array in `NavGuard.tsx`
- This avoids the `usePathname()` hook living in the Server Component layout (it can only run in Client Components)

### Explore / Encyclopedia Screen
- `app/(app)/explore/page.tsx` — Client Component; all state managed locally
- **Text search flow**: `suggest-species` Edge Function → Wikipedia thumbnail enrichment → 2-col suggestion grid → user selects → `fetch-species-info` → profile
- **Photo search flow**: `identify-species` Edge Function (base64, no storage) → `fetch-species-info` → profile directly (no disambiguation step)
- **Wikipedia thumbnails**: fetched client-side via `https://en.wikipedia.org/api/rest_v1/page/summary/{scientificName}` after getting suggestions; CORS-enabled, free, no API key; `thumbnail.source` from the response; failures silently ignored
- **`suggest-species` Edge Function**: accepts `{ query }`, returns `{ suggestions: [{scientificName, commonName, description}] }`; handles misspellings, phonetic approximations, common names; deployed with `--no-verify-jwt`
- **`FormattedContent` component**: renders species profile text with smart formatting — lines starting with `• ` or `- ` become bullet lists; double-newline separation becomes paragraphs; plain text falls back gracefully
- **Bullet formatting in profiles**: `fetch-species-info` prompt requests `\n• ` bullet format for multi-item fields; existing cached entries won't have bullets until refreshed
- **"Back to results" button**: shown on profile view when there are suggestions in state; clears profile and re-displays the grid without a new API call

### New Sub-screens (Camera, Timelapse, Diagnose, Lineage)
The Diagnose and Lineage screens are backed by two tables, `diagnoses` and `propagations`.
**Both migrations were applied in production on 2026-06-09 — the tables are live with RLS
enabled, and no action is needed on the production database.** The SQL below is kept as
reference for setting up a fresh Supabase project (it also lives in `docs/DATABASE.md`).
Both screens gracefully handle missing tables — on a database without them, Diagnose and
Lineage show an empty state with a setup notice rather than crashing.

**`diagnoses` table:**
```sql
create table if not exists diagnoses (
  id uuid primary key default gen_random_uuid(),
  plant_id uuid not null references plants(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  question_path jsonb not null,
  verdict_id text not null,
  verdict_title text not null,
  confidence text not null,
  reasoning text[] not null,
  next_steps jsonb not null
);
create index if not exists idx_diagnoses_plant on diagnoses(plant_id, created_at desc);
alter table diagnoses enable row level security;
create policy "Users manage own diagnoses" on diagnoses
  for all using (auth.uid() = user_id);
```

**`propagations` table:**
```sql
create table if not exists propagations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  parent_plant_id uuid not null references plants(id) on delete cascade,
  child_plant_id uuid references plants(id),
  recipient_name text,
  taken_on date not null,
  status text not null check (status in ('rooting','thriving','failed','unknown')) default 'rooting',
  note text
);
create index if not exists idx_propagations_parent on propagations(parent_plant_id);
alter table propagations enable row level security;
create policy "Users manage own propagations" on propagations
  for all using (auth.uid() = user_id);
```

- **Camera best-guess logic**: `viriditas.lastCameraPlant` localStorage key stores the last plant used in the camera confirm flow; used as the first-choice pre-selection on next open
- **Timelapse data source**: reads from the existing `photos` table ordered `created_at ASC` (oldest first) — no new table needed
- **Diagnose, two paths (v1.7.0)**: "Examine with AI" runs bounded `diagnose-plant` sessions (transcript UI, ≤3 ask-turns, verdict → `diagnoses` + `care_recommendations` proposals; resume window 24h). "Quick triage" keeps the original static tree: 11 verdicts, ≤3 question levels, no AI call, saves to `diagnoses` silently (errors swallowed). The landing view lists past examinations from `diagnoses` (AI vs Triage tagged via `verdict_id`)
- **Lineage v1**: recipient is free-text; no cross-account linking; `child_plant_id` nullable for forward compatibility with v2

## Versioning Convention

The app version lives in **`package.json`** (`"version"` field) and is the single source of truth. The Settings screen imports it at build time via `import pkg from '@/package.json'`.

Use **semantic versioning** (MAJOR.MINOR.PATCH):
- **MAJOR** (`1.x.x`) — stays at 1 until a breaking data-schema change or full redesign
- **MINOR** (`x.N.x`) — bump once per session that ships user-facing features; each meaningful feature session = +1
- **PATCH** (`x.x.N`) — bump for bug-fix-only sessions (no new user-visible features)
- **Documentation-only sessions do not bump the version** — nothing user-facing ships, so the deployed app is unchanged.

When a version bumps, also add a matching entry to `CHANGELOG.md` (the human-facing mirror of the history below).

**History:**
- `1.0.0` — initial release: core screens (Today, Plants, Plant Detail, Add Plant, Explore, Me), Editorial design system, AI edge functions
- `1.1.0` — NavGuard, Plants collection enhancements, Plant Detail v2 (carousel, lightbox, fertilizing schedule, tags/soil/pest edit, Measure action, ZIP export)
- `1.2.0` — Phase 15: structured journaling (NoteCategory, MeasurementUnit, category picker, measurement picker, expanded AI context)
- `1.3.0` — P1/P2 backlog: password reset, storage cleanup on delete, re-analyze gate, species cache invalidation, log pagination, Quick Add Note sheet, streak strip navigation, Add Plant autocomplete, Explore real categories
- `1.4.0` — Camera, Timelapse, Diagnose, and Lineage screens; camera FAB; § 08 Tools strip on Plant Detail
- `1.5.0` — Review remediation: fixed the lint error that was failing every Vercel build since 1.4.0 (production was stuck on 1.3.0 — the cause of the "missing" Tools strip and /camera 404); Edge Function auth + SSRF/cache-poisoning hardening; Today hydration fix; password-reset routes whitelisted in middleware; toxicity label fix; streak badge, schedule chips, stat colors, Add Plant validation, Invalid Date fixes; custom 404 page
- `1.5.1` — Fixed the remaining Today hydration error (#418): masthead date/season, greeting, streak-since text, activity grid, and journal-peek relative time were all computed from `new Date()` in the render body, so Vercel's UTC server render diverged from the browser's local-time render after 8 PM Eastern. `TodayClient` now keeps a `now: Date | null` state set in a mount effect; time-derived strings render deterministic fallbacks until it's set. Pattern note: never call `new Date()` (or read the clock any other way) in the render body of a client component that gets server-rendered.
- `1.5.2` — Plants list view: quick-log buttons now render on every row (the last Info item from the June 2026 review). Water is always loggable; feed shows whenever a fertilizing schedule exists; urgency is expressed by button color (solid danger/warn when due, quiet outline otherwise) instead of by the button appearing and disappearing.
- `1.6.0` — AI care assistant Session A (`docs/ASSISTANT-SPEC.md` Phase 1 + Phase 5 identity slice): `care_recommendations` table + `analyze-plant` v2 (structured actions, interval suggestions, identity context, current-schedule context); Today "Assistant — proposed" section with Accept/Done/Dismiss and dismiss-reason sheet; accepted tasks join the task list; interval confirm sheet; Plant Detail inline action rows; 14-day proposal expiry; species identity verification (dossier Confirm chip/VERIFIED tag, verified manual edits, Add Plant verified saves).
- `1.7.0` — AI care assistant Session B (Phase 2, the flagship): interactive diagnosis sessions. New `diagnosis_sessions` table + `diagnose-plant` Edge Function (`claude-sonnet-4-6`): server-assembled context, ≤3 server-tracked ask-turns, honest Low-confidence verdicts with differentials, verdict → `diagnoses` history + `care_recommendations` proposals (incl. scheduled follow-up). Diagnose screen rework: "Examine with AI" transcript UI, Quick triage retained, Past examinations list, 24h resume/abandon. Plant-context prompt builders extracted to `supabase/functions/_shared/` (analyze-plant redeploy required).
