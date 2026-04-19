# Viriditas — Development Roadmap

## Overview
Viriditas is a houseplant care web app — runs in any browser, installable as a PWA on Android
and iOS. Backend: Supabase (PostgreSQL, Auth, Storage, Edge Functions). AI: Anthropic Claude API.
Frontend: **Next.js 15** (migrated from Expo/React Native in March 2026).

**Status key:** ✅ Done · 🔄 In Progress · ⬜ Not Started

---

## Phase M — Next.js Migration ✅
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
| Sign out: `supabase.auth.signOut()` in Client Component → `router.push('/sign-in')` + `router.refresh()` | ✅ |

---

### Phase M9 — PWA ✅
Make the app installable as a home screen icon on Android and iOS.

| Task | Status |
|---|---|
| `public/manifest.json` — name, icons, theme color, display: standalone | ✅ |
| App icons: `public/icon.png` (1024×1024), `public/icon-192.png` (192×192) | ✅ |
| `manifest` linked in root layout via Next.js metadata API | ✅ |
| Verify "Add to Home Screen" prompt on Android Chrome | ✅ |
| Verify "Add to Home Screen" works on iOS Safari (iOS 16.4+) | ✅ |

---

## Phase 11 — Critical UX Fixes ✅
These carry forward from the Expo era. They are needed before the app is
ready to share with real users. Phases 11A–11C were completed in the Expo era
and need to be re-implemented in the Next.js rewrite where applicable.

---

### Phase 11D — Care Action Feedback ✅
Tapping a care action (Watered, Fertilized, etc.) logs silently with no visual
confirmation. In a habit-forming app, the feedback is the reward.

| Task | Status |
|---|---|
| Toast/snackbar notification after logging any care action | ✅ |
| Update watering badge immediately after logging "watered" (optimistic update) | ✅ |

---

### Phase 11E — First-Time User Experience ✅
A new user sees an empty grid with no context about what Viriditas does.

| Task | Status |
|---|---|
| Richer empty state: explain what Viriditas does and what to expect | ✅ |
| After "Add Plant" succeeds, navigate directly to that plant's detail | ✅ |
| On first visit to a plant with no photos, show prominent "Add a photo to unlock AI analysis" | ✅ |

---

### Phase 11F — Plant Encyclopedia ✅
An ad-hoc lookup tool for any plant, whether or not the user has it registered. Accessible via the Explore tab in the bottom nav.

| Task | Status |
|---|---|
| `suggest-species` Edge Function — takes a freeform query, returns 4–6 candidate species (handles misspellings + common names) | ✅ |
| Disambiguation grid — 2-col card layout with Wikipedia thumbnails; user selects the plant they mean | ✅ |
| `identify-species` Edge Function — identifies species from a base64 photo; no storage needed | ✅ |
| Photo search — upload/snap a photo → identify → fetch profile directly | ✅ |
| `fetch-species-info` prompt updated to produce bullet-formatted content for multi-item sections | ✅ |
| `FormattedContent` renderer — smart bullet/paragraph rendering in the profile view | ✅ |
| `pruning_tips` and `disease_symptoms` columns added to `species_profiles` table | ✅ |
| "Back to results" button on profile view returns user to the suggestion grid | ✅ |

---

## Phase 12 — Depth & Botanical Intelligence ✅
These features make the app meaningfully better for anyone who takes plant care seriously.

---

### Phase 12A — Health Score & Trend Tracking ✅
| Task | Status |
|---|---|
| Add `health_score` (integer 1–5) to `analysis_results` table | ✅ |
| Update `analyze-plant` prompt to return a numeric health score | ✅ |
| Display score badge on each analysis card in History tab | ✅ |
| Health trend sparkline on Overview (requires 3+ analyses) | ✅ |

---

### Phase 12B — Fertilizing Reminder ✅
| Task | Status |
|---|---|
| Add `fertilizing_interval_days` column to `plants` table | ✅ |
| Fertilizing reminder UI on Plant Detail (interval selector) | ✅ |
| Show fertilizing status badge on plant cards | ✅ |
| Include fertilizing urgency in the My Plants urgency sort | ✅ |

---

### Phase 12C — Soil Type Field ✅
| Task | Status |
|---|---|
| Add `soil_type` column to `plants` table | ✅ |
| Soil type field in Add Plant + Edit form | ✅ |
| Pass `soil_type` to `analyze-plant` Edge Function as plantContext | ✅ |

---

### Phase 12D — Photo Management ✅
| Task | Status |
|---|---|
| Delete photo option (confirm before delete) | ✅ |
| Side-by-side photo comparison (select any two from history) | ✅ |

---

### Phase 12E — Seasonal Awareness ✅
| Task | Status |
|---|---|
| Pass current month/hemisphere to `analyze-plant` for seasonal advice | ✅ |
| Winter mode banner (Nov–Feb, northern hemisphere) suggesting interval review | ✅ |
| Seasonal care notes added to `fetch-species-info` prompt | ✅ |

---

## Phase 13 — Power User & Scale Features ✅
These matter once users have 10+ plants and have been using the app daily for weeks.

| Feature | Status | Notes |
|---|---|---|
| Search on My Plants screen | ✅ | Live search filters by nickname, species, location; result count shown |
| Multi-plant care summary | ✅ | Today task list covers watering + feeding; "Needs attention" combines both |
| Per-photo download | ✅ | Download button on each thumbnail (fetch → blob URL, works cross-origin) |
| Bulk photo export (zip) | ✅ | JSZip — "Export all" button in photo section header; downloads zip named after plant |
| Plant tagging | ✅ | `tags text[]` column; tag pill editor in EditForm; tags shown in Dossier |
| Plant diary (richer notes) | ✅ | Condition chips (All good, New growth, Showing stress, Pest spotted, Recovering, Flowering) + textarea; saves to `care_logs` type `note` with condition prefix |
| Pest/treatment detail fields | ✅ | `pest_notes text` + `last_treatment_date date` columns; shown in Dossier + EditForm |
| Web Push Notifications | ⬜ | Deferred — service worker infrastructure needed, too much scope |

**Requires SQL migrations** (run in Supabase SQL editor):
```sql
ALTER TABLE plants ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}';
ALTER TABLE plants ADD COLUMN IF NOT EXISTS pest_notes text;
ALTER TABLE plants ADD COLUMN IF NOT EXISTS last_treatment_date date;
```

---

## Phase 15 — Depth & Polish II ✅

### Phase 15A — Tag Filtering on My Plants ✅
| Task | Status |
|---|---|
| Tag chips below search when collection has tags; click to filter | ✅ |
| Multi-tag OR selection; "Clear" button when filters active | ✅ |

