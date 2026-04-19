# Viriditas — Current State & Priorities
_Last updated: 2026-04-18 after full code review_

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
- 39-icon single-stroke SVG set replacing all emoji in the app UI
- Shared primitives: `BigTitle`, `SectionLabel`, `Chip`, `StatusPip`, `HairlineButton`
- `PlantPhoto` deterministic warm-gradient placeholder (no cover photo = consistent hue)
- Floating pill `BottomNav` with route-aware active state
- Auth pages migrated to editorial palette (as of 2026-04-18 code review)

### Today screen (`/`)
- Server Component — 4 queries: plants, photos, care logs, streak logs
- Greeting masthead with live date, urgency subtitle
- Care streak strip (flame icon, days since first in streak)
- Overdue + due-soon task rows with quick-link to plant dock
- Horizontal collection carousel with StatusPip badges
- Journal peek card (most recent AI health assessment with attribution)
- Empty/onboarding state with feature callouts

### Plants collection (`/plants`)
- Server Component — 3 queries: plants, photos, watered logs
- 2-col photo grid + list view toggle (localStorage-free, state only)
- Group by: All / Location / Status (each group renders same Grid or List)
- StatusPip badge overlay on every card
- Empty state with add-plant CTA

### Plant Detail (`/plant/[id]`)
- Full client-side data fetching (plant + photos + care logs + analyses + last-watered)
- Hero photo (360px) with back/camera/edit buttons; falls back to PlantPhoto gradient
- Status strip: Watered days, Activity count, Photo count
- Collapsible edit form (nickname, species, location, pot, acquired date, last repotted, notes)
- AI Diagnosis card (§ 01) — runs `analyze-plant` edge function with full context
- Log book (§ 02) — merged timeline of care logs + analyses, 8 items shown
- Dossier (§ 03) — key metadata displayed as field-guide rows
- Watering schedule (§ 04) — chip picker for interval
- Species guide (§ 05) — expandable quick-facts + full profile from `fetch-species-info`
- Photo strip (§ 06) — horizontal scroll of all photos with timestamps
- Floating care dock — Water / Mist / Feed / Prune + expandable More row
- Toast notifications (slides up from dock level, 2.5s)
- Delete plant with confirmation dialog

### Add Plant (`/add-plant`)
- 3-step wizard with progress bar
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
- Full species detail view with care sections, problems, disease symptoms, toxicity, growth, propagation
- "Refresh guide" force-regenerates the cached profile via AI

### Me / Settings (`/settings`)
- Identity card (shows signed-in email)
- Sign out with confirmation
- About card with app name, version, description

### AI / Edge Functions
- `analyze-plant` — multi-context health analysis (species profile + care history + location/pot)
- `fetch-species-info` — generates + caches encyclopedic species profiles; shared across all users
- `identify-species` — lightweight photo → species name (no DB write)
- `suggest-species` — freeform query → 4–6 ranked candidate species
- All functions: Claude Haiku (`claude-haiku-4-5-20251001`); Gemini hot-swap via `AI_PROVIDER` secret

### Data layer
- `plants`, `photos`, `care_logs`, `analysis_results`, `species_profiles` tables
- Watering status computed client-side from interval + last watered timestamp
- Care streak computed from all care logs for the year (consecutive local calendar days)
- `fileToBase64` shared utility in `lib/utils.ts` (used by add-plant + explore)

---

## Known Gaps & Rough Edges

### P1 — Should fix soon

**Photo deletion not implemented**
When a plant is deleted, the row cascade removes `photos` table entries, but the underlying files in Supabase Storage at `{userId}/{plantId}/…` are orphaned. Need a Supabase database trigger or an Edge Function called on plant delete to clean up storage. SQL-only approach: a `AFTER DELETE ON plants` trigger that calls `storage.delete_objects`.

**Log book only shows 8 items; no pagination**
The timeline in Plant Detail is hard-capped at 8 entries (`timeline.slice(0, 8)`). Heavy users will lose history visibility. Options: infinite scroll, "load more" button, or paginated timeline view.

