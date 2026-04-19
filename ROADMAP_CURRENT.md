# Viriditas — Current State & Priorities
_Last updated: 2026-04-19 after session wrap-up_

---

## Current State

**Live URL:** https://viriditas-three.vercel.app/
**Test account:** uitester@viriditas.dev / Viriditas2026!
**Repo:** https://github.com/kcwalr13/viriditas (auto-deploys `main` → Vercel)

The app is fully functional end-to-end. Users can add plants (photo or name), track care logs, get AI health analyses, browse an encyclopedia of species, and view a Today dashboard with urgent tasks. The design system (Editorial Botanical) is applied consistently across all screens.

---

## What's Built

### Core infrastructure
- Next.js 15 App Router, TypeScript, Tailwind CSS, Supabase SSR auth
- Cookie-based session management via `@supabase/ssr` + `middleware.ts`
- Vercel deployment — auto-deploys on push to `main`
- PWA manifest + viewport settings for home-screen install

### Design system (Editorial Botanical)
- Warm paper palette, olive accent, burnt orange / deep red status tones
- Source Serif 4 (display) + Inter (UI) + JetBrains Mono (metadata)
- 40-icon single-stroke SVG set replacing all emoji in the app UI
- Shared primitives: `BigTitle`, `SectionLabel`, `Chip`, `StatusPip`, `HairlineButton`
- `PlantPhoto` deterministic warm-gradient placeholder (no cover photo = consistent hue)
- Floating pill `BottomNav` with route-aware active state, hidden via `NavGuard` on plant detail + add-plant
- Auth pages migrated to editorial palette

### Today screen (`/`)
- Server Component — 4 queries: plants, photos, care logs, streak logs
- Greeting masthead with live date, urgency subtitle
- Care streak strip (flame icon, days since first in streak)
- Overdue + due-soon task rows with quick-link to plant dock
- Horizontal collection carousel with StatusPip badges
- Journal peek card (most recent AI health assessment with attribution)
- Empty/onboarding state with feature callouts

### Plants collection (`/plants`)
- Server Component — 3 queries: plants, photos, watered+fertilized logs
- 2-col photo grid + list view toggle
- Group by: All / Location / Status / Tag
- Care filter chips: All / Urgent / Due Soon / Healthy
- Sort: Urgency / A–Z / Most Neglected
- Quick-log water or feed directly from each card (with toast feedback)
- StatusPip badge overlay showing worst urgency across watering + fertilizing
- Empty state with add-plant CTA

### Plant Detail (`/plant/[id]`)
- Full client-side data fetching (plant + photos + care logs + analyses + last-watered/fertilized)
- Hero photo carousel (360px) with lightbox and dot indicators; falls back to PlantPhoto gradient
- Status strip: Watered days, Activity count, Photo count
- Collapsible edit form (nickname, species, location, pot size, soil type, acquired/repotted dates, notes, tags, pest notes, last treatment date)
- AI Diagnosis card (§ 01) — runs `analyze-plant` edge function with full context; shows health score
- Log book (§ 02) — merged timeline of care logs + analyses, filterable by type; "Show all" toggle
- Dossier (§ 03) — key metadata displayed as field-guide rows
- Watering + fertilizing schedule (§ 04) — separate chip pickers for each interval
- Species guide (§ 05) — expandable quick-facts + full profile from `fetch-species-info`
- Photo strip (§ 06) — horizontal scroll of all photos with timestamps; ZIP export via jszip
- Floating care dock — Water / Mist / Feed / Prune + expandable More row (Repot / Treat / Move / Measure / Note)
- Toast notifications (slides up from dock level, 2.5s auto-dismiss)
- Delete plant with confirmation dialog

### Add Plant (`/add-plant`)
- 3-step wizard with progress bar; BottomNav hidden via NavGuard
- Step 1: Photo + AI species identification via `identify-species` edge function; manual name fallback
- Step 2: Nickname (serif italic input) + location chips + custom location
- Step 3: Watering interval chip picker (3/5/7/10/14/21d)
- Plant row + photo upload happen atomically at Step 3 submit

### Explore / Field Guide (`/explore`)
- AI Identify hero card (photo → `identify-species` → `fetch-species-info` → profile)
- Text search: `suggest-species` → Wikipedia thumbnail enrichment → 2-col suggestion grid
- Category grid (6 static categories — launch content placeholders)
- Featured carousel (6 species — launch placeholders)
- Recently viewed list (localStorage, 6 entries)
- Full species detail view with care sections, problems, disease symptoms, toxicity, growth, propagation, seasonal care
- "Refresh guide" force-regenerates the cached profile via AI

### Me / Settings (`/settings`)
- Identity card (shows signed-in email)
- Sign out with confirmation
- About card with app name, version, description

### AI / Edge Functions
- `analyze-plant` — multi-context health analysis (species profile + care history + location/pot); returns health_score 1–5
- `fetch-species-info` — generates + caches encyclopedic species profiles; shared across all users
- `identify-species` — lightweight photo → species name (no DB write)
- `suggest-species` — freeform query → 4–6 ranked candidate species
- All functions: Claude Haiku (`claude-haiku-4-5-20251001`); Gemini hot-swap via `AI_PROVIDER` secret

### Data layer
- `plants`, `photos`, `care_logs`, `analysis_results`, `species_profiles` tables
- Plants: full field set including tags, soil_type, pest_notes, fertilizing_interval_days
- Watering + fertilizing status computed independently; collection sorts by worst across both
- Care streak computed from all care logs for the year (consecutive local calendar days)
- `computeMaxStreak` available for all-time personal best

---

## Known Gaps & Rough Edges

### P1 — Should fix soon