### Phase 15B — Log Book Enhancements ✅
| Task | Status |
|---|---|
| Filter chips (All / Care / Notes / Analysis) above the timeline | ✅ |
| Show 20 items by default; "See all N entries" expands to full timeline | ✅ |

### Phase 15C — Repotting Reminder ✅
| Task | Status |
|---|---|
| Warn indicator in Dossier when last repotted > 12 months ago | ✅ |

### Phase 15D — Me Screen Stats ✅
| Task | Status |
|---|---|
| § 02 stats strip: Plants / Care logs / Analyses counts | ✅ |

### Phase 15E — Growth Measurement Log ✅
| Task | Status |
|---|---|
| `measured` type added to `care_logs` constraint (SQL required) | ✅ |
| "Measure" in MORE_ACTIONS dock; input accepts any text (cm, in, leaf count) | ✅ |
| Measurement values display in accent mono in the log book | ✅ |
| `ruler` icon added to Icon set | ✅ |

**SQL required (run in Supabase):**
```sql
ALTER TABLE care_logs DROP CONSTRAINT IF EXISTS care_logs_type_check;
ALTER TABLE care_logs ADD CONSTRAINT care_logs_type_check
  CHECK (type IN ('watered','fertilized','note','repotted','pruned','misted','pest_treatment','moved','measured'));
```

---

## Phase 16 — Today Quick Actions ✅

### Phase 16A — Inline Quick-Log on Task Cards ✅
| Task | Status |
|---|---|
| Drop + Leaf action buttons inline on each task card (water/feed without navigating) | ✅ |
| Clock spinner while logging; buttons disabled until complete | ✅ |
| Toast confirmation with plant name after logging | ✅ |
| `router.refresh()` after log — server re-computes urgency, card disappears from task list | ✅ |

### Phase 16B — Upcoming Care (7-day window) ✅
| Task | Status |
|---|---|
| "Coming up" section on Today showing plants due in 2–7 days | ✅ |
| Computed from existing card data (no new queries); sorted by days remaining | ✅ |
| Horizontal scroll of compact cards with plant thumbnail + "Water in 3d" label | ✅ |

### Phase 16C — Today Collection Strip Shortcut ✅
| Task | Status |
|---|---|
| "Add plant" tile at end of collection strip; dashed border, plus icon, links to /add-plant | ✅ |

---

## Phase 17 — Care Log Management ✅

### Phase 17A — Delete Care Log Entry ✅
| Task | Status |
|---|---|
| Trash icon on each care log row in log book (care entries only, not AI analyses) | ✅ |
| Native confirm dialog; deletes from DB + refreshes local state | ✅ |
| Toast confirmation after delete | ✅ |

---

## Phase 18 — Explore Quick-Wins ✅

| Task | Status |
|---|---|
| Remove fake hardcoded species counts from category cards; replace with descriptive subtitle | ✅ |
| Wikipedia thumbnails fetched on mount for Featured carousel (same API used by suggestion grid) | ✅ |
| Gradient placeholder shown until thumbnail arrives (graceful fallback on fetch failure) | ✅ |

---

## Phase 19 — Plants Screen Polish ✅

| Task | Status |
|---|---|
| A–Z sort toggle in grouping chip row; client-side sort by nickname | ✅ |
| Fix metadata label "By recency" → "By urgency" (the server sorts by combined care urgency) | ✅ |
| Fix `StatusGroups` to use combined watering + fertilizing urgency (was watering-only — plants that were fertilizing-overdue but watering-good appeared under "Settled") | ✅ |

---

## Phase 20 — Explore → Add Plant Connection ✅

| Task | Status |
|---|---|
| "I have one — add to collection" solid CTA button at bottom of species profile view in Explore | ✅ |
| Links to `/add-plant?species=SPECIES_NAME` | ✅ |
| Add Plant wizard reads `?species` query param on mount; pre-fills manual species field and skips to step 2 | ✅ |

---

## Phase 21 — Hero Carousel ✅
Multiple photos on a plant deserve a proper swipeable carousel, not just the first photo.

| Task | Status |
|---|---|
| Hero div becomes a horizontally-scrollable snap carousel (CSS scroll-snap) | ✅ |
| Individual slides: `shrink-0 w-full h-full` inside absolute-inset scroll container | ✅ |
| Dot indicator row at bottom (only when photos.length > 1); active dot wider | ✅ |
| `heroIndex` state tracks current slide via `onScroll` handler | ✅ |

---

## Phase 22 — Analysis Staleness Indicator ✅
If a user's last AI analysis is more than 2 weeks old, surface it so they're nudged to re-analyze.

| Task | Status |
|---|---|
| Compute `daysSinceAnalysis` from `latestAnalysis.created_at` | ✅ |
| `analysisStale` flag (true when > 14 days) | ✅ |
| Age badge in § 02 section header shows "Xd ago" in warn colors when stale | ✅ |
| Re-analyze button turns `text-warn` when stale | ✅ |
| Staleness nudge inside the diagnosis card before action buttons | ✅ |

---

## Phase 23 — Today: Tended State + Dynamic Sections ✅
Surface care progress on the Today screen: show a celebratory strip when all plants are tended, and number only the sections that actually render.

