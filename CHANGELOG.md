# Changelog

All notable user-facing changes to Viriditas, newest first. The version number lives in
`package.json` and is shown on the Me screen; versioning rules are in
[CLAUDE.md → Versioning Convention](CLAUDE.md). Documentation-only changes don't bump the version.

## 1.5.2 — 2026-06-10

- Plants list view: the same quick-log button cluster now renders on **every** row — water is
  always loggable, feed appears whenever a fertilizing schedule exists. Urgency is shown by
  button color (solid danger/warn when due, quiet outline otherwise) instead of buttons
  appearing and disappearing per row.

## 1.5.1 — 2026-06-10

- Fixed the remaining Today hydration error (React #418): masthead date/season, greeting,
  streak-since text, the 14-day activity grid, and journal-peek relative time were computed
  from `new Date()` in the render body, so Vercel's UTC server render diverged from the
  browser's local-time render late in the day. `TodayClient` now sets `now` in a mount effect
  and renders deterministic fallbacks until it's available.
- Pattern adopted project-wide: never read the clock in the render body of a client component
  that gets server-rendered.
- Recorded that the `diagnoses`/`propagations` migrations were applied in production (2026-06-09).

## 1.5.0 — 2026-06-09

Review remediation release. Root cause of the "missing v1.4.0 features in production": an
unused-variable lint error in the Lineage screen had failed **every Vercel build since
v1.4.0**, so production was still serving v1.3.0.

**Critical**
- Fixed the lint error so deploys ship again (this release also delivered everything since
  v1.4.0, including the previously unreleased Add Plant identify-species error-UX fix from 2026-04-27).
- Middleware now whitelists `/forgot-password` and `/auth` so password-reset links work for
  signed-out users.
- Moved the Today overdue-count `localStorage` write into an effect (first hydration fix).

**Security (Edge Functions)**
- `analyze-plant`: requires `getUser()` auth; `imageUrl` restricted to this project's
  `plant-photos` storage bucket (SSRF guard).
- `fetch-species-info`: requires `getUser()` auth; AI profile fields are whitelisted
  one-by-one instead of spreading untrusted JSON into the upsert.
- `identify-species`: real `getUser()` validation (was a header-exists check); MIME type
  allowlist (jpeg/png/webp/gif).

**UX**
- Plant Detail: non-preset watering/fertilizing intervals display as the selected chip and in
  the schedule label; Care total / Streak stats in neutral ink.
- Today: streak circle shows the streak count.
- Add Plant: inline "name required" hint on Step 2; Step 3 preview tile at full opacity.
- Lineage/Time-lapse: fixed "Invalid Date" from a double-appended time suffix.
- Explore: toxicity summary no longer labels "Unsafe for cats" as pet-safe.
- New branded 404 page.

## 1.4.0 — 2026-04-25

Four new screens from the design handoff (note: due to the build failure above, these only
reached production with v1.5.0):

- **Camera** (`/camera`) — full-screen capture with confirm sheet and best-guess plant
  pre-selection; the bottom-nav camera FAB now routes here.
- **Time-lapse** (`/plant/[id]/timelapse`) — scrubbable filmstrip of a plant's photo history
  with play/pause auto-advance.
- **Diagnose** (`/plant/[id]/diagnose`) — branching question tree (≤3 levels) ending in one of
  11 verdicts with reasoning and a tap-to-complete checklist; saves to the `diagnoses` table.
- **Lineage** (`/plant/[id]/lineage`) — propagation log: cuttings, recipients, rooting status.
- Plant Detail gained the `§ 08 · Tools` strip linking to all three sub-screens.

## 1.3.0 — 2026-04-19

P1/P2 backlog session:

- Password reset flow (`/forgot-password` + `/auth` reset landing page).
- Storage cleanup on plant delete (removes all of the plant's photos from Storage).
- Re-analyze confirmation gate (confirm dialog + 3s cooldown protects AI credits).
- Species profile cache invalidation when the species name is manually corrected.
- Log book pagination (server-side ranges with "Load more").
- Quick "Add note" bottom sheet on Today; species autocomplete in Add Plant;
  Explore categories with real cached-profile counts; streak strip links to Me.

## 1.2.0 — 2026-04-19

Phase 15 — structured journaling and expanded AI context:

- Notes gain a structured category (growth / pest / environment / concern / general).
- Measurements gain structured value + unit (cm/in/mm/ft/leaves/stems/flowers/pups).
- `analyze-plant` context expanded: full species profile (pruning/disease/seasonal),
  owner notes + pest history, previous recommendations and health-score trend,
  categorized care logs and measurements, season context.

## 1.1.0 — 2026-04-18

- NavGuard (bottom nav hidden on screens with their own chrome).
- Plants collection enhancements: fertilizing status, care filter chips, tag grouping,
  quick-log from the grid, neglected sort.
- Plant Detail v2: hero carousel + lightbox, fertilizing schedule, expanded edit form
  (tags, soil type, pest notes), Measure action, photo ZIP export, timeline filters,
  health score display.

## 1.0.0 — 2026-04-18

Initial versioned release on the Next.js stack:

- Core screens: Today, Plants, Plant Detail, Add Plant, Explore, Me.
- Editorial Botanical design system (palette, type stack, icon set, primitives).
- AI Edge Functions: analyze-plant, fetch-species-info, identify-species, suggest-species.

### Pre-1.0 (March 2026)

Viriditas began as an Expo/React Native app (2026-03-26) and was rebuilt as a pure Next.js 15
web app (2026-03-30 → 04-02) with the Supabase backend carried over unchanged. The Expo
source is archived in `_expo-archive/`. See [ROADMAP.md](ROADMAP.md) for the condensed history.
