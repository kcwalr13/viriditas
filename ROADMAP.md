# Viriditas — Development Roadmap

## Overview
Viriditas is a houseplant care web app — runs in any browser, installable as a PWA on Android
and iOS. Backend: Supabase (PostgreSQL, Auth, Storage, Edge Functions). AI: Anthropic Claude API.
Frontend: **Next.js 15** (migrated from Expo/React Native in March 2026).

**Status key:** ✅ Done · 🔄 In Progress · ⬜ Not Started

---

## Phase M — Next.js Migration 🔄
**Decision (2026-03-30):** Pivot from Expo (React Native) to Next.js 15 (pure web app).
The app was already deployed as a web app on Vercel. Removing the React Native layer
eliminates dual code paths, native build complexity, and platform-specific workarounds.
Users access the app via browser on any device and can install it as a PWA.

The Supabase database schema, RLS policies, Storage setup, and Edge Functions are **identical**
and required zero changes. All prior feature work (plant registry, AI analysis, care logs,
species profiles, etc.) is preserved in the new stack.

**What changes:** The frontend only. React Native components → HTML + Tailwind. Expo Router →
Next.js App Router. AsyncStorage → Supabase SSR cookie-based auth. `EXPO_PUBLIC_` env vars →
`NEXT_PUBLIC_`.

---

### Phase M1 — Bootstrap ✅
Initialize the Next.js project and verify the Supabase connection end-to-end.