**Photo deletion not implemented**
When a plant is deleted, the row cascade removes `photos` table entries, but the underlying files in Supabase Storage at `{userId}/{plantId}/…` are orphaned. Need a Supabase database trigger or an Edge Function called on plant delete to clean up storage.

**Log book only shows items with no real pagination**
The timeline in Plant Detail shows 8 items with a "show all" toggle — but "show all" loads the full in-memory list. Heavy users would need server-side pagination for the full history to be practical.

**Species profile cache not invalidated on name correction**
If the AI identifies "Monstera sp." and the user later corrects to "Monstera deliciosa" in the edit form, the species guide fetches for the corrected name — but the old "Monstera sp." profile remains in `species_profiles` forever. Minor storage leak; not a user-facing bug.

**No confirmation before triggering re-analyze**
The "Re-analyze" button in Plant Detail triggers an AI call immediately with no "are you sure?" gate. For cost management, a debounce or rate-limit feedback would be useful.

**Password reset flow**
No "forgot password" link on sign-in. Supabase supports this via `supabase.auth.resetPasswordForEmail()`; just needs the UI.

### P2 — Nice to have

**Category grid and Featured carousel are static placeholders**
`CATEGORIES` and `FEATURED` in `explore/page.tsx` are hardcoded arrays. They work as browse entry points but the counts ("24 species") are fake. Real implementation would either: (a) query the `species_profiles` DB for real stats, or (b) keep them as curated editorial content (simpler, fine for MVP).

**No "Add note" shortcut from Today screen**
The Today task rows deep-link to `#quick-actions` but the anchor scroll doesn't always land at the dock. A direct "mark watered" tap from the Today screen (without navigating away) would feel faster.

**Streak strip is not tappable**
The streak strip on Today has a `chev` icon suggesting interactivity, but `onClick` is not wired. It should navigate to a streak history view, or the chevron should be removed.

**Add Plant Step 1 "Search by name" has no autocomplete**
Users who type a name manually get no suggest-species hints. Wiring the manual input to `suggest-species` would close the gap between photo-based and name-based onboarding.

**Bulk care logging**
"Water all overdue plants" from the Today screen. High-value for multi-plant users; can be a Today-screen button that batches inserts.

### P3 — Future features (design decision needed)

**Push notifications** — `lib/notifications.ts` is a no-op stub. Web Push requires a service worker, VAPID keys, and a subscription management flow. Significant scope. Defer post-MVP.

**Plant sharing / social** — Not designed yet. Would require RLS changes to allow other users to read specific plant records.

**Offline support** — Currently requires network for all data. Service worker caching for the Today screen and recent plants would make this viable as a fully offline-capable PWA.

**Photo management** — No way to delete individual photos, reorder them, or designate a cover photo. The cover photo is always the most recently uploaded.

**Species profile search in Plants grid** — Currently filtered/grouped by location, status, or tag. Text search that filters by nickname or species would help larger collections.

---

## Suggested Next Priorities

1. **Password reset** — a small form, important for production readiness. Use `supabase.auth.resetPasswordForEmail()`.
2. **Storage cleanup on plant delete** — prevents orphaned files accumulating over time.
3. **Streak strip tap target** — remove the chevron or link it somewhere meaningful.
4. **"Water all overdue" quick action** — high-value for multi-plant users; can be a Today-screen button that batches inserts.
5. **Log book pagination** — server-side paginated timeline for heavy users.
6. **Plant name search in collection** — client-side filter in the Plants collection header.
7. **Add Plant Step 1 autocomplete** — wire the manual name input to `suggest-species`.

---

## SQL Migrations Needed

The following columns exist in the running DB and are reflected in `lib/types.ts`. If setting up a fresh Supabase project, run these migrations:

```sql
-- plants table additions
ALTER TABLE plants
  ADD COLUMN IF NOT EXISTS fertilizing_interval_days int,
  ADD COLUMN IF NOT EXISTS soil_type text,
  ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS pest_notes text,
  ADD COLUMN IF NOT EXISTS last_treatment_date date;

-- analysis_results health score
ALTER TABLE analysis_results
  ADD COLUMN IF NOT EXISTS health_score int CHECK (health_score BETWEEN 1 AND 5);

-- species_profiles seasonal care
ALTER TABLE species_profiles
  ADD COLUMN IF NOT EXISTS pruning_tips text,
  ADD COLUMN IF NOT EXISTS disease_symptoms text,
  ADD COLUMN IF NOT EXISTS seasonal_care text;

-- care_logs: add measured type
ALTER TABLE care_logs DROP CONSTRAINT IF EXISTS care_logs_type_check;
ALTER TABLE care_logs ADD CONSTRAINT care_logs_type_check
  CHECK (type IN ('watered','fertilized','note','repotted','pruned','misted','pest_treatment','moved','measured'));
```

---

## Session Summary — 2026-04-19

**Built this session (worktrees merged to main):**
- NavGuard component — fixes BottomNav/dock overlap on Plant Detail and Add Plant
- Plants collection enhancements — fertilizing status tracking, care filter chips, tag grouping, quick-log from grid, sort by neglected
- Plant Detail enhancements — hero photo carousel + lightbox, fertilizing schedule, expanded edit form (tags, soil type, pest notes), "Measure" care action, photo ZIP export, timeline filter tabs, health score display
- Full type system update — Plant, CareLog, AnalysisResult, SpeciesProfile all updated with new fields
- `computeFertilizingStatus`, `computeMaxStreak`, `relativeTime` utilities added
- ESLint/TypeScript build errors fixed for clean Vercel deploy

**Production:** https://viriditas-three.vercel.app/
**Test account:** uitester@viriditas.dev / Viriditas2026!
