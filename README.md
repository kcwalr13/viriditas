# Viriditas 🌿

A houseplant care companion and registry app. Photograph your plants for AI-powered health analysis and species identification, track care history, and access encyclopedic species guides for your entire collection.

**Live app:** https://viriditas-three.vercel.app

---

## Tech Stack

| Layer | Tool |
|---|---|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS |
| Auth | Supabase Auth (`@supabase/ssr`) |
| Database | Supabase (PostgreSQL) |
| Storage | Supabase Storage |
| AI | Anthropic Claude API via Supabase Edge Functions |
| Deployment | Vercel (auto-deploys on push to `main`) |

---

## Local Development

**Prerequisites:** Node.js 18+, a Supabase project, and an Anthropic API key stored as a Supabase secret.

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

These values are in your Supabase project dashboard under Settings → API.

### 3. Start the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Project Structure

```
app/
  (auth)/             # Sign in and sign up pages (unauthenticated)
  (app)/              # All authenticated screens — shared BottomNav
    page.tsx          # Today — task list, streak, collection strip, journal peek (home)
    plants/           # Plants collection (grid/list, groupings)
    plant/[id]/       # Plant Detail (single-scroll editorial layout)
    add-plant/        # Add Plant (3-step wizard)
    explore/          # Field Guide — categories, featured, search, species detail
    settings/         # Me — identity, sign out, about
components/
  Icon.tsx            # 39 single-stroke SVG icons (replaces emoji)
  ui.tsx              # BigTitle, SectionLabel, Chip, StatusPip, HairlineButton
  BottomNav.tsx       # Floating pill: Today / Plants / Explore / Me
  PlantPhoto.tsx      # Warm blocky placeholder when no cover photo
lib/
  supabase/           # Supabase client (browser + server)
  types.ts            # Shared TypeScript types
  utils.ts            # Date, watering status, care streak helpers
supabase/
  functions/          # Edge Functions (AI analysis, species info, identify, suggest)
public/               # Static assets, PWA manifest, icons
middleware.ts         # Auth guard for all /(app) routes
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

The AI features run in Supabase Edge Functions, not the Next.js app, so API keys never reach the browser.

To deploy after making changes:

```bash
supabase functions deploy analyze-plant --no-verify-jwt
supabase functions deploy fetch-species-info --no-verify-jwt
```

The AI provider is controlled by the `AI_PROVIDER` Supabase secret (`claude` or `gemini`).

---

## Architecture Notes

See `CLAUDE.md` for full technical notes including coding conventions, database schema, important gotchas, and instructions for future development.

See `ROADMAP.md` for the feature backlog and development history.
