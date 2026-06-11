# Changelog

All notable user-facing changes to Viriditas, newest first. The version number lives in
`package.json` and is shown on the Me screen; versioning rules are in
[CLAUDE.md → Versioning Convention](CLAUDE.md). Documentation-only changes don't bump the version.

## 1.9.0 — 2026-06-11

Care reminders (web push) — Session D (Phase 4, the final phase) of
[docs/ASSISTANT-SPEC.md](docs/ASSISTANT-SPEC.md). The assistant can now reach out.

- **Care reminders opt-in** under **Me → Care reminders:** turn on per device; the
  browser asks for notification permission and the subscription is saved to the new
  `push_subscriptions` table (migration must be run in production). Turning off revokes
  the browser subscription and deletes the row. The card explains the iOS caveat: add
  Viriditas to your Home Screen first — iOS only delivers notifications to the
  installed app.
- **Daily digest:** the new `send-care-push` Edge Function (no AI; invoked by
  pg_cron + pg_net daily at 13:00 UTC ≈ 9 am Eastern) finds, per subscribed user,
  overdue watering/feeding plus assistant tasks due (including diagnosis follow-up
  checks) and sends one push — e.g. "2 plants need you 🌿 · Water Mabel · Recheck lower
  leaves (Big Fern)" — deep-linking to Today. Hard rules: max one push per user per day,
  nothing at all on quiet days. Dead subscriptions (revoked endpoints) self-prune.
- **New service worker** (`public/sw.js`) — push + notification-click only, no offline
  caching. `lib/notifications.ts` graduates from a no-op stub to the real
  subscribe/revoke helpers.
- **Security:** `send-care-push` has no user JWT — it requires a dedicated
  `CRON_SECRET` header and fails closed when unconfigured. VAPID keys live only in
  Supabase secrets; the client uses the public key via `NEXT_PUBLIC_VAPID_PUBLIC_KEY`.
- **Manual steps required** (see [docs/SETUP.md](docs/SETUP.md) steps 4–5): run the
  `push_subscriptions` migration, generate VAPID keys + `CRON_SECRET`, set the Supabase
  secrets and the `NEXT_PUBLIC_VAPID_PUBLIC_KEY` env var (local + Vercel), deploy the
  function, and schedule the pg_cron job.

## 1.8.0 — 2026-06-11

Adaptive schedules + accuracy program — Session C (Phase 3 + the rest of Phase 5) of
[docs/ASSISTANT-SPEC.md](docs/ASSISTANT-SPEC.md).

- **Seasonal schedule review (Phase 3):** when the month rolls over, Today generates
  local (non-AI) schedule proposals from each scheduled plant's cached species-guide
  `seasonal_care` prose + the current season (e.g. winter → stretch watering ~40%,
  pause-feeding signals → double the fertilizing interval, summer → tighten watering).
  Heuristics live in `lib/seasonal.ts` as a commented rules table; a proposal is emitted
  only when the species guide corroborates the direction — no prose, no proposal.
  At most one proposal per plant per care type per season; dismissing suppresses that
  plant+type until next season; accepting goes through the existing confirm sheet.
- **Toxicity caution line (Phase 5):** wherever toxicity renders (Plant Detail species
  guide, Explore species profile), a one-line mono caption now states: "AI-generated —
  verify with your vet for pet-critical decisions." Honest authority over implied authority.