**Species profile cache not invalidated on name correction**
If the AI identifies "Monstera sp." and the user later corrects to "Monstera deliciosa" in the edit form, the species guide fetches for the corrected name — but the old "Monstera sp." profile remains in `species_profiles` forever. Minor storage leak; not a user-facing bug.

**No search in Plants collection**
With a large collection, there's no way to find a plant by name. A client-side filter input above the grid would cover this.

**No confirmation before triggering re-analyze**
The "Re-analyze" button in Plant Detail triggers an AI call immediately with no "are you sure?" gate. For cost management, a debounce or rate-limit feedback would be useful.

### P2 — Nice to have

**Category grid and Featured carousel are static placeholders**
`CATEGORIES` and `FEATURED` in `explore/page.tsx` are hardcoded arrays. They work as browse entry points but the counts ("24 species") are fake. Real implementation would either: (a) query the `species_profiles` DB for real stats, or (b) keep them as curated editorial content (simpler, fine for MVP).

**BottomNav visible on Plant Detail**
The floating care dock + BottomNav stack is cluttered on the Plant Detail screen. Plan: hide `BottomNav` when `pathname.startsWith('/plant/')`. Would require checking in `BottomNav.tsx` or the layout.

**No "Add note" shortcut from Today screen**
The Today task rows deep-link to `#quick-actions` but the anchor scroll doesn't always land at the dock. A direct "mark watered" tap from the Today screen (without navigating away) would feel faster.

**Streak strip is not tappable**
The streak strip on Today has a `chev` icon suggesting interactivity, but `onClick` is not wired. It should navigate to a streak history view, or the chevron should be removed.

**Add Plant Step 1 "Search by name" expands a text input but doesn't run suggest-species**
Users who type a name manually get no autocomplete. Wiring the manual input to `suggest-species` would close the gap between photo-based and name-based onboarding.

**Auth layout `Icon` import**
The new auth layout imports `Icon` from `@/components/Icon`. This works fine but means the Icon component is loaded on the unauthenticated route. The component is tiny so this is a non-issue.

### P3 — Future features (design decision needed)

**Push notifications** — `lib/notifications.ts` is a no-op stub. Web Push requires a service worker, VAPID keys, and a subscription management flow. Significant scope. Defer post-MVP.

**Plant sharing / social** — Not designed yet. Would require RLS changes to allow other users to read specific plant records.

**Offline support** — Currently requires network for all data. Service worker caching for the Today screen and recent plants would make this viable as a fully offline-capable PWA.

**Bulk care logging** — "Water all overdue plants" from the Today screen. Would be a significant UX win for users with large collections.

**Photo management** — No way to delete individual photos, reorder them, or designate a cover photo. The cover photo is always the most recently uploaded.

**Password reset flow** — No "forgot password" link on sign-in. Supabase supports this; just needs the UI.

**Species profile search in Plants grid** — Currently filtered/grouped by location or status. Adding text search that filters by nickname or species would help larger collections.

---

## Suggested Next Priorities

1. **Hide BottomNav on `/plant/[id]`** — small change, big visual improvement. The dock + nav overlap is the most noticeable UX debt.
2. **Log book "load more"** — a simple "Show all" toggle in the timeline avoids the 8-entry cap.
3. **Storage cleanup on plant delete** — prevents orphaned files accumulating over time.
4. **Streak strip tap target** — remove the chevron or link it somewhere meaningful.
5. **"Water all overdue" quick action** — high-value for multi-plant users; can be a Today-screen button that batches inserts.
6. **Password reset** — a small form, important for production readiness.
7. **Plant name search** — client-side filter in the Plants collection header.

---

## SQL Migrations Needed

None at this time — the current schema matches the running codebase.

The following columns exist in `species_profiles` and are used by the app:
`pruning_tips`, `disease_symptoms` — these were added in a prior phase and are referenced by both the Plant Detail species guide and the Explore species detail.

If adding bulk care logging (P3), a new table or a junction table approach would be needed.