| Task | Status |
|---|---|
| Archive Expo source in `_expo-archive/` | ✅ |
| Initialize Next.js 15 with TypeScript, Tailwind CSS, App Router | ✅ |
| Install `@supabase/ssr` and configure browser + server clients | ✅ |
| Configure Tailwind with brand color (#2d6a4f) | ✅ |
| `middleware.ts` — protect all `/(app)` routes, redirect to sign-in | ✅ |
| Deploy empty shell to Vercel, confirm build passes | ✅ |
| Add `NEXT_PUBLIC_` env vars in Vercel dashboard | ✅ |

---

### Phase M2 — Auth ✅
Sign-in and sign-up pages, protected route layout.

| Task | Status |
|---|---|
| `app/(auth)/sign-in/page.tsx` — email/password sign in | ✅ |
| `app/(auth)/sign-up/page.tsx` — email/password sign up | ✅ |
| `app/(auth)/layout.tsx` — centered card layout for auth pages | ✅ |
| `app/(app)/layout.tsx` — protected shell with bottom nav | ✅ |
| Auth state reflected correctly across navigation | ✅ |

---

### Phase M3 — My Plants ✅
The main grid screen with urgency sorting, banners, and care streak.

| Task | Status |
|---|---|
| Fetch plants with cover photos and latest care log (3 queries) | ✅ |
| 2-column photo grid (Tailwind CSS grid) | ✅ |
| Watering status badges (overdue / due-soon / good) | ✅ |
| Urgency sort (overdue → due-soon → good → unset) | ✅ |
| Attention banners (overdue red, due-soon amber, all-clear green) | ✅ |
| Care streak chip (🌿 Today / 🔥 N-day streak) | ✅ |
| Empty state with welcoming copy | ✅ |

---

### Phase M4 — Add Plant ✅
Form for registering a new plant.

| Task | Status |
|---|---|
| Nickname, species, location, notes text inputs | ✅ |
| Native date picker for acquisition date (`<input type="date">`) | ✅ |
| Supabase insert + redirect to new plant detail | ✅ |

---

### Phase M5 — Plant Detail ✅
Three-tab layout: Overview, History, Species.

| Task | Status |
|---|---|
| Tab navigation (Overview / History / Species) | ✅ |
| Overview: hero photo carousel, quick-action care buttons, latest analysis card, watering reminder section, plant metadata | ✅ |
| History: unified timeline of care logs + analyses, newest first | ✅ |
| Species: full species profile from `species_profiles` table | ✅ |
| Edit plant form (all fields, native date pickers) | ✅ |
| Delete plant (with confirmation) | ✅ |

---

### Phase M6 — Photo Upload ✅
Camera and file-picker based photo upload to Supabase Storage.

| Task | Status |
|---|---|
| `<input type="file" accept="image/*" capture="environment">` | ✅ |
| Upload to Supabase Storage + insert into `photos` table | ✅ |
| Photo gallery in hero carousel on Overview tab | ✅ |

---

### Phase M7 — AI Analysis ✅
Trigger analysis from Plant Detail, show results, auto-fetch species profile.

| Task | Status |
|---|---|
| "Analyze Plant" button calls `analyze-plant` Edge Function | ✅ |
| Analysis results saved and displayed | ✅ |
| Species profile auto-fetched after first AI identification | ✅ |
| "Refresh species info" button | ✅ |

---

### Phase M8 — Settings ✅
Account management screen.

| Task | Status |
|---|---|
| `app/(app)/settings/page.tsx` — email display, sign out, about | ✅ |
| Sign out: POST to Route Handler → supabase.auth.signOut() → redirect | ✅ |

---

### Phase M9 — PWA ⬜
Make the app installable as a home screen icon on Android and iOS.

| Task | Status |
|---|---|
| `public/manifest.json` — name, icons, theme color, display: standalone | ⬜ |
| App icons at required sizes (192×192, 512×512) | ⬜ |
| `<link rel="manifest">` in root layout | ⬜ |
| Verify "Add to Home Screen" prompt on Android Chrome | ⬜ |
| Verify "Add to Home Screen" works on iOS Safari (iOS 16.4+) | ⬜ |

---

## Phase 11 — Critical UX Fixes 🔄
These carry forward from the Expo era. They are needed before the app is
ready to share with real users. Phases 11A–11C were completed in the Expo era
and need to be re-implemented in the Next.js rewrite where applicable.

---

### Phase 11D — Care Action Feedback ⬜
Tapping a care action (Watered, Fertilized, etc.) logs silently with no visual
confirmation. In a habit-forming app, the feedback is the reward.

| Task | Status |
|---|---|
| Toast/snackbar notification after logging any care action | ⬜ |
| Update watering badge immediately after logging "watered" (optimistic update) | ⬜ |

---

### Phase 11E — First-Time User Experience ⬜
A new user sees an empty grid with no context about what Viriditas does.

| Task | Status |
|---|---|
| Richer empty state: explain what Viriditas does and what to expect | ⬜ |
| After "Add Plant" succeeds, navigate directly to that plant's detail | ⬜ |
| On first visit to a plant with no photos, show prominent "Add a photo to unlock AI analysis" | ⬜ |

---

## Phase 12 — Depth & Botanical Intelligence ⬜
These features make the app meaningfully better for anyone who takes plant care seriously.

---

### Phase 12A — Health Score & Trend Tracking ⬜
| Task | Status |
|---|---|
| Add `health_score` (integer 1–5) to `analysis_results` table | ⬜ |
| Update `analyze-plant` prompt to return a numeric health score | ⬜ |
| Display score badge on each analysis card in History tab | ⬜ |
| Health trend sparkline on Overview (requires 3+ analyses) | ⬜ |

---

### Phase 12B — Fertilizing Reminder ⬜
| Task | Status |
|---|---|
| Add `fertilizing_interval_days` column to `plants` table | ⬜ |
| Fertilizing reminder UI on Plant Detail (interval selector) | ⬜ |
| Show fertilizing status badge on plant cards | ⬜ |
| Include fertilizing urgency in the My Plants urgency sort | ⬜ |

---

### Phase 12C — Soil Type Field ⬜
| Task | Status |
|---|---|
| Add `soil_type` column to `plants` table | ⬜ |
| Soil type field in Add Plant + Edit form | ⬜ |
| Pass `soil_type` to `analyze-plant` Edge Function as plantContext | ⬜ |

---

### Phase 12D — Photo Management ⬜
| Task | Status |
|---|---|
| Delete photo option (confirm before delete) | ⬜ |
| Side-by-side photo comparison (select any two from history) | ⬜ |

---

### Phase 12E — Seasonal Awareness ⬜
| Task | Status |
|---|---|
| Pass current month/hemisphere to `analyze-plant` for seasonal advice | ⬜ |
| Winter mode banner (Nov–Feb, northern hemisphere) suggesting interval review | ⬜ |
| Seasonal care notes added to `fetch-species-info` prompt | ⬜ |

---

## Phase 13 — Power User & Scale Features ⬜
These matter once users have 10+ plants and have been using the app daily for weeks.

| Feature | Notes |
|---|---|
| Search and filter on My Plants screen | Filter by room, species, watering status |
| Plant tagging / grouping | Group by room, light level, or custom tag |
| Multi-plant care summary | "All upcoming care" view across the whole collection |
| Photo export | Download all photos for a plant as a zip |
| Plant diary | Free-text journal entries distinct from care logs |
| Pest/treatment detail fields | Which pest, what product, how many applications |
| Web Push Notifications | Watering reminders via Web Push API (Android Chrome first; iOS requires home screen install) |

---

## Notes & Decisions Log
- **2026-03-26** — Tech stack chosen: Expo + Supabase + Anthropic Claude API
- **2026-03-26** — Developer is on Mac, testing on Android
- **2026-03-26** — Foundation complete, Supabase connection verified
- **2026-03-26** — Auth complete: sign up, sign in, sign out, auth-gated navigation all working
- **2026-03-26** — Plant registry complete: plants table, My Plants list, Add Plant, Plant Detail with edit/delete
- **2026-03-26** — Auth gate fix: switched from useSegments() to pure session-based routing for Expo Router 6 compatibility
- **2026-03-26** — Photos complete: camera + library picker, Supabase Storage upload, photo gallery on Plant Detail screen
- **2026-03-26** — Upload fix: blob.arrayBuffer() not supported in React Native; use base64: true in ImagePicker options instead
- **2026-03-27** — Phase 5 complete: AI analysis working end-to-end using Claude API (claude-haiku-4-5-20251001). Switched from Gemini (quota issues) to Claude. Edge Function deployed with --no-verify-jwt flag; JWT is passed explicitly from the app via session.access_token.
- **2026-03-27** — Phase 7 complete: per-plant watering reminders with 5 preset intervals; stored in plants.watering_interval_days; notification ID stored in AsyncStorage. NOTE: AsyncStorage/push notifications are Expo-only and not carried forward to the Next.js rewrite. Interval display and in-app badge are fully preserved.
- **2026-03-27** — Phase 8 complete: species_profiles table created; fetch-species-info Edge Function deployed; species profile auto-fetched after first analysis; displayed on Plant Detail; passed as context into analyze-plant for species-aware health assessments.
- **2026-03-28** — Phase 10 complete: Visual photo grid, Plant Detail tab restructure (Overview/History/Species), richer care log types and plant fields, Today View with urgency sorting and care streak.
- **2026-03-29** — Phase 11A–11C complete: Notification sync (Expo-only, not in Next.js rewrite), Settings screen, date pickers.
- **2026-03-30** — **ARCHITECTURE PIVOT: Expo → Next.js.** Decision to drop React Native and go pure web. Rationale: app was already deployed as a web app on Vercel; removing the RN layer eliminates dual code paths, platform-specific workarounds, and EAS build complexity. Expo source archived in `_expo-archive/`. Database, Edge Functions, and Supabase config are completely unchanged.

---

## Archived: Expo Era (Phases 1–11C)
All phases below were completed using Expo (React Native). They are archived for historical
reference. Their features are re-implemented in the Next.js migration (Phase M).

---

## Phase 1 — Foundation ✅
Getting the skeleton of the app running with a real backend connection.

| Task | Status |
|---|---|
| Choose tech stack | ✅ |
| Install dev tools (Node, VS Code, Expo CLI) | ✅ |
| Create Expo project | ✅ |
| App running live on Android phone | ✅ |
| Create Supabase project | ✅ |
| Connect Supabase to Expo app | ✅ |
| Supabase connection verified | ✅ |

---

## Phase 2 — User Authentication ✅
Users need accounts so their plant data is personal and persistent.

| Task | Status |
|---|---|
| Design auth flow (sign up, sign in, sign out) | ✅ |
| Build Sign Up screen | ✅ |
| Build Sign In screen | ✅ |
| Set up auth state listener (detect login/logout) | ✅ |
| Auth-gated navigation (redirect to sign in if logged out) | ✅ |
| Sign out functionality | ✅ |
| Test: create account, sign out, sign back in | ✅ |

---

## Phase 3 — Plant Registry ✅
The core of the app — adding, viewing, and managing plants.

| Task | Status |
|---|---|
| Design database schema for plants table | ✅ |
| Create plants table in Supabase with RLS policies | ✅ |
| Build "My Plants" screen (list view) | ✅ |
| Build "Add Plant" screen | ✅ |
| Build "Plant Detail" screen | ✅ |
| Edit and delete plant | ✅ |
| Nickname and notes fields | ✅ |

---

## Phase 4 — Photos ✅
Letting users photograph their plants and store images.

| Task | Status |
|---|---|
| Set up Supabase Storage bucket for plant photos | ✅ |
| Integrate expo-image-picker | ✅ |
| Upload photo to Supabase Storage | ✅ |
| Display plant photos in Plant Detail screen | ✅ |
| Photo history (multiple photos per plant over time) | ✅ |

---

## Phase 5 — AI Integration ✅
AI vision and chat via a Supabase Edge Function. Provider-swappable via the
`AI_PROVIDER` secret — currently using Anthropic Claude API (claude-haiku-4-5-20251001).
Gemini support is also implemented and can be re-enabled by changing the secret.

| Task | Status |
|---|---|
| Install Supabase CLI and set up Edge Functions | ✅ |
| Create `analyze-plant` Edge Function with provider abstraction | ✅ |
| Store AI API key securely in Supabase secrets | ✅ |
| Species identification from photo | ✅ |
| Health analysis from photo | ✅ |
| Care recommendations from analysis | ✅ |
| Display AI results in a readable format | ✅ |

---

## Phase 5b — Analysis History & Progress Tracking ✅
Each analysis result is saved to the database and linked to the photo it was based on.
Future analyses receive the plant's previous results as context, so the AI can compare
current health against past snapshots and report on improvement or decline over time.

| Task | Status |
|---|---|
| Create `analysis_results` table in Supabase with RLS policies | ✅ |
| Save each analysis result (species, health, care, timestamp, photo_id) to the database | ✅ |
| Display past analysis results in a collapsible history section on Plant Detail screen | ✅ |
| Pass prior analysis summaries to the Edge Function when re-analyzing | ✅ |
| Update AI prompt to reference history and comment on changes over time | ✅ |

---

## Phase 6 — Care Logs ✅
Tracking watering, fertilizing, and other care events.

| Task | Status |
|---|---|
| Design database schema for care_logs table | ✅ |
| Create care_logs table in Supabase | ✅ |
| Log watering events | ✅ |
| Log fertilizing events | ✅ |
| Custom care event notes | ✅ |
| Care history view per plant | ✅ |

---

## Phase 7 — Notifications & Reminders ✅
Per-plant watering reminders using Expo local notifications. Interval preference
stored in Supabase; notification IDs stored in AsyncStorage on-device.

| Task | Status |
|---|---|
| Set up Expo Notifications | ✅ |
| Request notification permissions | ✅ |
| Set watering reminders per plant | ✅ |
| Manage and cancel reminders | ✅ |

---

## Phase 8 — Plant Profiles & Species Reference ✅
Each registered plant gets a rich, persistent profile combining two layers of information:

**Layer 1 — Personal data (unique to the user's individual plant):**
The user's own photos, AI health analyses over time, care logs, and notes. This evolves
with every interaction and tells the story of that specific plant.

**Layer 2 — Species reference data (encyclopedic, fetched once and cached forever):**
When a species is identified, the app calls the `fetch-species-info` Edge Function, which
uses the Claude API to generate a structured species profile and saves it to the
`species_profiles` table in Supabase. Because it's keyed by species name and shared
across all users, this fetch only ever happens once per species — any future user with
the same plant gets the cached profile instantly at no cost.

**Why Claude for species data (not a third-party plant database):**
Third-party plant APIs (e.g. Perenual) restrict most of their catalog behind paid plans
and introduce an additional external dependency. Claude's knowledge of common houseplants
is comprehensive, returns naturally readable text, covers any species without catalog
limits, and uses infrastructure we already have. The one-time-per-species caching model
means the ongoing API cost is negligible.

**Species profile covers:**
- Scientific name and common names
- Light requirements
- Watering guidance (frequency, method, signs of over/underwatering)
- Humidity and temperature preferences
- Soil and potting recommendations
- Toxicity (pets and humans)
- Common problems, pests, and diseases
- Growth habits and typical size
- Propagation methods

**How the two layers work together:**
The species profile is passed as context into the `analyze-plant` Edge Function, so every
health analysis is species-aware — Claude already knows what "normal" looks like for that
plant before it even sees the photo.

| Task | Status |
|---|---|
| Design `species_profiles` table schema | ✅ |
| Create `species_profiles` table in Supabase with RLS policies | ✅ |
| Create `fetch-species-info` Edge Function (Claude API, provider-swappable) | ✅ |
| Auto-fetch species profile when species is identified via AI analysis | ✅ |
| Display species reference section on Plant Detail screen | ✅ |
| Pass species profile as context into `analyze-plant` Edge Function | ✅ |
| "Refresh species info" option on Plant Detail screen | ✅ |

---

## Phase 9 — Polish & Launch ✅
Viriditas is deployed as a live web app accessible on any device via browser.
Native app store builds (EAS) can follow later without significant code changes.

**Why web first:**
No app store fees or review delays. The core features (plant profiles, AI analysis,
care logs, species reference) all work great in a browser. Notifications are the main
limitation on web — watering intervals are still saved and shown in-app, but won't
fire as push alerts until a native build is produced.

**Deployment target:** Vercel (free tier) — connected to the GitHub repo for automatic
deploys on every push. Environment variables (Supabase URL, anon key) set in Vercel dashboard.

| Task | Status |
|---|---|
| App icon (plant sprout on brand green) | ✅ |
| Splash screen updated to use new icon | ✅ |
| Web support confirmed (react-dom, react-native-web already installed) | ✅ |
| Responsive layout via PageContainer component (max-width 800px on desktop) | ✅ |
| expo-notifications safely skipped on web | ✅ |
| vercel.json configured (build command, output dir, SPA rewrites) | ✅ |
| Fix SSR crash: supabase.ts uses localStorage on web instead of AsyncStorage | ✅ |
| Web UI fixes: JSX comment bug, scrollbar hidden, max-width increased to 800px | ✅ |
| Push code to GitHub (auto-deploys via Vercel) | ✅ |
| Connect repo to Vercel and set environment variables | ✅ |
| Confirm live web deployment | ✅ |
| (Future) EAS Build for native Android/iOS with full notification support | ⬜ |

---

## Phase 10 — UI & UX Overhaul 🔄
A comprehensive design, usability, and functionality upgrade based on a product design
and botanical expert review. Goal: an app that is genuinely useful daily and a joy to use.

**Core diagnosis:**
The underlying architecture is solid, but the app currently feels like a database with a
thin UI — not something you'd reach for every morning. The plant list has no photos. There's
no at-a-glance care status. The care model is too thin for real gardeners. And the daily
use loop (open app → know what needs attention → act) is missing entirely.

**Design principles for this phase:**
- Visual first: plants are beautiful things; the app should feel that way
- Reduce friction: care logging should be instant and satisfying
- Actionable at a glance: open the app and immediately know what needs attention
- Progressive disclosure: surface what's relevant, don't overwhelm

---

### Phase 10A — Visual Plant Collection ✅
Replace text list with a photo grid. Each card shows cover photo, nickname, species,
and a watering status badge. A banner at the top flags plants that need attention.

| Task | Status |
|---|---|
| 2-column photo grid on My Plants screen | ✅ |
| Cover photo fetched from most recent plant photo | ✅ |
| Watering status badge per card (good / due soon / overdue) | ✅ |
| "N plants need water" attention banner in header | ✅ |
| Improved empty state with icon and welcoming copy | ✅ |

---

### Phase 10B — Plant Detail Restructure ✅
Reorganize the long-scroll plant detail into a tabbed layout. Make care actions
immediately accessible without scrolling.

| Task | Status |
|---|---|
| Tab layout: Overview / History / Species | ✅ |
| Overview tab: full-width hero photo, 4-button quick-action bar, analyze button, latest analysis card, watering reminder | ✅ |
| History tab: unified chronological timeline (care logs + analyses merged, sorted newest first) | ✅ |
| Species tab: full species profile, all fields visible without collapsing, refresh button | ✅ |
| Quick-action bar (Watered / Fertilized / Note / Add Photo) always visible at top of Overview | ✅ |
| Fixed header with plant name, species, and Edit button always visible across all tabs | ✅ |
| Edit mode replaces tab content; tab bar hidden during edit for focus | ✅ |

---

### Phase 10C — Richer Plant Data ✅
Add fields and care log types that real gardeners actually track.

| Task | Status |
|---|---|
| Additional care log types: repotted, pruned, misted, pest treatment, moved | ✅ |
| Plant location field (e.g. "Living room — east window") | ✅ |
| Pot size field | ✅ |
| Acquisition date field | ✅ |
| Last repotted date field | ✅ |
| Location and pot data passed as context to AI analysis | ✅ |

---

### Phase 10D — Today View ✅
Add a lightweight "what needs attention today" layer so the app becomes a daily habit.

| Task | Status |
|---|---|
| Plants due for water shown prominently at top of collection | ✅ |
| Overdue watering shown distinctly from "due today" | ✅ |
| "All caught up" positive state when nothing is overdue | ✅ |
| Care streak tracking (consecutive days with logged care) | ✅ |

---

## Phase 11 — Critical UX Fixes 🔄
A second-pass review (product manager + UI/UX + botanic veteran) surfaced several problems
that need fixing before the app is ready to share with real users. These aren't polish —
they are broken behaviors and first-impression failures.

**Core diagnosis:**
The app's architecture is strong but several everyday interactions are frustrating or broken.
Notifications contradict in-app data. There's no account screen. Date inputs require a
specific text format nobody knows. Care actions confirm nothing. The second tab is a dead end.
And a new user has no idea what the app does until they've already struggled through setup.

---

### Phase 11A — Notifications Sync with Care Logging ✅
Currently, watering notifications are scheduled once when the user sets the interval and
never updated. When a user logs "Watered", the in-app badge correctly recalculates from
the care log, but the push notification still fires on the original schedule. The two
systems give contradictory information, which is worse than having no notification at all.

**Fix:** Every time a "watered" care log is saved, reschedule the watering notification from
that date forward using the plant's current `watering_interval_days`. This keeps the
notification in sync with actual care behavior.

| Task | Status |
|---|---|
| Reschedule watering notification when "watered" care log is saved | ✅ |
| Verify notification fires at the correct time after mid-interval watering | ✅ |
| Handle the case where watering_interval_days is null (no notification to reschedule) | ✅ |

---

### Phase 11B — Settings Screen & Account Management ✅
There is currently no Settings screen and no obvious way to sign out. Account management
(sign out, password reset) must be accessible from normal navigation — not buried somewhere
in the app.

The Explore tab is a placeholder ("Plant Encyclopedia — Coming soon.") and has a paperplane
icon that suggests nothing botanical. It should be replaced with a Settings tab that gives
the app a proper home for account and app preferences.

| Task | Status |
|---|---|
| Replace Explore tab with a Settings tab (leaf or gear icon) | ✅ |
| Settings screen: show signed-in email address | ✅ |
| Settings screen: Sign Out button | ✅ |
| Settings screen: app version / about section | ✅ |

---

### Phase 11C — Date Pickers ✅
Acquisition date and last repotted date currently use raw text inputs that require
"YYYY-MM-DD" format. This fails silently for most users and shows a jarring Alert on
format errors. These should be native date pickers on both platforms.

| Task | Status |
|---|---|
| Replace acquisition date text input with a date picker (Add Plant screen) | ✅ |
| Replace acquisition date and last repotted date text inputs in Plant Detail edit form | ✅ |
| Display stored dates in human-readable format (e.g. "March 15, 2024") throughout the app | ✅ |

**Implementation note:** `DatePickerField.tsx` (native) uses `@react-native-community/datetimepicker` —
Android opens the system dialog imperatively, iOS shows an inline spinner. `DatePickerField.web.tsx`
overlays a transparent `<input type="date">` on a styled button, giving the browser's native calendar.
Metro auto-selects the `.web.tsx` file for web builds. Values always flow as YYYY-MM-DD strings.

---

### Phase 11D — Care Action Feedback ⬜
Tapping "Watered", "Fertilized", or any care action currently logs silently. There is no
visual confirmation, haptic feedback, or animation. In a habit-forming app, the feedback
*is* the reward — without it, users aren't sure the tap registered and the action feels
meaningless. This is a small change with a large behavioral impact.

| Task | Status |
|---|---|
| Brief success toast or confirmation message after logging any care action | ⬜ |
| Haptic feedback (light tap) on care log actions (native only) | ⬜ |
| Update watering badge immediately after logging "watered" (without requiring a screen refresh) | ⬜ |

---

### Phase 11E — First-Time User Experience ⬜
A new user opens the app to "Your collection is empty" with a generic "Add Plant" button.
Nothing explains what Viriditas does, why photos matter, or what they'll get from AI
analysis. The value proposition is invisible until the user has already committed to setup.
There is also no prompt to add a photo immediately after adding a plant — the first thing
any plant needs for AI analysis.

| Task | Status |
|---|---|
| Richer empty state: explain what Viriditas does and what to expect | ⬜ |
| After "Add Plant" succeeds, navigate directly to that plant's detail screen (not back to the empty grid) | ⬜ |
| On first visit to a plant with no photos, show a prominent "Add a photo to unlock AI analysis" prompt | ⬜ |

---

## Phase 12 — Depth & Botanical Intelligence ⬜
With the critical UX fixes in place, these features make the app meaningfully better for
anyone who takes plant care seriously. Each fills a gap that a real plant enthusiast would
notice immediately.

---

### Phase 12A — Health Score & Trend Tracking ⬜
The AI produces rich health text, but there's no structured number attached to each
analysis. Over months of data, you can't tell whether a plant is improving or declining
without reading through every history entry. A simple 1–5 health score per analysis
makes trends visible at a glance and enables a health history chart over time.

| Task | Status |
|---|---|
| Add `health_score` (integer 1–5) field to `analysis_results` table | ⬜ |
| Update `analyze-plant` Edge Function prompt to also return a numeric health score | ⬜ |
| Display health score badge on each analysis card in the History tab | ⬜ |
| Show a simple health trend line or sparkline on the Overview tab (requires 3+ analyses) | ⬜ |

---

### Phase 12B — Fertilizing Reminder ⬜
Users can log fertilizing events but there is no reminder infrastructure for it. Fertilizing
is typically monthly or seasonal and very easy to forget. It deserves the same reminder
system as watering — with a separate interval, a separate badge, and notification sync when
fertilizing is logged.

| Task | Status |
|---|---|
| Add `fertilizing_interval_days` column to the `plants` table | ⬜ |
| Fertilizing reminder UI on Plant Detail screen (interval selector, same pattern as watering) | ⬜ |
| Reschedule fertilizing notification when "fertilized" care log is saved | ⬜ |
| Show fertilizing status badge on plant cards (overdue / due soon / good) | ⬜ |
| Include fertilizing urgency in the My Plants grid urgency sort | ⬜ |

---

### Phase 12C — Soil Type Field ⬜
Soil type is as important as pot size for determining watering frequency — a Monstera in
fast-draining aroid mix needs water far more often than the same plant in dense peat. It
was omitted from Phase 10C but belongs alongside pot size in the plant profile. It should
also be passed to the AI as part of `plantContext`.

| Task | Status |
|---|---|
| Add `soil_type` column to the `plants` table | ⬜ |
| Soil type field in Add Plant screen and Plant Detail edit form | ⬜ |
| Pass soil_type to analyze-plant Edge Function as part of plantContext | ⬜ |

---

### Phase 12D — Photo Management & Comparison ⬜
Photos are the app's primary record of a plant's visual life — but the current implementation
has two gaps. First, there's no way to delete a bad photo. Second, the whole value of
taking photos over time (tracking recovery from pests, new growth, etc.) is underserved
because there's no way to compare photos side by side.

| Task | Status |
|---|---|
| Delete photo option (long-press or swipe gesture on photo thumbnail) | ⬜ |
| Confirm before delete (cannot be undone) | ⬜ |
| Side-by-side photo comparison: select any two photos from the plant's history | ⬜ |

---

### Phase 12E — Seasonal Awareness ⬜
The app currently has no concept of seasons. Most houseplants need significantly less water
in winter (slower growth, less evaporation, natural dormancy for some species). A fixed
7-day interval set in July will over-water the same plant in December. The AI analyses
don't proactively surface this unless it happens to come up in a specific prompt.

| Task | Status |
|---|---|
| Pass current month/hemisphere to `analyze-plant` so AI can give season-appropriate advice | ⬜ |
| Winter mode reminder: in Nov–Feb (northern hemisphere), surface a banner suggesting interval review | ⬜ |
| Species profiles should include seasonal care notes (update `fetch-species-info` prompt) | ⬜ |

---

## Phase 13 — Power User & Scale Features ⬜
These features matter once users have a real plant collection (10+ plants) and have been
using the app daily for weeks. They're not needed for initial launch but will determine
whether the app retains users long-term.

| Feature | Notes |
|---|---|
| Search and filter on My Plants screen | Filter by room/location, species, watering status |
| Plant tagging / grouping | Group plants by room, light level, or custom tag |
| Multi-plant care summary | A single "All upcoming care" view across the whole collection |
| Photo export | Download all photos for a plant as a zip or share sequence |
| "Plant diary" — free text journal entries per plant | Distinct from care logs — for longer observations |
| Soil amendment log type | Track soil changes, additives (perlite, bark, etc.) |
| Pest/treatment detail fields | Which pest, what product, how many applications |
| EAS Build — native Android/iOS | Full notification support, App Store distribution |

---

## Notes & Decisions Log
- **2026-03-26** — Tech stack chosen: Expo + Supabase + Anthropic Claude API
- **2026-03-26** — Developer is on Mac, testing on Android
- **2026-03-26** — Foundation complete, Supabase connection verified
- **2026-03-26** — Auth complete: sign up, sign in, sign out, auth-gated navigation all working
- **2026-03-26** — Plant registry complete: plants table, My Plants list, Add Plant, Plant Detail with edit/delete
- **2026-03-26** — Auth gate fix: switched from useSegments() to pure session-based routing for Expo Router 6 compatibility
- **2026-03-26** — Photos complete: camera + library picker, Supabase Storage upload, photo gallery on Plant Detail screen
- **2026-03-26** — Upload fix: blob.arrayBuffer() not supported in React Native; use base64: true in ImagePicker options instead
- **2026-03-26** — AI provider decision: using Google Gemini for development (unlimited account); architecting Edge Function to be provider-swappable via environment variable so Claude API can be used in production
- **2026-03-27** — Phase 5 complete: AI analysis working end-to-end using Claude API (claude-haiku-4-5-20251001). Switched from Gemini (quota issues) to Claude. Edge Function deployed with --no-verify-jwt flag; JWT is passed explicitly from the app via session.access_token. Image is fetched server-side from the public Supabase Storage URL and encoded to base64 using Deno's std library.
- **2026-03-27** — Phase 7 complete: expo-notifications installed; Android notification channel created; permissions requested on startup; per-plant watering reminders with 5 preset intervals; interval saved to Supabase plants.watering_interval_days; notification ID stored in AsyncStorage; reminders can be changed or removed.
- **2026-03-27** — Phase 6 complete: care_logs table created; quick-tap Watered/Fertilized buttons + custom Note input on Plant Detail screen; care history shown in collapsible list (20 most recent events).
- **2026-03-27** — Phase 5b complete: analysis_results table created; results saved after every analysis; history shown in collapsible section on Plant Detail screen; Edge Function now receives up to 3 previous analyses as context and uses them to produce progress-aware health assessments.
- **2026-03-27** — Phase 8 scope decision: encyclopedia repurposed as per-plant species profiles rather than a searchable index. Each registered plant gets a one-time AI-generated species profile saved to the database. The explore tab will show this profile for a selected plant. Goal is that users build up a rich, detailed record for each of their specific plants — encyclopedic facts + personal observations combined.
- **2026-03-27** — Phase 8 data source decision: Claude API only (no third-party plant database). Perenual and similar APIs restrict most of their catalog to paid plans and add an external dependency. Claude's houseplant knowledge is comprehensive, covers any species, returns naturally readable text, and uses infrastructure already in place. Species profiles are cached in Supabase permanently so the AI is only called once per species globally.
- **2026-03-27** — Phase 8 complete: species_profiles table created; fetch-species-info Edge Function deployed (Claude-powered, provider-swappable, forceRefresh support); species profile auto-fetched after first analysis; displayed on Plant Detail screen as collapsible reference card; species profile passed as context into analyze-plant for species-aware health assessments; Refresh button allows regeneration on demand.
- **2026-03-28** — Phase 10 design review: app diagnosed as "database with thin UI." Two core problems: (1) plant list has no photos — fundamental mismatch for a visual, nature-oriented app; (2) no at-a-glance care status — you can't tell what needs attention without opening each plant. Four-phase UX overhaul planned: 10A visual grid, 10B detail restructure, 10C richer data, 10D today view.
- **2026-03-28** — Phase 10A complete: My Plants screen rebuilt as 2-column photo grid. Cover photo fetched as most recent photo per plant (3 total DB queries regardless of collection size). Watering status computed from care_logs and plants.watering_interval_days; displayed as colored badge (red=overdue, amber=due soon, transparent=good). Attention banner shows count of plants needing water. Improved empty state with large icon and welcoming copy.
- **2026-03-29** — Phase 10C complete: Five new care log types added (repotted, pruned, misted, pest_treatment, moved) behind a collapsible "More actions" row on the Overview tab. Four new plant fields added (location, pot_size, acquired_date, last_repotted_date) to the plants table, Edit form, Add Plant form, and Overview details section. Location and pot_size now passed as context to the analyze-plant Edge Function so AI recommendations are location-aware. Requires Supabase schema migration (see decisions log).
- **2026-03-28** — Phase 10B complete: Plant Detail screen restructured from single long scroll into three-tab layout (Overview / History / Species). Fixed header with plant name always visible. Quick-action bar (Watered / Fertilized / Note / Add Photo) is the first interactive element on Overview — no scrolling required for common actions. History tab merges care logs and AI analyses into a unified chronological timeline with a dot-and-line visual. Species tab shows the full species profile without collapsing. Edit mode hides the tab bar and takes over the content area.
- **2026-03-28** — Phase 9 complete: Viriditas deployed live on Vercel. Fixed two build-blocking issues: (1) missing @expo/metro-runtime, (2) `window is not defined` SSR crash caused by AsyncStorage being initialized in Node.js during Expo's static render pass — fixed by using `localStorage` on web. Post-deploy web UI fixes: JSX `//` comment rendered as visible text (fixed to `{/* */}`), internal scrollbar shown on plant detail (hidden with showsVerticalScrollIndicator={false}), content too narrow at 600px (increased to 800px).
- **2026-03-29** — Phase 10D complete: My Plants screen gains "Today View" layer. Plants sorted by urgency (overdue → due-soon → good → unset). Attention banner split into separate overdue (red) and due-soon (amber) banners that stack when both conditions exist. Green "All caught up!" banner shown when all plants with reminders are in good status. Care streak chip added next to the "My Plants" title — computes consecutive calendar days with any logged care event (any plant, any action type) from a single query over the past year.
- **2026-03-29** — Phase 11B complete: Explore tab replaced with a Settings tab (gear icon). New `app/(tabs)/settings.tsx` screen shows signed-in email with an avatar initial, a sign-out button (confirmation Alert, then supabase.auth.signOut() — the auth listener in _layout.tsx handles the redirect), and an About section with app name and version. `gearshape.fill` → `settings` mapping added to icon-symbol.tsx for Android/web. Tab title updated from 'Home' to 'My Plants'.
- **2026-03-29** — Phase 11A complete: Watering notifications now reschedule automatically when a "watered" care log is saved. Added `rescheduleWateringNotification()` helper in Plant Detail screen — cancels existing notification, schedules a fresh one from the current time using the plant's stored interval, updates AsyncStorage with the new ID. Silently no-ops when `watering_interval_days` is null or when running in Expo Go/web. Care log success path unchanged; notification failure is non-fatal and never blocks the log from being saved.
- **2026-03-29** — Phase 10 retrospective + Phase 11/12/13 planning: Full product + UX + botanic review identified 12 gaps. Critical issues: (1) notifications decoupled from care logging — notification fires on original schedule even after mid-interval watering; (2) Explore tab is a dead placeholder "Coming soon" with no real content; (3) no Settings screen and no visible sign-out path; (4) date inputs require YYYY-MM-DD text entry with Alert errors; (5) care actions log silently with no feedback; (6) no onboarding for new users. Botanical gaps: seasonal blindness (fixed intervals don't adjust for winter), soil type missing from plant profile, health scores buried in prose with no trend visibility, fertilizing has no reminder infrastructure, photos can't be deleted or compared side by side. Phases 11/12/13 added to address in priority order.