- **Gemini retired (Phase 5, spec decision #1):** the Gemini branches and the
  `AI_PROVIDER` switch were removed from `analyze-plant` and `fetch-species-info` —
  Claude is the sole provider (both functions need a redeploy). The `AI_PROVIDER` and
  `GEMINI_API_KEY` Supabase secrets can be unset; git history preserves the old paths.
- **Species fact flagging (Phase 5):** new `species_profile_flags` table (migration must
  be run in production) + a "Report an issue" sheet on the Plant Detail species guide
  (per-section flag affordances + a general link) and Explore profiles — pick the field
  that looks wrong, optionally say why. Reports collect under **Me → Flagged facts**
  for review and can be resolved there. No auto-correction — the shared species cache
  only changes through deliberate review.

## 1.7.0 — 2026-06-10

Interactive AI diagnosis sessions — Session B (Phase 2, the flagship) of
[docs/ASSISTANT-SPEC.md](docs/ASSISTANT-SPEC.md).

- **"Examine with AI"** on the Diagnose screen: a bounded, multimodal diagnostic session.
  The new `diagnose-plant` Edge Function (Claude Sonnet, `claude-sonnet-4-6`) reads the
  plant's full history server-side — species profile with disease signatures, care logs,
  prior analyses and diagnoses, schedules, identity status — plus the session transcript
  and photos, and replies with exactly one of: a question (with tappable answer options),
  a specific photo request (with the reason it's needed), or a verdict.
- **Hard honesty rules, server-enforced:** at most 3 ask-turns per session (`ask_count`
  tracked server-side, never trusted from the client); at the cap the model is shown a
  verdict-only contract. Insufficient information yields an honest Low-confidence verdict
  with a differential ("if X doesn't improve, the alternative is Y") and safe next steps —
  never fabricated certainty.
- **Verdicts feed the Phase 1 loop:** the function writes the verdict into the existing
  `diagnoses` history; the client turns each next step into a proposed recommendation on
  Today, plus a scheduled follow-up check ("recheck in N days").
- **Session photos stay out of the journal:** uploaded under a dedicated
  `…/diagnosis/…` storage folder, never inserted into the `photos` table, so Timelapse
  and the photo strip stay clean. The function only accepts photo paths inside the
  caller's own diagnosis folder (the SSRF guard, adapted to storage paths).
- **Resume/abandon:** navigating away keeps the session active; reopening Diagnose offers
  "Resume examination" for up to 24 hours, after which the session is marked abandoned.
- The static question tree remains as **"Quick triage — common issues"**, and the Diagnose
  landing now shows a **Past examinations** history (AI and triage runs, tagged).
- New `diagnosis_sessions` table (migration must be run in production); the
  plant-context prompt sections were extracted to `supabase/functions/_shared/` so
  analyze-plant and diagnose-plant share one context builder (redeploy `analyze-plant`).

## 1.6.0 — 2026-06-10

AI care assistant, Phase 1 (structured actions) + Phase 5 identity slice — Session A of
[docs/ASSISTANT-SPEC.md](docs/ASSISTANT-SPEC.md).

**The insight→task loop**
- New `care_recommendations` table (migration must be run in production — see
  docs/DATABASE.md): every AI analysis can now emit 0–3 structured next steps and an
  optional schedule-change suggestion, stored as reviewable proposals.
- `analyze-plant` v2 (redeploy required): additive response contract — `actions`
  (imperative step + rationale + urgency + due-in-days, sanitized server-side) and
  `interval_suggestion`. Existing fields and old analyses render unchanged. The prompt
  is told to emit zero actions for a healthy plant rather than inventing work.
- Today gains an **Assistant — proposed** section: each card shows the plant, the action,
  an urgency chip, a collapsible "Why?" rationale, and Accept / Done / Dismiss controls
  (Dismiss captures a reason: not right / already done / later).
- Accepted recommendations join the main task list (sorted above interval tasks of equal
  urgency, with due-date labels) and can be completed or dismissed inline. Completing an
  action with an unambiguous care type (water/feed/mist/prune/pest/move) auto-writes the
  matching care log, noted "via assistant".
- Accepting a schedule suggestion opens a confirm sheet ("Watering: every 7d → every 10d"
  + the AI's reason); nothing changes until Confirm is tapped.
- Plant Detail renders the same action rows inline in the AI diagnosis card (read-only
  status once resolved).
- Proposals not acted on within 14 days expire automatically on Today load.

**Species identity verification (Phase 5 P0 slice)**
- Plant Detail dossier: unverified species rows show a quiet Confirm chip (plus an
  "AI-identified" tag when the name came from analysis); confirming copies the name onto
  the plant and marks it verified. Verified rows show a small mono VERIFIED tag.
- Manual species edits set the verified flag; clearing the species clears it.
- Add Plant: the AI match now says "AI-identified — tap Confirm, or correct it by name
  below", and any species saved from the wizard (confirmed or typed) starts verified.
- `analyze-plant` receives an identity line so the model hedges species-specific claims
  when the name is AI-assumed, and flags photo/species mismatches.

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
