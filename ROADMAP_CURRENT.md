# Viriditas — Current State & Priorities
_Last updated: 2026-04-19 after P1/P2 backlog session_

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

### P1 — Should fix soon ✅ All resolved 2026-04-19

~~**Photo deletion not implemented**~~ → **Fixed.** `handleDelete` now lists and removes all files from `plant-photos/{userId}/{plantId}/` before deleting the plant row.

~~**Log book only shows items with no real pagination**~~ → **Fixed.** Log book now uses server-side `.range(0, 19)` with a "Load more · N remaining" button. `totalCareLogs` count tracked separately.

~~**Species profile cache not invalidated on name correction**~~ → **Fixed.** When the user saves an edited species name in the edit form, `speciesProfile` state is cleared so the profile is re-fetched for the corrected name. `is_name_verified?: boolean` added to `Plant` type for future DB-level tracking (migration pending — see SQL block below).

~~**No confirmation before triggering re-analyze**~~ → **Fixed.** `handleAnalyzeClick()` wrapper shows `window.confirm` and sets a 3s `analyzeGated` cooldown. All three analyze button call-sites updated.

~~**Password reset flow**~~ → **Fixed.** `/forgot-password` page sends reset email via `resetPasswordForEmail`. `/auth?mode=reset` page exchanges the PKCE code and lets the user set a new password. "Forgot password?" link added to sign-in.

### P2 — Nice to have ✅ All resolved 2026-04-19

~~**Category grid and Featured carousel are static placeholders**~~ → **Improved.** Categories renamed to botanically accurate terms (Tropical, Succulents & Cacti, Ferns & Mosses, Trailing vines, Flowering, Low light). Each card now shows a real count from `species_profiles` (matching on keyword ilike). Click triggers `suggest-species` search with a refined `searchQuery` field (not just the display name).

~~**No "Add note" shortcut from Today screen**~~ → **Fixed.** "+ Note" action added to the "Your collection" section header. Tapping opens a bottom sheet with plant picker (dropdown of all user plants), note textarea, optional category chips (growth/pest/environment/concern/general), and a "Save note" button.

~~**Streak strip is not tappable**~~ → **Fixed.** Streak strip `<Link>` target changed from `/plants` to `/settings` (Me screen), which is the right destination for personal stats until a dedicated streak history view exists.

~~**Add Plant Step 1 "Search by name" has no autocomplete**~~ → **Fixed.** Manual species input now has a debounced (300ms) autocomplete that queries `species_profiles.species_name ilike %query%` as the user types. Matching cached species names appear in a dropdown; tapping one fills the input.

~~**Bulk care logging**~~ → **Already implemented** (from previous session). "Water all · N" and "Feed all · N" bulk buttons appear on the Today screen when ≥2 plants are overdue.

### P3 — Future features (design decision needed)

**Push notifications** — `lib/notifications.ts` is a no-op stub. Web Push requires a service worker, VAPID keys, and a subscription management flow. Significant scope. Defer post-MVP.

**Plant sharing / social** — Not designed yet. Would require RLS changes to allow other users to read specific plant records.

**Offline support** — Currently requires network for all data. Service worker caching for the Today screen and recent plants would make this viable as a fully offline-capable PWA.

**Photo management** — No way to delete individual photos, reorder them, or designate a cover photo. The cover photo is always the most recently uploaded.

**Species profile search in Plants grid** — Currently filtered/grouped by location, status, or tag. Text search that filters by nickname or species would help larger collections.

---

## Suggested Next Priorities

1. **Plant name search in collection** — client-side filter in the Plants collection header.
2. **Photo management** — delete individual photos, designate cover photo, reorder.
3. **is_name_verified migration** — run `ALTER TABLE plants ADD COLUMN IF NOT EXISTS is_name_verified boolean DEFAULT false;` on Supabase, then wire it to the edit save handler for DB-level tracking.
4. **Individual photo delete** — currently no way to delete a specific photo from the photo strip.
5. **Push notifications** — service worker + VAPID + subscription management flow. Significant scope; post-MVP.

---

## SQL Migrations Needed

> **P1/P2 session (2026-04-19) — new migration:**
> ```sql
> -- is_name_verified: set true when user manually edits species name in edit form.
> -- Enables future DB-level cache invalidation logic.
> ALTER TABLE plants ADD COLUMN IF NOT EXISTS is_name_verified boolean DEFAULT false;
> ```



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

