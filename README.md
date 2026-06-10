# Viriditas 🌿

A houseplant care companion and registry app. Photograph your plants for AI-powered health analysis and species identification, track care history, and access encyclopedic species guides for your entire collection.

**Live app:** https://viriditas-three.vercel.app
**Current version:** 1.5.2 (see [CHANGELOG.md](CHANGELOG.md))

Viriditas is a web app (PWA) — it runs in any browser on desktop, Android, and iOS, and can be added to the home screen for a full-screen, app-like experience.

---

## Features

- **Today** — daily dashboard: overdue/due-soon care tasks with quick-log buttons, care streak, 14-day activity strip, collection carousel, AI journal peek
- **Plants** — collection in grid or list view; group by location/status/tag, filter by urgency, quick-log water/feed from any card or row
- **Plant Detail** — single-scroll editorial profile: photo carousel + lightbox, AI diagnosis with 1–5 health score and trend, log book with filters and CSV export, dossier, watering + fertilizing schedules, species guide, photo ZIP export
- **Add Plant** — 3-step wizard with AI species identification from a photo
- **Camera** — quick capture with a confirm sheet that pre-selects the most likely plant
- **Time-lapse** — scrubbable filmstrip of a plant's photo history
- **Diagnose** — branching diagnostic questions ending in one of 11 verdicts with a next-steps checklist
- **Lineage** — propagation tracking: log cuttings, recipients, and rooting status
- **Explore** — AI-powered field guide: search any species by name or photo, browse categories, cached encyclopedic care profiles

## Tech Stack

| Layer | Tool |
|---|---|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS |
| Auth | Supabase Auth (`@supabase/ssr`, cookie-based) |
| Database | Supabase (PostgreSQL) |
| Storage | Supabase Storage |
| AI | Anthropic Claude API via Supabase Edge Functions (Gemini optional on two functions) |
| Deployment | Vercel (auto-deploys on push to `main`) |

---

## Local Development

**Prerequisites:** Node.js 18.18+ (20+ recommended), npm, and access to a Supabase project that already has the Viriditas schema, storage bucket, and Edge Functions. To create that Supabase project from scratch, follow [docs/SETUP.md](docs/SETUP.md) first — the database is not optional; the app has no local/offline mode.

### 1. Install dependencies

```bash
npm install
```

### 2. Set up environment variables

Create a `.env.local` file in the project root:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

These values are in your Supabase project dashboard under Settings → API. AI keys are **not** needed here — they live in Supabase Edge Function secrets, never in the Next.js app.

### 3. Start the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

**Note on `npm run build`:** the build script runs `node scripts/patch-ua-parser.js` before `next build`. The patch rewrites a `__dirname` reference inside the ncc-compiled `ua-parser-js` bundle that crashes Vercel's Edge Runtime (where Next.js middleware executes). It must re-run after every `npm install`, which is why it's part of the build command rather than a one-time step.

---

## Project Structure

```
app/
  not-found.tsx         # Custom 404 page
  (auth)/               # Unauthenticated pages: sign-in, sign-up,
                        #   forgot-password, and /auth (reset-link landing)
  (app)/                # All authenticated screens — shared floating BottomNav
    page.tsx            # Today — task list, streak, collection strip, journal peek (home)
    plants/             # Plants collection (grid/list, grouping, filters)
    plant/[id]/         # Plant Detail (single-scroll editorial layout)
      timelapse/        # Growth filmstrip
      diagnose/         # Branching diagnostic flow (11 verdicts)
      lineage/          # Propagation tracking
    add-plant/          # Add Plant (3-step wizard)
    camera/             # Camera capture + confirm sheet (FAB target)
    explore/            # Field Guide — categories, featured, search, species detail
    settings/           # Me — identity, stats, sign out, about
components/
  Icon.tsx              # 38 single-stroke SVG icons (replaces emoji)
  ui.tsx                # BigTitle, SectionLabel, Chip, StatusPip, HairlineButton
  BottomNav.tsx         # Floating pill: Today / Plants / Explore / Me + camera FAB
  NavGuard.tsx          # Hides BottomNav on plant/*, add-plant, camera
  PlantPhoto.tsx        # Warm blocky placeholder when no cover photo
lib/
  supabase/             # Supabase client (browser + server)
  types.ts              # Shared TypeScript types
  utils.ts              # Date, watering status, care streak helpers
supabase/
  functions/            # 4 Edge Functions: analyze-plant, fetch-species-info,
                        #   identify-species, suggest-species
scripts/
  patch-ua-parser.js    # Prebuild patch (see Local Development note)
docs/                   # Setup, architecture, database, and Edge Function references
public/                 # PWA manifest + icons
middleware.ts           # Auth guard for all /(app) routes + session refresh
```

---

## Deployment

The app auto-deploys to Vercel on every push to `main`. No manual steps needed after the initial setup.

**Required Vercel settings** (Settings → Build and Deployment):
- Framework Preset: **Next.js**
- Output Directory: **default** (do not override)
- Environment Variables: `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`

---

## Supabase Edge Functions

The AI features run in four Supabase Edge Functions, not the Next.js app, so API keys never reach the browser. All four are deployed with `--no-verify-jwt` and instead validate the caller's Supabase session token themselves (`getUser()`), returning 401 otherwise.

To deploy after making changes:

```bash
supabase functions deploy analyze-plant --no-verify-jwt
supabase functions deploy fetch-species-info --no-verify-jwt
supabase functions deploy identify-species --no-verify-jwt
supabase functions deploy suggest-species --no-verify-jwt
```

The AI provider is controlled by the `AI_PROVIDER` Supabase secret (`claude` or `gemini`); the Gemini path exists only in `analyze-plant` and `fetch-species-info` — the other two always call Claude. Request/response shapes, error codes, and required secrets are documented in [docs/EDGE-FUNCTIONS.md](docs/EDGE-FUNCTIONS.md).

---

## Documentation

| Doc | What it covers |
|---|---|
| [docs/SETUP.md](docs/SETUP.md) | Zero-to-running: Supabase project, schema, storage, secrets, function deploys, Vercel |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Auth/session model, two-layer plant profiles, the AI pipeline |
| [docs/DATABASE.md](docs/DATABASE.md) | Schema reference: tables, columns, constraints, RLS, indexes, migrations |
| [docs/EDGE-FUNCTIONS.md](docs/EDGE-FUNCTIONS.md) | API reference for the four Edge Functions |
| [docs/ASSISTANT-SPEC.md](docs/ASSISTANT-SPEC.md) | Product assessment + phased spec for the v2 AI care assistant (implementation handoff) |
| [CLAUDE.md](CLAUDE.md) | Working notes for AI coding sessions: conventions, gotchas, version history |
| [ROADMAP.md](ROADMAP.md) | Current state, priorities, and development history |
| [CHANGELOG.md](CHANGELOG.md) | Per-version release notes |
