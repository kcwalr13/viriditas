# Viriditas — Development Roadmap

## Overview
Building a cross-platform houseplant care app using Expo (React Native) + Supabase + Anthropic Claude API.

**Status key:** ✅ Done · 🔄 In Progress · ⬜ Not Started

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

### Phase 10B — Plant Detail Restructure ⬜
Reorganize the long-scroll plant detail into a tabbed layout. Make care actions
immediately accessible without scrolling.

| Task | Status |
|---|---|
| Tab layout: Overview / Care History / Species Guide | ⬜ |
| Overview tab: hero photo gallery, quick-action bar, latest analysis summary | ⬜ |
| Care History tab: unified chronological timeline (logs + analyses combined) | ⬜ |
| Species Guide tab: full species profile in its own space | ⬜ |
| Quick-action bar (Water / Fertilize / Note) always visible on Overview | ⬜ |

---

### Phase 10C — Richer Plant Data ⬜
Add fields and care log types that real gardeners actually track.

| Task | Status |
|---|---|
| Additional care log types: repotted, pruned, misted, pest treatment, moved | ⬜ |
| Plant location field (e.g. "Living room — east window") | ⬜ |
| Pot size field | ⬜ |
| Acquisition date field | ⬜ |
| Last repotted date field | ⬜ |
| Location and pot data passed as context to AI analysis | ⬜ |

---

### Phase 10D — Today View ⬜
Add a lightweight "what needs attention today" layer so the app becomes a daily habit.

| Task | Status |
|---|---|
| Plants due for water shown prominently at top of collection | ⬜ |
| Overdue watering shown distinctly from "due today" | ⬜ |
| "All caught up" positive state when nothing is overdue | ⬜ |
| Care streak tracking (consecutive days with logged care) | ⬜ |

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
- **2026-03-28** — Phase 9 complete: Viriditas deployed live on Vercel. Fixed two build-blocking issues: (1) missing @expo/metro-runtime, (2) `window is not defined` SSR crash caused by AsyncStorage being initialized in Node.js during Expo's static render pass — fixed by using `localStorage` on web. Post-deploy web UI fixes: JSX `//` comment rendered as visible text (fixed to `{/* */}`), internal scrollbar shown on plant detail (hidden with showsVerticalScrollIndicator={false}), content too narrow at 600px (increased to 800px).
