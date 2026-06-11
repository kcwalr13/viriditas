# Viriditas — Roadmap

This file is the single source of truth for **where the app stands, what's open, and what's next**.
(It absorbed the old `ROADMAP_CURRENT.md` on 2026-06-10; per-version release notes live in
[CHANGELOG.md](CHANGELOG.md), and the full task-by-task history is in git.)

**Status key:** ✅ Done · 🔄 In Progress · ⬜ Not Started

---

## Current State (v1.8.0 — June 2026)

**Live URL:** https://viriditas-three.vercel.app/
**Repo:** https://github.com/kcwalr13/viriditas (auto-deploys `main` → Vercel)

The app is fully functional end-to-end and deployed. Users can register plants (photo or
name), track care logs and growth measurements, get context-aware AI health analyses with
1–5 health scores, browse an AI-generated species encyclopedia, run a guided diagnostic
flow, build time-lapses from photo history, track propagations, and work from a Today
dashboard with urgent tasks, streaks, and bulk care actions. The Editorial Botanical design
system is applied across every screen. As of v1.6.0 the AI assistant emits structured,
reviewable next steps that flow into the Today task list (Phase 1 of
[docs/ASSISTANT-SPEC.md](docs/ASSISTANT-SPEC.md)), and species identity can be verified.

### What's built, by area

- **Core infrastructure** — Next.js 15 App Router + TypeScript + Tailwind; Supabase
  (Postgres, Auth, Storage, Edge Functions); cookie-based SSR auth via `@supabase/ssr` +
  `middleware.ts`; PWA manifest; Vercel auto-deploy. Password reset flow
  (`/forgot-password` → email → `/auth`). Custom 404 page.
- **Design system** — warm paper palette, olive accent, serif/sans/mono type stack,
  38-icon single-stroke SVG set, shared primitives, floating pill nav + camera FAB.
  See "Editorial Design System" in [CLAUDE.md](CLAUDE.md).
- **Today (`/`)** — greeting masthead, streak strip, 14-day activity grid, overdue/due-soon
  task rows with inline quick-log, "Water all"/"Feed all" bulk actions, coming-up window,
  collection carousel, quick add-note sheet, AI journal peek.
- **Plants (`/plants`)** — grid/list toggle; group by location/status/tag; care filter
  chips; urgency / A–Z / most-neglected sort; live text search; quick-log water/feed on
  every card and list row (v1.5.2); urgency-colored borders and badges.
- **Plant Detail (`/plant/[id]`)** — hero carousel + full-screen lightbox (download /
  delete / analyze any photo), status strip, AI diagnosis card with health-score trend,
  paginated log book with filters + inline note editing + CSV export, dossier with growth
  chart and insights, watering + fertilizing schedules with live status, species guide,
  photo strip with ZIP export, floating care dock with done-today indicators.
- **Sub-screens (v1.4.0)** — Camera capture + confirm sheet (`/camera`), Time-lapse
  filmstrip, Diagnose question tree (11 static verdicts → checklist), Lineage propagation
  log. Linked from the `§ 08 · Tools` strip on Plant Detail.
- **Add Plant** — 3-step wizard with AI photo identification, species autocomplete from
  cached profiles, location presets from the user's collection, optional schedules.
- **Explore** — text search with AI disambiguation grid + Wikipedia thumbnails, photo
  identification, category browsing with real cached-profile counts, recently viewed,
  deep links to/from Plant Detail.
- **Me (`/settings`)** — identity, stats (plants / logs / analyses / streak), personality
  insights, JSON data export, sign out, app version.
- **AI / Edge Functions** — `analyze-plant` (v2: structured actions + interval suggestions
  + identity context, v1.6.0), `diagnose-plant` (interactive diagnosis sessions on
  `claude-sonnet-4-6`, v1.7.0), `fetch-species-info`, `identify-species`,
  `suggest-species`. All five require a valid Supabase session (`getUser()`), hardened
  v1.5.0 (SSRF imageUrl allowlist, explicit-field upserts, MIME allowlist). Claude is the
  **sole provider** (Gemini + `AI_PROVIDER` retired v1.8.0): Haiku
  (`claude-haiku-4-5-20251001`) on the volume paths, Sonnet on diagnose-plant. Shared
  prompt-context builders live in `supabase/functions/_shared/`.
  Reference: [docs/EDGE-FUNCTIONS.md](docs/EDGE-FUNCTIONS.md).