| Task | Status |
|---|---|
| `tendedToday: number` prop passed from server component (computed from today's care logs) | ✅ |
| All-done green strip when `tendedToday >= cards.length && cards.length > 0` | ✅ |
| In-progress neutral strip showing "X of Y tended today" during the day | ✅ |
| Dynamic section numbering: `let sNum` + `nextSec()` increments only for rendered sections | ✅ |

---

## Phase 24 — Plant Age in Hero ✅
Show how long the user has had the plant without opening the dossier.

| Task | Status |
|---|---|
| Plant age in months computed from `acquired_date` (using `T12:00:00` to avoid UTC offset issues) | ✅ |
| Displayed in hero caption mono strip: `· 14mo` (omitted when no acquired date or < 1 month) | ✅ |

---

## Phase 25 — Plants: Neglected Sort ✅
Power users want to find their most neglected plant quickly.

| Task | Status |
|---|---|
| "Neglected" chip in sort row; sorts by `daysSinceWatered` descending (never-watered plants last) | ✅ |
| Metadata label updates: "By urgency" / "A–Z" / "Longest unwatered" | ✅ |

---

## Phase 26 — Add Plant: Location Presets from Collection ✅
Typing a location name on every new plant is tedious when you always use the same spots.

| Task | Status |
|---|---|
| On mount, fetch distinct `location` values from user's existing plants | ✅ |
| Replace hardcoded `LOCATION_PRESETS` with live data; fallback to defaults if no plants yet | ✅ |

---

## Phase 27 — Explore → Plant Detail Deep Link ✅
Users navigating the Field Guide should see when they already own the plant, and be able to jump to the entry.

| Task | Status |
|---|---|
| Explore `?species=` URL param: auto-triggers `fetchProfile(species)` on mount | ✅ |
| `userPlants` state in Explore: fetched on mount; filters by `plant.species || latestAnalysis?.species` | ✅ |
| "You have X" green callout inside species profile with links to each matching plant | ✅ |

---

## Phase 28 — Plant Detail → Field Guide Deep Link ✅
The reverse of Phase 27: from a plant's species guide section, jump to the full Explore profile.

| Task | Status |
|---|---|
| "Field Guide ↗" link in the expanded species guide section footer (alongside Refresh) | ✅ |
| Links to `/explore?species=SPECIES_NAME` which auto-loads the full Explore profile | ✅ |

---

## Phase 29 — Streak Strip Navigation ✅
The care streak chip on Today was a dead element — tapping it should go somewhere useful.

| Task | Status |
|---|---|
| Streak strip wrapped in `<Link href="/plants">` so tapping navigates to the collection | ✅ |

---

## Phase 30 — Me Screen: Streak ✅
The Me stats strip previously showed 3 stats (Plants, Care logs, Analyses) in a 3-col grid.
Adding the care streak makes it a 2×2 grid with a 4th metric.

| Task | Status |
|---|---|
| Fetch care logs for past year in Me `useEffect`; compute streak via `computeStreak()` | ✅ |
| Stats grid → 2×2 (Plants / Care logs / Analyses / Streak); flame icon for streak | ✅ |

---

## Phase 31 — Plant Detail: Share Button ✅
Users want to share a plant profile link (e.g. to show someone the health analysis).

| Task | Status |
|---|---|
| `arrow-up` share button in hero top-right button group | ✅ |
| `navigator.clipboard.writeText(window.location.href)` → "Link copied" toast | ✅ |

---

## Phase 32 — Relative Time in Journal Peek ✅
"Apr 15, 2026" in the Today journal peek is cold; "3 days ago" reads naturally.

| Task | Status |
|---|---|
| `relativeTime(iso)` utility in `lib/utils.ts` — today / yesterday / Xd / Xwk / Xmo | ✅ |
| Journal peek meta strip uses `relativeTime()` instead of `formatTimestamp()` | ✅ |

---

## Phase 33 — Today: Unscheduled Plants Nudge ✅
Plants with no watering interval set are silent — they never appear in the task list.
A small callout on Today surfaces them so the user sets a schedule.

| Task | Status |
|---|---|
| `unscheduled` computed from cards where `wateringStatus === 'unset'` | ✅ |
| Nudge strip shown when 1 ≤ unscheduled < total (i.e. not all plants are unscheduled) | ✅ |
| Links to `/plants`; shows count + "no watering schedule — set a reminder" | ✅ |

---

## Phase 34 — Analysis Log Entries: Expandable Care Recommendations ✅
The log book shows health text for AI analysis entries but omits the care recommendations.

| Task | Status |
|---|---|
| `expanded` local state in `HistoryRow` for analysis entries | ✅ |
| "See recommendations" / "Hide" toggle below health text | ✅ |
| Expanded: shows `care` text under a mono "Recommendations" label | ✅ |

---

## Phase 35 — Explore: Wikipedia Thumbnails for Recently Viewed ✅
Recently-viewed species in Explore showed gradient placeholders. Now they load thumbnails.

| Task | Status |
|---|---|
| `recentThumbs` state; `useEffect` on `recent` array fetches Wikipedia thumbnails | ✅ |
| Uses same Wikipedia REST API as suggestion grid; failures fall back gracefully | ✅ |
| Recently-viewed list renders `<img>` when thumbnail available | ✅ |

---

## Phase 36 — Explore: Context-Aware "Add to Collection" CTA ✅
The "I have one — add to collection" button showed even when the user already had the plant registered.

| Task | Status |
|---|---|
| When `matchingPlants.length > 0`: CTA text becomes "Add another to collection" | ✅ |
| When `matchingPlants.length === 0`: original "I have one — add to collection" | ✅ |

---

## Phase 37 — Plant Detail: AI ID badge in hero ✅
When a plant's species was identified by AI (not manually entered), the hero now shows a subtle "AI ID" badge next to the species name.

| Task | Status |
|---|---|
| `speciesFromAI` flag: true when `plant.species` is null but `latestAnalysis?.species` is set | ✅ |
| Semi-transparent frosted pill badge "AI ID" in hero species line | ✅ |

---

## Phase 38 — Analysis log entries: photo thumbnail ✅
Log book analysis entries now show a small thumbnail of the photo that was analysed.

| Task | Status |
|---|---|
| `photoUrl` prop on `HistoryRow` (optional); computed from `photos.find(p => p.id === item.data.photo_id)` | ✅ |
| 56×56 rounded thumbnail shown alongside the health text when photo is available | ✅ |

---

## Phase 39 — Plant Detail: Last measurement in dossier ✅
The most recent measurement log value now appears as a dossier row so it's easy to see at a glance without scrolling the log book.

| Task | Status |
|---|---|
| `lastMeasurementLog` derived from `careLogs.find(l => l.type === 'measured')` | ✅ |
| "Last measured" row in § 03 Dossier when a measurement log exists | ✅ |

---

## Phase 40 — Schedule Sections: Live Status ✅
The watering and fertilizing schedule choosers showed generic helper text even when a schedule was already set. Now they show actionable status.

| Task | Status |
|---|---|
| When interval set: show "Next in Xd" / "Due today" / "Overdue by Xd" in the appropriate tone color | ✅ |
| When no interval: fall back to the original descriptive text | ✅ |

---

## Phase 41 — Explore: Smart Back Navigation from Deep Link ✅
When arriving via `?species=` from Plant Detail, "Back to library" previously cleared the profile and showed the Explore library, stranding the user. Now it navigates to the browser history.

| Task | Status |
|---|---|
| `deepLinked` state set to true when `?species=` param detected on mount | ✅ |
| `handleBack()` calls `window.history.back()` when `deepLinked === true` | ✅ |

---

## Phase 42 — Plant Detail: Log count in hero caption ✅
The hero mono caption now includes total log count for a quick sense of the plant's history richness.

| Task | Status |
|---|---|
| `{careLogs.length} logs` appended to hero caption when at least one log exists | ✅ |

---

## Phase 14 — Editorial Redesign ✅
**Decision (2026-04-18):** full visual + UX overhaul to move the app out of "generic green app"
territory and into a field-guide journal aesthetic. Delivered option 2 of the design handoff scope:
visual redesign + new Today home, no schema changes. See "Editorial Design System" in CLAUDE.md
for the tokens, fonts, icon set, and primitives.

| Task | Status |
|---|---|
| Editorial palette tokens in `tailwind.config.ts` (paper/ink/accent/warn/danger) | ✅ |
| Google Fonts: Source Serif 4 + Inter + JetBrains Mono | ✅ |
| `components/Icon.tsx` — 39 single-stroke SVGs replacing every emoji in the UI | ✅ |
| `components/ui.tsx` — BigTitle, SectionLabel, Chip, StatusPip, HairlineButton | ✅ |
| `components/BottomNav.tsx` — floating pill: Today / Plants / Explore / Me | ✅ |
| `components/PlantPhoto.tsx` — deterministic warm blocky placeholder | ✅ |
| **New Today home** — task list (overdue/due-soon), streak strip, collection strip, journal peek from latest analysis | ✅ |
| **New Plants route** `/plants` — grid/list toggle, group by all/location/status | ✅ |
| **Plant Detail** — ditched 3-tab layout; single-scroll editorial layout with hero, status strip, AI diagnosis card, log book, dossier, schedule, species guide, photo strip, floating care dock | ✅ |
| **Add Plant** — 3-step wizard (identify → place → schedule); wires AI identification at step 1 | ✅ |
| **Explore** — category grid, featured carousel, recently-viewed (localStorage), redesigned species detail | ✅ |
| **Me** — identity card, sign out, about | ✅ |
| Build passes + browser test pass on desktop viewport | ✅ |

**Excluded from Phase 14 (per scope option 2):**
- Rooms schema (uses existing `plants.location` field as a soft room substitute)
- AI Journal table + edge function (journal peek uses most recent `analysis_results.health` text)
- Auth page restyling (sign-in / sign-up still use the old brand-green look, but still compile because `brand` token now maps to accent)

---

### Phase 14A — Redesign Polish ✅
Punch list from browser testing on 2026-04-18.

| Task | Status | Notes |
|---|---|---|
| Hide bottom nav on `/plant/[id]` so it doesn't stack with the care dock | ✅ | BottomNav returns null on `/plant/*`; dock repositioned from bottom 88 → 16 |
| Hide bottom nav on `/add-plant` (it's a modal-style wizard) | ✅ | BottomNav returns null on `/add-plant` |
| Cap Add Plant dropzone height so the Continue button stays visible without scrolling | ✅ | Outer div `h-screen` (was `min-h-screen`) + dropzone `min-h-[200px] max-h-[45vh]` (removed `aspectRatio: 1/1`) |
| Fix Add Plant header: close button (×) overlaps the progress bar | ✅ | Added `pt-2` to progress bar container for breathing room |
| Species guide quick-rows on Plant Detail: truncate to first sentence/bullet; full content only when expanded | ✅ | `firstLine()` helper strips leading bullet/dash, clips at first `\n` or `. ` — full text still visible in expanded SpeciesBlock |
| Status strip "Activity: 0" on a brand-new plant renders in danger red — too harsh | ✅ | 0 logs now uses `'unset'` tone (muted) instead of `'overdue'` (red) |
| Mobile pass: auth pages verified at 393px; app pages need device test | 🔄 | Sign-in and sign-up confirmed at iPhone 14 Pro width. App pages (add-plant, plant detail) need testing on real phone — browser extension couldn't authenticate during automated pass |
| Restyle `(auth)` pages in the Editorial palette | ✅ | Serif headlines, mono labels, paper bg, card panel, leaf icon wordmark, `HairlineButton` submit, Editorial error/focus colors |
| Photo overlay: tap to toggle (mobile-friendly) | ✅ | First tap reveals download + delete over dark scrim; second tap or tap-elsewhere hides. 40px tap targets. Document-level click listener for outside dismissal. |
| Review pass fixes (2026-04-18) | ✅ | `inputMode="decimal"` → `"text"` on measure input; `downloadPhoto()` wrapped in try/catch; `daysSinceRepot!` → `?? 0`; redundant `!== undefined` removed; dead `CARE_LOG_ICONS` export deleted |

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
- **2026-04-02** — Next.js migration fully verified on Vercel. Root cause of deployment 500 errors: `ua-parser-js` ncc bundle contains `__dirname` reference which crashes Edge Runtime (where middleware runs). Fixed with a prebuild patch script (`scripts/patch-ua-parser.js`) that rewrites the file before webpack sees it. Root cause of 404 errors: Vercel project settings had never been updated from the Expo era — Framework Preset was "Other" and Output Directory was overridden to "dist". Corrected to Framework Preset: Next.js, Output: default. App is live and functional.
- **2026-04-02** — Full end-to-end test pass completed on live app. All core flows verified: auth (sign up/in/out), My Plants grid, Add Plant (→ redirects to detail ✅), Plant Detail (Overview/History/Species tabs), care logging (all types), note logging, AI analysis display, Edit plant (all fields + date picker, router.refresh() working), Delete plant, Settings screen. One known UX gap confirmed: care action buttons give no visual feedback after tap (Phase 11D).
- **2026-04-03** — Phase 11D complete: care action toast feedback. Dark pill toast slides up above nav bar after every care log; auto-dismisses after 2.5s; re-triggers animation on rapid successive taps. "Watered" also calls router.refresh() to sync My Plants watering badge in the background.
- **2026-04-03** — Phase 11E complete: first-time UX improvements. Empty state now shows feature-highlight cards (AI analysis, care tracking, species guides). Plant detail no-photo placeholder is now a tappable CTA that opens the file picker and explains that photos unlock AI analysis.
- **2026-04-03** — Phase M9 complete: PWA verified on Android Chrome and iOS Safari. App installs to home screen and runs in standalone mode on both platforms.
- **2026-04-03** — All critical phases complete (M1–M9, 11D, 11E). App is ready to share with real users. Next: Phase 12 depth features.
- **2026-04-03** — Phase 11F complete: Plant Encyclopedia (Explore tab). Text search uses new `suggest-species` Edge Function to show a disambiguation grid with Wikipedia thumbnails before loading a profile. Photo search identifies species directly via `identify-species` Edge Function. Species profiles now use bullet-formatted content via `FormattedContent` renderer. Two new profile sections: Pruning Tips and Disease & Symptoms. `pruning_tips` and `disease_symptoms` columns added to `species_profiles` table.
- **2026-04-03** — Search disambiguation design decision: text search always shows a 2-col suggestion grid first (even for unambiguous queries) so users can confirm the match before the AI fetches a full profile. Photo search goes directly to profile — the photo already identifies the specific plant, so disambiguation isn't needed.
- **2026-04-18** — **Phase 14 complete: Editorial Botanical redesign.** Full visual + UX overhaul delivered from a Claude Design handoff bundle. Every `/(app)` screen rewritten; home replaced with a Today task list; Plant Detail moved from 3 tabs to a single editorial scroll; Add Plant became a 3-step wizard; Explore became a field-guide library; new "Me" tab. New design tokens (paper/ink/olive accent), Source Serif 4 + Inter + JetBrains Mono fonts, 39-icon single-stroke SVG set replacing all emoji. All existing data/logic preserved — zero schema changes. Legacy `brand` Tailwind token kept as compatibility shim.
- **2026-04-18** — Scope decision for Phase 14: went with "option 2" of the design — visual redesign + new Today home, but deferred Rooms schema changes and AI Journal table/edge function. Journal peek on Today uses the most recent `analysis_results.health` text as a stand-in.
- **2026-04-18** — Browser test completed on desktop viewport using Claude in Chrome. Real user data flows through every screen; no console errors. Five polish items found, tracked as Phase 14A. `resize_window` through the Chrome extension didn't narrow the window to phone width, so mobile-specific behaviors (dock/nav overlap, tap targets, safe-area insets) were NOT verified end-to-end — user needs to test on their phone or DevTools device mode.

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

## Phase 12 — Depth & Botanical Intelligence ✅
With the critical UX fixes in place, these features make the app meaningfully better for
anyone who takes plant care seriously. Each fills a gap that a real plant enthusiast would
notice immediately.

---

### Phase 12A — Health Score & Trend Tracking ✅
| Task | Status |
|---|---|
| Add `health_score` (integer 1–5) field to `analysis_results` table | ✅ |
| Update `analyze-plant` Edge Function prompt to also return a numeric health score | ✅ |
| Display health score badge on each analysis card in History tab | ✅ |
| Health trend sparkline on diagnosis card (requires 3+ analyses) | ✅ |

---

### Phase 12B — Fertilizing Reminder ✅
| Task | Status |
|---|---|
| Add `fertilizing_interval_days` column to the `plants` table | ✅ |
| Fertilizing reminder UI on Plant Detail screen (§ 05 interval selector) | ✅ |
| Show fertilizing status badge ("Fed") in the 2×2 status strip | ✅ |
| Include fertilizing urgency in the My Plants grid urgency sort | ✅ |

---

### Phase 12C — Soil Type Field ✅
| Task | Status |
|---|---|
| Add `soil_type` column to the `plants` table | ✅ |
| Soil type field in Add Plant screen and Plant Detail edit form | ✅ |
| Pass soil_type to analyze-plant Edge Function as part of plantContext | ✅ |

---

### Phase 12D — Photo Management & Comparison ✅
| Task | Status |
|---|---|
| Delete photo button on each thumbnail (confirm before delete) | ✅ |
| Compare mode: tap two photos to show side-by-side comparison below the rail | ✅ |

---

### Phase 12E — Seasonal Awareness ✅
| Task | Status |
|---|---|
| Pass current month/hemisphere to `analyze-plant` so AI gives season-appropriate advice | ✅ |
| Winter mode banner (Nov–Feb, northern hemisphere) with reduced-watering tip | ✅ |
| Seasonal care section added to `fetch-species-info` prompt (spring/summer/autumn/winter) | ✅ |

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

---

## Phase 43 — Explore: Species Detail Wikipedia Hero Photo ✅
Real photo in the species profile hero when Wikipedia thumbnail is available.

| Task | Status |
|---|---|
| `SpeciesDetail` converted to stateful component with `heroThumb` + `useEffect` | ✅ |
| Fetches Wikipedia `/api/rest_v1/page/summary/{scientificName}` on mount | ✅ |
| Shows real photo as hero when available; falls back to gradient placeholder | ✅ |

---

## Phase 44 — Today: Smarter Masthead & Unscheduled Plant Card ✅
Masthead adapts to user state; new zero-state card when no schedules exist.

| Task | Status |
|---|---|
| Masthead copy says "Set up a care schedule." when all plants are unscheduled | ✅ |
| "All caught up" card splits into two cases (good + unscheduled-only) | ✅ |
| "No schedules yet" card with link to /plants when all-unscheduled | ✅ |
| Nudge strip: "X plants have no schedule" chip links to /plants | ✅ |

---

## Phase 45 — Plant Detail: "More" Dock Tap-Outside Dismiss ✅
Extended existing document click listener to also close the More care panel.

| Task | Status |
|---|---|
| `setShowMore(false)` added to document click handler | ✅ |
| `e.stopPropagation()` on dock container and More panel div | ✅ |

---

## Phase 46 — Me Screen: Oldest Plant "Moment of Pride" ✅
Adds a personality card celebrating the user's oldest tracked plant.

| Task | Status |
|---|---|
| Query plants with `acquired_date`, sort to find oldest | ✅ |
| Show "§ 03 A moment of pride" section with nickname + duration | ✅ |
| Duration formatted as "2yr 3mo" or "8mo in your care" | ✅ |
| Account/About section numbers shift dynamically | ✅ |

---

## Phase 47 — Plant Detail: Edit Form Pre-fills Species from AI ✅
Edit form pre-populates species field from latest analysis when `plant.species` is blank.

| Task | Status |
|---|---|
| `useEffect` watches `latestAnalysis?.species` and sets `editSpecies` | ✅ |
| Only fires when `plant.species` is empty | ✅ |

---

## Phase 48 — Explore: Seasonal Featured Title ✅
Featured carousel title updates with current season.

| Task | Status |
|---|---|
| `season` computed from current month (Mar–May Spring, Jun–Aug Summer, etc.) | ✅ |
| Featured section renders as `Featured — ${season}` | ✅ |

---

## Phase 49 — Plant Detail: Acquired Date Shows Duration ✅
Acquired date in Dossier includes "Xyr Ymo in your care" context.

| Task | Status |
|---|---|
| Duration string computed from `acquired_date` to today | ✅ |
| Displayed inline: "March 15, 2024 · 2yr 3mo" | ✅ |

---

## Phase 50 — Plants Screen: Attention Count in Caption ✅
Mono header caption shows overdue plant count at a glance.

| Task | Status |
|---|---|
| `overdue` plants counted from enriched list | ✅ |
| Caption appended with "· X need attention" when any are overdue | ✅ |

---

## Phase 51 — Today: Section Number Padding ✅
Section numbers zero-padded consistently (§ 01, § 02, …).

| Task | Status |
|---|---|
| `§ ${String(++sNum).padStart(2, '0')}` pattern applied to all dynamic section labels | ✅ |

---

## Phase 52 — Plant Detail: Photo Count Indicators ✅
Hero carousel shows position indicator; style varies by photo count.

| Task | Status |
|---|---|
| 2–4 photos: dot indicators | ✅ |
| 5+ photos: "X / N" numeric counter | ✅ |

---

## Phase 53 — Plants Screen: Relative Last-Care Timestamps ✅
Last-watered label uses human-readable relative time instead of raw day count.

| Task | Status |
|---|---|
| `relativeTime()` from `lib/utils.ts` replaces manual day calculation | ✅ |
| "today", "yesterday", "3 days ago", "2 weeks ago", "3 months ago" | ✅ |

---

## Phase 54 — Explore: Preserve Search Results on Back ✅
Returning from a species profile restores the search results grid.

| Task | Status |
|---|---|
| `setSuggestions([])` removed from `fetchProfile()` | ✅ |
| Suggestions remain in state; "Back to results" shows the grid | ✅ |

---

## Phase 55 — Plant Detail: Full-screen photo lightbox ✅
Tapping a photo in the strip now opens it full-screen with navigation and actions.

| Task | Status |
|---|---|
| `lightboxIndex: number \| null` state replaces `revealedPhotoId` | ✅ |
| Fixed-position overlay: photo full-screen with black background | ✅ |
| ✕ close, left/right navigation arrows, "X / N" counter | ✅ |
| Download and Delete buttons in bottom bar | ✅ |
| Analyze button in lightbox bottom bar — analyze any historical photo | ✅ |

---

## Phase 56 — Today: 14-day activity strip ✅
Visual calendar of the last 14 days showing care activity at a glance.

| Task | Status |
|---|---|
| Server computes `activityDays: string[]` from existing careLogs | ✅ |
| Client renders 14 bar cells: taller + accent when active, short when empty | ✅ |
| Today cell has accent border highlight | ✅ |

---

## Phase 57 — Plant Detail: Delete care log (was already built) ✅
Previously implemented as `handleDeleteCareLog` + trash icon in HistoryRow.

---

## Phase 58 — Add Plant: Optional watering schedule ✅
Step 3 now allows skipping the watering interval entirely.

| Task | Status |
|---|---|
| `interval` state changed from `number` to `number \| null` | ✅ |
| "Skip for now" link sets interval to null | ✅ |
| Null interval card shows "No schedule" with option to set one | ✅ |

---

## Phase 59 — Plant Detail: Inline note editing ✅
Notes in the history timeline can be edited without creating a new entry.

| Task | Status |
|---|---|
| Edit icon visible on note-type care logs | ✅ |
| Tapping opens an inline textarea pre-filled with existing note | ✅ |
| Save updates Supabase + local state; Cancel dismisses | ✅ |

---

## Phase 60 — Plants: List view relative timestamps ✅
List view now shows "watered today" / "3 days ago" instead of raw "Xd".

| Task | Status |
|---|---|
| `relativeTime(c.lastWateredLog.logged_at)` replaces `{c.daysSinceWatered}d` | ✅ |

---

## Phase 61 — Me: Most-logged care type + most-active day ✅
Personality stats below the 2×2 grid on the Me screen.

| Task | Status |
|---|---|
| Query care log types; compute frequency map | ✅ |
| Compute day-of-week distribution from logged_at timestamps | ✅ |
| Show "Most logged: watered · Most active: Sundays" caption | ✅ |

---

## Phase 62 — Plant Detail: Health score trend arrow ✅
Up/down arrow badge in the AI diagnosis card when trend data is available.

| Task | Status |
|---|---|
| Compare last two health scores from `healthScores` array | ✅ |
| ↑ in accent (improving) or ↓ in danger (declining) | ✅ |

---

## Phase 63 — Plant Detail: Loading skeleton ✅
Editorial skeleton replaces centered spinner during client-side data fetch.

| Task | Status |
|---|---|
| Animated pulse skeleton matching hero + status strip + cards layout | ✅ |

---

## Phase 64 — Me: Most-active day of week ✅
Rolled into Phase 61 implementation.

---

## Phase 65 — Plant Detail: Last-repotted age in Dossier ✅
"Last repotted" row now shows "March 2023 · 1yr 2mo ago".

| Task | Status |
|---|---|
| Duration computed from `daysSinceRepot` (already available) | ✅ |
| Displayed inline: date + "· Xyr Ymo ago" | ✅ |

---

## Phase 66 — Plant Detail: Repotting-due nudge banner ✅
Banner appears when `last_repotted_date` > 12 months ago.

| Task | Status |
|---|---|
| Styled as a neutral ink-soft info strip above the winter care banner | ✅ |

---

## Phase 67 — Explore: Recently-viewed timestamps ✅
Recently-viewed entries now show "viewed today" / "yesterday" / "3 days ago".

| Task | Status |
|---|---|
| Storage format upgraded to `{ name: string; viewedAt: number }[]` | ✅ |
| Legacy `string[]` entries handled with `viewedAt: 0` fallback | ✅ |
| `relativeTime()` displayed below species name | ✅ |

---

## Phase 68 — Plant Detail: Analyze any photo from lightbox ✅
The photo lightbox adds an "Analyze" button so users can analyze any historical photo.

| Task | Status |
|---|---|
| `handleAnalyze()` refactored to accept optional `targetPhoto` param | ✅ |
| "Analyze" button added to lightbox bottom action bar | ✅ |

---

## Phase 69 — Plants: "Group by tag" view ✅
Fourth grouping option alongside location and status.

| Task | Status |
|---|---|
| `GroupBy` type extended with `'tag'` | ✅ |
| "By tag" chip in grouping row (only shown when any tags exist) | ✅ |
| `TagGroups` component: plants appear under each of their tags | ✅ |
| Plants with no tags appear in "Untagged" group | ✅ |

---

## Phase 70 — Today: Personalized single-plant greeting ✅
When exactly one plant needs attention, the masthead names it directly.

| Task | Status |
|---|---|
| `totalTodo === 1` case: "{Plant name} needs you." | ✅ |

---

## Phase 71 — Plant Detail: Smart dock — "done today" indicators ✅
Dock buttons show a green checkmark badge and dimmed color when that care type was already logged today.

| Task | Status |
|---|---|
| `doneToday: Set<string>` computed from today's care logs | ✅ |
| `done` prop added to `DockButton` | ✅ |
| Green accent dot badge + muted color when done | ✅ |

---

## Phase 72 — Plant Detail: Care history CSV export ✅
"Export CSV" button in the Log book section header downloads a timestamped CSV of all care logs.

| Task | Status |
|---|---|
| CSV generated client-side from `careLogs` state | ✅ |
| Properly escapes quotes in notes column | ✅ |
| Filename: `{nickname}-care-log.csv` | ✅ |

---

## Phase 73 — Plant Detail: Last-repotted age in Dossier ✅
(Documented as Phase 65 — duplicate entry.)

---

## Phase 74 — Plants: Contextual care label on grid cards ✅
`lastCareLabel()` now shows "overdue by Xd", "due today", "water in Xd", or falls back to relative time.

| Task | Status |
|---|---|
| Overdue: "overdue by Xd" in priority | ✅ |
| Due soon: "due today" | ✅ |
| Upcoming (1–7d): "water in Xd" | ✅ |
| Otherwise: relative last-watered time | ✅ |

---

## Phase 75 — Plant Detail: Health score trend arrow ✅
(Documented as Phase 62 — duplicate entry.)

---

## Phase 76 — Plant Detail: Tap species name to copy ✅
Tapping the species name in the hero copies it to clipboard with a toast confirmation.

| Task | Status |
|---|---|
| Species line wrapped in `<button>` | ✅ |
| `navigator.clipboard.writeText()` + "Species name copied" toast | ✅ |

---

## Phase 77 — Plants: Quick-log from list view ✅
Water/feed buttons appear on overdue/due-soon plants in list view, mirroring the Today task list.

| Task | Status |
|---|---|
| `quickLog` mutation added to `PlantsClient` | ✅ |
| `List` component shows action buttons on actionable plants | ✅ |
| Toast confirmation after log; `router.refresh()` updates data | ✅ |
| All group views (location, status, tag) thread `quickLog` through | ✅ |

---

## Phase 78 — Explore: Recently-viewed timestamps ✅
(Documented as Phase 67 — duplicate entry.)

---

## Phase 79 — Plant Detail: Analyze from lightbox ✅
(Documented as Phase 68 — duplicate entry.)

---

## Phase 80 — Today: Sort overdue plants by severity ✅
Within "Needs attention", plants sorted by how many days past-due their worst need is.

| Task | Status |
|---|---|
| `overdue` useMemo sorts by `max(wateringOverdueDays, fertilizingOverdueDays)` | ✅ |

---

## Phase 86 — Today: "Water all overdue" bulk action ✅
When ≥2 plants have overdue watering, a "Water all" action on the "Needs attention" SectionLabel batch-inserts watered logs for all of them in one tap. Uses its own `bulkLogging` state to prevent concurrent calls; shows a "Watered N plants" toast on completion.

## Phase 87 — Add Plant: Fertilizing interval in Step 3 ✅
Step 3 now has a second section for fertilizing schedule (default: skip). Options: 14, 21, 30, 45, 60, 90 days. Stored in `fertilizing_interval_days` on the plant row.

## Phase 88 — Today: "All caught up" shows next-up plant ✅
When totalTodo === 0 and upcoming plants exist, the "All caught up" card shows a mono caption: "Next up · [nickname] · [label] in [N]d".

## Phase 89 — Plant Detail: Growth chart from measurement logs ✅
When ≥2 measured logs have parseable numeric values (e.g. "42cm"), a CSS bar chart is shown in the dossier with date labels. Bars are proportional to max measurement value.

## Phase 90 — Me: Export my data ✅
"Export my data" button in Account section fetches all plants, care_logs, analysis_results, and photos for the user and downloads as `viriditas-export-YYYY-MM-DD.json`.

## Phase 91 — Me: "Last tended" stat ✅
Shows which plant was most recently cared for and how long ago, as a caption under the stats grid.

## Phase 92 — Explore: "Clear" recently viewed ✅
SectionLabel for "Recently viewed" now has a "Clear" action that removes the localStorage entry and resets the `recent` state.

## Phase 93 — Plant Detail: Fertilizing interval in dossier ✅
`fertilizing_interval_days` now shown as "Feed interval" in the dossier, alongside "Water interval" (renamed from "Interval").

## Phase 94 — Plant Detail: Log book entry count ✅
SectionLabel title for the log book now reads "Log book — N" where N is the total care log count.

## Phase 95 — Add Plant: Acquired date in Step 2 ✅
Step 2 now includes an optional "When did you get it?" date picker. Stored in `acquired_date` on the plant row.

## Phase 96 — Plant Detail: Timeline filter counts ✅
Filter chips (All / Care / Notes / Analysis) now show entry counts inline: "Care 12", "Notes 3", etc.

## Phase 97 — Me: Best streak ever ✅
Added `computeMaxStreak()` to `lib/utils.ts`. Me page shows "Best streak ever · N days" when the historical max exceeds the current streak.

## Phase 98 — Me: "Plants tended this week" ✅
Counts distinct plants cared for in the last 7 days from care_logs data; shown as a caption under the stats grid.

## Phase 99 — Plant Detail: "Tracked since" in dossier ✅
When `acquired_date` is not set, shows "Tracked since [created_at date]" in the dossier so there's always a time reference.

## Phase 100 — Plant Detail: Journal-style note rendering ✅
Note-type log entries now render in serif italic at 15px with smart quotes, evoking a field journal. Previously plain 12px sans-serif.

---

## Phase 101 — Plant Detail: Average watering frequency in status strip ✅
Computes average days between watered logs (if ≥2 exist). The Activity StatusStat sub-label shows "avg water Nd" instead of "logs · 30d" when this is available.

## Phase 102 — Plant Detail: "Also in collection" related plants ✅
When a plant's species is known, fetches other plants of the same species owned by the user. Shown in the dossier as clickable nickname pills linking to each related plant's detail page.

## Phase 103 — Today: Progress-aware masthead ✅
When some plants are done but more are pending, the masthead subtitle now reads "N done · M more to go." instead of a plain count.

## Phase 104 — Plants Grid: Urgency-aware card borders ✅
Overdue plants get a `border-danger/40` border; due-soon plants get `border-warn/40`; settled plants keep the neutral `border-rule`. Makes urgency immediately scannable in the grid.

## Phase 105 — Plant Detail: Per-plant care streak in status strip ✅
Replaces the Photos stat with a Streak stat. Uses `computeStreak()` on the plant's own care logs. Shows "Nd consecutive" when streak ≥ 1 day.

## Phase 106 — Plant Detail: "Add your first photo" hero prompt ✅
When a plant has no photos, the gradient placeholder now shows a centered camera button with "Add your first photo" label, guiding new users to add their first photo.

## Phase 107 — Plants Grid: "New" badge for recently added plants ✅
Plants added within the last 7 days show a small "New" badge next to their nickname in the grid.

## Phase 108 — BottomNav: Overdue badge on Today tab ✅
TodayClient writes `viriditas.overdueCount` to localStorage on each render. BottomNav reads this value on pathname change and shows a red dot on the Today icon when count > 0 and the user isn't already on Today.

## Phase 109 — Today: Weekly care count in activity strip ✅
The right label under the 14-day activity grid now shows "N logs · this week" (computed server-side from care_logs). Gives users a quick weekly pulse check.

## Phase 110 — Plant Detail: "Done today" care summary strip ✅
When any care has been logged today (tracked via `doneToday` Set), a green strip appears below the status stats showing which care types were completed today.

## Phase 111 — Plant Detail: Activity stat shows lifetime care total ✅
The "Activity" status stat now shows total lifetime care events (excluding notes) as the value, with "N this month" as the sub-label. Gives a better sense of how well-cared-for the plant has been over its whole life.

## Phase 112 — Plants: Care status quick-filter row ✅
Color-coded filter chips ("Overdue · N", "Due soon · N", "Healthy · N") appear above the tag chips when the collection has any plants with urgent/due care. Each chip filters the plant list to show only plants in that status tier. Chips only render when they'd show at least one plant.

## Phase 113 — Today: Journal peek shows plant cover photo ✅
The journal peek card on Today now includes a photo thumbnail on the left when the plant has a cover photo. The `JournalPeek` type now carries `coverPhotoUrl`; the server component looks up the photo from the existing `coverPhotoMap`.

## Phase 114 — Plant Detail: "Best month" insight in dossier ✅
The most active calendar month (the month with the most care log entries for this plant, if ≥3 entries in that month and ≥5 total logs) is shown in the dossier as "Best month · March 2025 · N logs".

## Phase 115 — Plant Detail: "Last tended" relative time in hero caption ✅
The hero caption strip now shows relative time since the last care log (e.g. "2d ago") instead of the raw log count. Requires `relativeTime` import added to the plant detail file.

## Phase 116 — Plant Detail: Analysis count in § 01 section header ✅
The "AI Diagnosis" section header (§ 01) now shows the total number of analyses in the title: "§ 01 · AI Diagnosis — 4". Gives users a quick sense of how often they've analyzed this plant.

## Phase 117 — Today: "Coming up" section label shows count ✅
The "Coming up" SectionLabel now reads "Coming up — N" showing how many upcoming care tasks exist in the 2–7 day window.

## Phase 118 — Plant Detail: Watered/fed totals above schedule sections ✅
A compact stat row above the watering schedule section shows "Watered N×", "Fed N×", and "avg every Nd" from the care history. Gives context before the user adjusts intervals.

## Phase 119 — Plants list view: days-since-watered annotation ✅
In list view, the plant's days-since-watered appears as a colored suffix (e.g. "· 8d") after the species/location in danger/warn/muted color based on watering status. Only shown when a watering schedule is set.

## Phase 120 — Plants: Care filter empty state ✅
When a care filter chip is active ("Overdue", "Due soon", or "Healthy") but zero plants match, a friendly empty state card is shown with a contextual message and a "Show all" link to clear the filter.

## Phase 121 — Plant Detail: "First tended" date in dossier ✅
The oldest care log date is shown in the dossier as "First tended · [date] · Xmo ago", giving a sense of how long the plant has been actively looked after.

## Phase 122 — Today: Collection strip cards show urgency-colored borders ✅
Cards in the Today collection strip now have colored borders — `border-danger/50` for overdue plants and `border-warn/50` for due-soon plants — matching the Plants grid card style.

## Phase 123 — Plant Detail: Species guide shows guide-fetched date ✅
When the species guide is expanded (speciesOpen), a "Guide fetched X ago" caption appears below the refresh/field-guide links, using `relativeTime(speciesProfile.fetched_at)`.

## Phase 124 — Today: "Feed all" bulk action alongside "Water all" ✅
The overdue section now supports two bulk action buttons when ≥2 plants need water and/or feed. `waterAllOverdue()` refactored into `bulkLog(type)`. Buttons only appear for the relevant care type when ≥2 targets exist.

## Phase 125 — Plant Detail: Next watering/feeding shows actual calendar date ✅
The watering and fertilizing schedule sections now show "Next in Nd · Wed Apr 22" when the plant is not yet overdue — computed by adding `daysLeft * 86400000` to `Date.now()` and formatting with the browser's locale.

## Phase 126 — Me: Plants per location distribution ✅
A horizontal bar-chart list in the Me page shows how many plants are in each location. Bars are proportional to total plant count; only shown when ≥2 distinct locations exist with at least one named location.

## Phase 127 — Plant Detail: Analysis health trend pill ✅
When ≥2 health scores exist, a colored pill (↑ improving / → stable / ↓ declining) appears next to the score in the AI diagnosis header, computed by comparing the two most recent `health_score` values.

## Phase 128 — Plant Detail: Next feeding shows actual calendar date ✅
Same pattern as Phase 125 — the fertilizing schedule section now shows the actual calendar date alongside the day-count when the plant is not overdue.

## Phase 129 — Today: Activity strip left label shows active-days count ✅
The left label under the 14-day activity strip now reads "N active days" (counting only the bars with logged care) instead of the static "14 days ago". Gives a quick activity density read.

## Phase 130 — Plant Detail: Monthly separator in log book timeline ✅
When consecutive timeline entries cross a calendar month boundary, a centered "Month YYYY" hairline separator is injected between them. Uses `React.Fragment` to keep the list DOM clean.

## Phase 131 — Plant Detail: Overdue badge on care dock buttons ✅
When watering or fertilizing is overdue, the corresponding dock button (Water / Feed) shows a red dot indicator. The `DockButton` component gains an `urgent` prop that renders a `bg-danger` dot. Only shown when not already `done`.

## Phase 132 — Plants: "By tag" chip shows tag count ✅
The grouping chip now reads "By tag · N" showing the number of distinct tags in the collection.

## Phase 133 — Plant Detail: Photos-per-month rate in photo section header ✅
When ≥2 photos exist, the § 07 header now shows "· N.N/mo" — the average photos added per month over the span from oldest to newest photo.

## Phase 134 — Explore: Copy scientific name button on species hero ✅
A small glass-effect button on the species profile hero copies the scientific name (or species_name if unavailable) to clipboard. Uses `navigator.clipboard.writeText`.

## Phase 135 — Plant Detail: Full care-event summary above schedule sections ✅
The care totals row (previously only showing watered + fed) now also shows misted and pruned event counts when present. All four are computed from `careLogs` and rendered as icon + count pills.

## Phase 136 — Today: Season label in masthead caption ✅
The "Vol. I · Saturday, Apr 18" masthead caption now includes a season suffix: "· Spring", "· Summer", "· Autumn", or "· Winter" based on the current calendar month.

## Phase 137 — Plant Detail: "Xd overdue" sub-label in status strip ✅
When watering or fertilizing is overdue, the sub-label under the stat value changes from "every Nd" to "Xd overdue" (how many days past the interval the plant is). Gives a clearer picture of how urgent the situation is.

## Phase 138 — Plant Detail: "Repotted N times" in dossier ✅
When any `repotted` care logs exist, a "Repotted · N times" dossier row is shown. Displayed after the "First tended" row.

## Phase 139 — Me: "Avg logs per plant" stat caption ✅
A "N avg logs per plant" line is shown below the other caption stats, computed as `totalLogs / totalPlants`. Only shown when both are > 0.

## Phase 140 — Plant Detail: Activity stat "start logging" sub-label ✅
When `totalCareEvents === 0`, the Activity stat sub shows "start logging" (vs "0 this month" when there are some lifetime logs but none this month). Makes the empty state feel more actionable.