-- Phase 15 — structured journaling fields on care_logs (Gaps 4 & 6)
ALTER TABLE care_logs
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS measurement_value numeric,
  ADD COLUMN IF NOT EXISTS measurement_unit text;

ALTER TABLE care_logs DROP CONSTRAINT IF EXISTS care_logs_category_check;
ALTER TABLE care_logs ADD CONSTRAINT care_logs_category_check
  CHECK (category IS NULL OR category IN ('growth','pest','environment','concern','general'));

ALTER TABLE care_logs DROP CONSTRAINT IF EXISTS care_logs_measurement_unit_check;
ALTER TABLE care_logs ADD CONSTRAINT care_logs_measurement_unit_check
  CHECK (measurement_unit IS NULL OR measurement_unit IN ('cm','in','mm','ft','leaves','stems','flowers','pups'));

CREATE INDEX IF NOT EXISTS idx_care_logs_plant_category
  ON care_logs (plant_id, category)
  WHERE category IS NOT NULL;
```

> **Note:** All Phase 15 columns are nullable with no default. Legacy `note` rows render without a category badge; legacy `measured` rows keep their free-text in `notes` and display unchanged. Backfilling 'general' to existing notes is intentionally avoided — it would mislead the AI into treating uncategorized observations as deliberately tagged.

---

## Session Summary — 2026-04-19

**Built this session (worktrees merged to main):**
- NavGuard component — fixes BottomNav/dock overlap on Plant Detail and Add Plant
- Plants collection enhancements — fertilizing status tracking, care filter chips, tag grouping, quick-log from grid, sort by neglected
- Plant Detail enhancements — hero photo carousel + lightbox, fertilizing schedule, expanded edit form (tags, soil type, pest notes), "Measure" care action, photo ZIP export, timeline filter tabs, health score display
- Full type system update — Plant, CareLog, AnalysisResult, SpeciesProfile all updated with new fields
- `computeFertilizingStatus`, `computeMaxStreak`, `relativeTime` utilities added
- ESLint/TypeScript build errors fixed for clean Vercel deploy

**Phase 15 — Journal & AI context expansion (this session):**
- **Gap 1:** `analyze-plant` now sends `pruning_tips`, `disease_symptoms`, `seasonal_care` from species profile
- **Gap 2:** `plant.notes`, `pest_notes`, `last_treatment_date` now reach the AI as `plantContext`
- **Gap 3:** Previous analyses now pass their `care` recommendations back so the AI can reflect on whether owners followed prior advice
- **Gap 4:** Notes get a structured `category` (growth / pest / environment / concern / general) — replaces the freeform "condition" mood chips
- **Gap 5:** `health_score` now travels in `previousAnalyses` so the AI can describe trend; sparkline UI in the Diagnosis card was already in place
- **Gap 6:** `measured` logs gain structured `measurement_value` + `measurement_unit` (cm/in/mm/ft/leaves/stems/flowers/pups) for true growth-rate tracking
- Timeline renderer shows category badges on notes and value pills on measurements
- CSV export expanded to include category, measurement, unit columns
- New SQL migration block above (run on Supabase before deploying)

**Production:** https://viriditas-three.vercel.app/
**Test account:** uitester@viriditas.dev / Viriditas2026!

---

## Session Summary — 2026-04-19 (P1/P2 Backlog)

**P1 — All 5 items resolved:**
- Password reset flow: `/forgot-password` + `/auth?mode=reset` pages, "Forgot password?" link on sign-in
- Storage cleanup on plant delete: lists and removes all storage files before deleting the plant row
- Re-analyze confirmation gate: `window.confirm` + 3s debounce prevents accidental AI credit spend
- Species cache invalidation: clearing `speciesProfile` state on manual species name edit
- Log book pagination: server-side `.range()` with "Load more · N remaining" button

**P2 — All 5 items resolved (P2-6 was already done):**
- Quick "Add note" from Today: bottom sheet with plant picker, note textarea, category chips
- Streak strip chevron: now links to `/settings` (Me screen) rather than `/plants`
- Add Plant autocomplete: debounced `species_profiles` ilike search with inline dropdown
- Explore category grid: better category names, real cached-species counts, accurate search queries
- Bulk water-all: already implemented (verified unchanged)

**SQL migration to run on Supabase:**
```sql
ALTER TABLE plants ADD COLUMN IF NOT EXISTS is_name_verified boolean DEFAULT false;
```