- **AI care assistant (Phase 1, v1.6.0)** — analyses emit 0–3 structured actions + optional
  schedule suggestions → `care_recommendations` proposals → Today's "Assistant" section
  with Accept / Done (auto-logs unambiguous care types) / Dismiss-with-reason; accepted
  tasks join the task list; interval changes apply only via a confirm sheet; 14-day expiry.
  Species identity verification (Confirm chip / VERIFIED tag / verified Add Plant saves)
  feeds an identity-hedging line back into analysis prompts.
- **AI care assistant (Phase 2, v1.7.0)** — "Examine with AI" on the Diagnose screen:
  bounded multimodal diagnosis sessions (≤3 server-tracked ask-turns, then a forced
  verdict; honest Low-confidence verdicts with differentials). Verdicts write the
  `diagnoses` history and feed Phase 1's loop as proposals, including a scheduled
  follow-up check. Quick triage (static tree) retained; sessions resume for 24h.
- **AI care assistant (Phase 3 + accuracy program, v1.8.0)** — monthly seasonal schedule
  review (`lib/seasonal.ts` rules, corroborated by each species guide's seasonal-care
  prose; one proposal max per plant per care type per season; Phase 1 confirm flow);
  toxicity renders with an "AI-generated — verify with your vet" caption; species fact
  flagging (Report an issue → `species_profile_flags` → Me → Flagged facts review list).
- **Data layer** — `plants`, `photos`, `care_logs`, `analysis_results`, `species_profiles`,
  `diagnoses`, `propagations` (applied in production 2026-06-09), `care_recommendations` +
  `diagnosis_sessions` (applied 2026-06-10), `species_profile_flags` (v1.8.0 —
  **migration pending production**). Schema reference: [docs/DATABASE.md](docs/DATABASE.md).

---

## Open Items

### Housekeeping / security

| Item | Status | Notes |
|---|---|---|
| Test account credential in git history | ✅ | The old `ROADMAP_CURRENT.md` contained the `uitester` test-account credential in plaintext; it remains in git history even though the file is deleted. **Closed as accepted risk (Kyle, 2026-06-10):** it's a placeholder test account, the repo is private, and exposure doesn't matter. Do not re-flag in future reviews. Revisit only if the repo gains collaborators or goes public; keep future credentials out of the repo regardless. |
| Re-enable Supabase email confirmation | ⬜ | Disabled for development convenience; required before sharing with real users. |
| Apply the `care_recommendations` migration in production | ✅ | Applied 2026-06-10 (verified: 14 columns, RLS on, 1 policy). |
| Apply the `diagnosis_sessions` migration + deploy v1.7.0 functions | ✅ | Migration applied 2026-06-10 (verified: 10 columns, RLS on, 1 policy). |
| Apply the `species_profile_flags` migration + deploy v1.8.0 functions | ⬜ | **Required for v1.8.0.** Run the `species_profile_flags` DDL from [docs/DATABASE.md](docs/DATABASE.md); **redeploy `analyze-plant` and `fetch-species-info`** (Gemini branches removed). Optionally `supabase secrets unset AI_PROVIDER GEMINI_API_KEY`. Until the migration runs, fact flagging shows a friendly error; everything else works. |
| Verify / apply `is_name_verified` migration | ✅ | Column confirmed live in production 2026-06-10 (boolean, default false); v1.6.0 shipped the code that reads/writes it (dossier Confirm chip, manual edits, Add Plant, analysis identity context). |
| Tag releases in git | ⬜ | Versions exist in `package.json`/CHANGELOG but there are no git tags. Optional, cheap, useful. |

### Near-term feature candidates

| Item | Status | Notes |
|---|---|---|
| Camera Diagnose / Identify modes | ✅ v1.10.0 | All three pills work: Diagnose hands the capture to the plant's "Examine with AI" session as the opening photo; Identify runs `identify-species` with Add-Plant-style confirm/correct (verified on confirm, or `?species=` wizard pre-fill). Client-only — no schema/function changes. |
| Cover photo designation + reordering | ⬜ | Cover photo is always the most recent upload. Individual photo *delete* exists (lightbox + strip); choosing/reordering does not. |
| AI-assisted Diagnose | ✅ | Shipped v1.7.0 as full interactive sessions (`diagnose-plant`) — beyond the original "pass answers to analyze-plant" idea. The static tree remains as Quick triage. |
| Lineage v2 — link child plants | ⬜ | `propagations.child_plant_id` is already nullable-ready; UI to link a propagation to a registered plant (and render a real graph) is unbuilt. |
| Hemisphere setting | ⬜ | Season context passed to the AI hardcodes `northern`, and `lib/seasonal.ts` (v1.8.0) derives seasons the same way; southern-hemisphere users get inverted seasonal advice and proposals. |
| Per-plant streak / streak history view | ⬜ | Streak strip currently links to Me; a dedicated history view was the intended destination. |

### Larger / post-MVP

| Item | Status | Notes |
|---|---|---|
| Web push notifications | ✅ v1.9.0 | Shipped as assistant Phase 4: Me → Care reminders opt-in, `public/sw.js`, `push_subscriptions` table, `send-care-push` daily digest via pg_cron. Manual setup steps (migration, VAPID/CRON_SECRET secrets, cron SQL) in [docs/SETUP.md](docs/SETUP.md). |
| Offline support | ⬜ | All data requires network. Service-worker caching of Today + recent plants would make the PWA genuinely offline-capable. |
| Plant sharing / social | ⬜ | Not designed. Requires RLS changes to let other users read specific records. |
| Native builds (app stores) | ⬜ | Deliberately deferred since the March 2026 Expo→Next.js pivot; would be a new effort, not a resurrection of the archived Expo code. |

---

## Development History (condensed)

Full detail: [CHANGELOG.md](CHANGELOG.md) per version, git log per commit.

- **2026-03-26 → 03-29 — Expo era.** Original build as an Expo/React Native app:
  auth, plant registry, photos, care logs, AI analysis via Edge Functions, species
  profiles, watering reminders, settings. Source preserved in `_expo-archive/`.
- **2026-03-30 → 04-02 — Next.js migration.** Pivot to pure web (Next.js 15 + PWA);
  database and Edge Functions unchanged. Fixed Vercel deploy issues (ua-parser-js
  `__dirname` patch; framework preset/output dir corrections). Live and verified.
- **2026-04-03 — Critical UX round.** Care-action toasts, first-time-user empty states,
  PWA install verification, Plant Encyclopedia (Explore) with search disambiguation.
- **2026-04-18 — Editorial Botanical redesign (v1.0.0).** Full visual overhaul of every
  screen; Today home, single-scroll Plant Detail, 3-step Add Plant wizard, field-guide
  Explore, Me tab; design tokens, fonts, icon set; auth pages restyled.
- **2026-04-18 → 04-19 — Depth build-out (v1.1.0–v1.3.0).** ~130 micro-phases: fertilizing
  schedules, tags, health-score trends, measurements + structured journaling with expanded
  AI context (Phase 15), bulk actions, CSV/ZIP/JSON exports, pagination, password reset,
  storage cleanup on delete, Explore categories with real counts, and dozens of polish items.
- **2026-04-25 — Design handoff screens (v1.4.0).** Camera, Time-lapse, Diagnose, Lineage;
  camera FAB; `§ 08 · Tools` strip on Plant Detail.
- **2026-06-09 → 06-10 — Review remediation (v1.5.0–v1.5.2).** Fixed the lint error that had
  silently broken every Vercel build since v1.4.0 (production had been stuck on v1.3.0);
  Edge Function auth + SSRF/cache-poisoning/MIME hardening; middleware whitelist for
  password-reset routes; Today hydration fixes (no `new Date()` in SSR'd render bodies);
  `diagnoses`/`propagations` migrations applied in production; quick-log consistency on
  Plants list; custom 404.
- **2026-06-10 — AI care assistant Session A (v1.6.0).** Phase 1 of
  [docs/ASSISTANT-SPEC.md](docs/ASSISTANT-SPEC.md): structured actions from `analyze-plant`
  v2 flow into the new `care_recommendations` table and the Today task loop
  (Accept/Done/Dismiss, interval confirm sheet, 14-day expiry), plus the Phase 5 species
  identity verification slice.
- **2026-06-10 — AI care assistant Session B (v1.7.0).** Phase 2, the flagship:
  interactive diagnosis sessions via the new `diagnose-plant` Edge Function
  (`claude-sonnet-4-6`) — bounded ask-back loop (≤3 turns), honest uncertainty, verdicts
  into `diagnoses` + Today proposals; Diagnose screen reworked around "Examine with AI";
  shared `_shared/plant-context.ts` extraction.
- **2026-06-11 — AI care assistant Session C (v1.8.0).** Phase 3 + the rest of Phase 5:
  monthly seasonal schedule proposals (prose-corroborated heuristics in
  `lib/seasonal.ts`, silence over noise); toxicity caution captions; Gemini +
  `AI_PROVIDER` retired (Claude sole provider, decision #1); species fact flagging
  (`species_profile_flags` + Report-an-issue sheet + Me → Flagged facts).
- **2026-06-11 — AI care assistant Session D (v1.9.0).** Phase 4, the final phase: web
  push care reminders. Per-device opt-in under Me → Care reminders (`push_subscriptions`
  table + `public/sw.js`), and the `send-care-push` Edge Function — a pg_cron-invoked
  daily digest (max one push/user/day, silent on quiet days, deep-link to Today) of
  overdue care + due assistant tasks, sent via web-push/VAPID and authenticated with a
  dedicated `CRON_SECRET` header. The assistant spec is now fully implemented.
- **2026-06-11 — Camera modes (v1.10.0).** The `/camera` Diagnose and Identify pills
  wired (Snap was already live): Diagnose → capture becomes the opening photo of an
  "Examine with AI" session; Identify → `identify-species` with the Add Plant
  confirm/correct affordance (verified species on confirm, or wizard pre-fill).
  Client-only session.

### Key decisions log

- **2026-03-26** — Tech stack: Supabase + Claude API (originally with Expo).
- **2026-03-27** — AI provider switched from Gemini (dev quota issues) to Claude
  (`claude-haiku-4-5`); Edge Functions kept provider-swappable via `AI_PROVIDER`.
  *(Superseded 2026-06-11: the swap path was never used again and was retired in
  v1.8.0 — Claude is the sole provider; see docs/ASSISTANT-SPEC.md decision #1.)*
- **2026-03-27** — Species data comes from Claude, not a third-party plant API: no catalog
  paywalls, covers any species, cached once per species globally in `species_profiles`.
- **2026-03-30** — **Architecture pivot: Expo → Next.js 15.** App was already used via
  browser; dropping React Native removed dual code paths and native build complexity.
  Database, RLS, Storage, and Edge Functions carried over unchanged.
- **2026-04-03** — Text search always shows a disambiguation grid before fetching a full
  profile; photo search skips it (the photo already pins the species).
- **2026-04-18** — Redesign shipped as "option 2" scope: full visual overhaul + Today home,
  but no Rooms schema and no AI Journal table (journal peek reuses latest analysis text).
- **2026-04-19** — Phase 15 journaling fields are nullable with no backfill: legacy notes
  stay uncategorized rather than being mislabeled as deliberately tagged.
- **2026-06-09** — v1.4.0's "missing features in production" were a deploy failure, not a
  code problem — root-caused to an unused-variable lint error failing every Vercel build.
  Lesson recorded: check the Vercel dashboard after pushing, not just the code.
