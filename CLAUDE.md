# Viriditas — Project Instructions for Claude

## What This App Is
Viriditas is a houseplant care guide, companion, and plant registry app. Users can photograph plants for AI-powered health analysis and species identification, register and track individual plants over time (care logs, health history, photo records), and access expert care guidance. The goal is for each registered plant to have a rich, comprehensive profile — combining encyclopedic species knowledge with the user's personal observations, photos, and care history.

## The Developer
Kyle is a beginner developer who relies on Claude to write most of the code. Always:
- Explain decisions and tradeoffs before writing code
- Anticipate problems the user may not know to ask about
- Give explicit step-by-step instructions for any manual setup steps
- Add comments to code explaining what each part does
- Specify filenames and where they belong in the project structure
- Build incrementally — get something working first, then improve it

## Tech Stack
| Layer | Tool |
|---|---|
| Mobile + Web UI | Expo (React Native) with Expo Router |
| Auth | Supabase Auth |
| Database | Supabase (PostgreSQL) |
| File/Photo Storage | Supabase Storage |
| AI Integration | Supabase Edge Functions → configurable AI provider (currently Claude API via claude-haiku-4-5-20251001; Gemini also supported) |
| Push Notifications | Expo Notifications |
| Deployment | EAS Build |

**Language:** TypeScript throughout.

## Project Structure
```
viriditas/
  app/
    (auth)/             # Auth screens (not shown in URL)
      _layout.tsx       # Auth stack layout
      sign-in.tsx       # Sign in screen
      sign-up.tsx       # Sign up screen
    (tabs)/             # Tab navigator screens
      _layout.tsx       # Tab bar layout
      index.tsx         # My Plants screen (main tab)
      explore.tsx       # Repurposed: shows species profile for a selected plant
    plant/
      [id].tsx          # Plant Detail screen (dynamic route)
    add-plant.tsx       # Add Plant screen
    _layout.tsx         # Root layout — auth gating lives here
  components/           # Reusable UI components
  lib/
    supabase.ts         # Supabase client (single shared instance)
    notifications.ts    # Safe wrapper around expo-notifications (handles Expo Go)
    types.ts            # Shared TypeScript types (Plant, PlantPhoto, etc.)
  supabase/
    functions/
      analyze-plant/
        index.ts        # Edge Function: AI plant analysis (provider-swappable)
      fetch-species-info/
        index.ts        # Edge Function: AI species profile fetch (provider-swappable)
  assets/               # Images, fonts, icons
  .env.local            # API keys — never commit this file
```

## What Has Been Built
- [x] Expo project initialized with Expo Router
- [x] Supabase project created and connected
- [x] `lib/supabase.ts` — shared Supabase client; AsyncStorage on native, localStorage on web (SSR-safe)
- [x] Environment variables configured via `.env.local` (EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY)
- [x] User authentication — sign up, sign in, sign out, auth-gated navigation
- [x] `app/(auth)/sign-in.tsx` and `app/(auth)/sign-up.tsx`
- [x] `app/_layout.tsx` — auth state listener with automatic routing
- [x] `plants` table in Supabase with RLS policies (users see only their own plants)
- [x] `lib/types.ts` — Plant and PlantPhoto types defined
- [x] `app/(tabs)/index.tsx` — My Plants list screen with empty state
- [x] `app/add-plant.tsx` — Add Plant form
- [x] `app/plant/[id].tsx` — Plant Detail screen with photo gallery, AI analysis, edit, and delete
- [x] `plant-photos` Supabase Storage bucket and `photos` table with RLS policies
- [x] `supabase/functions/analyze-plant/index.ts` — Edge Function for AI plant analysis
- [x] AI analysis UI — "Analyze Plant" button + results card (species, health, care tips)
- [x] `analysis_results` table in Supabase with RLS policies
- [x] Analysis results saved to DB after every run; history shown in collapsible section on Plant Detail screen
- [x] Progress-aware AI prompts — up to 3 previous analyses sent as context so Claude can describe changes over time
- [x] `care_logs` table in Supabase with RLS policies
- [x] Care logging UI — quick-tap Watered/Fertilized buttons + custom Note input on Plant Detail screen
- [x] Care history shown in collapsible list on Plant Detail screen
- [x] `expo-notifications` installed via `lib/notifications.ts` safe wrapper (Expo Go compatible)
- [x] Per-plant watering reminders — 5 preset intervals (3/5/7/10/14 days); stored in `plants.watering_interval_days`; notification ID in AsyncStorage
- [x] `species_profiles` table in Supabase (keyed by species name, shared across all users, RLS: authenticated read)
- [x] `supabase/functions/fetch-species-info/index.ts` — Edge Function: AI-powered species profile fetch (Claude-powered, provider-swappable, forceRefresh support)
- [x] Species profile auto-fetched in background after first AI analysis identifies a species
- [x] Species profile displayed on Plant Detail screen as collapsible reference card (light, watering, humidity, temperature, soil, toxicity, common problems, growth habits, propagation)
- [x] Species profile passed as context into `analyze-plant` so health analyses are species-aware
- [x] "Refresh" button on Plant Detail screen regenerates species profile on demand
- [x] `lib/types.ts` — `SpeciesProfile` type added
- [x] App icon — plant sprout on brand green (#2d6a4f), 1024×1024 PNG; used for icon, splash, and favicon
- [x] `components/PageContainer.tsx` — responsive layout wrapper; constrains content to 800px max-width on web, passthrough on native
- [x] `lib/notifications.ts` — updated to skip expo-notifications on web (`Platform.OS === 'web'`) in addition to Expo Go
- [x] `vercel.json` — Vercel deployment config (build command, output directory, SPA rewrites)
- [x] Web deployment live on Vercel — full app accessible via browser on any device
- [x] Web SSR crash fixed: `lib/supabase.ts` uses `Platform.OS === 'web'` to avoid AsyncStorage during Expo's Node.js static render pass
- [x] Web UI fixes: JSX comment rendering bug fixed; scrollbar hidden on plant detail; max-width increased to 800px
- [x] `app/(tabs)/index.tsx` — My Plants rebuilt as 2-column photo grid with watering status badges and attention banner
- [x] `app/plant/[id].tsx` — Plant Detail rebuilt as tabbed layout (Overview / History / Species); fixed header; quick-action bar always visible
- [x] History tab — unified timeline merging care logs and AI analyses, sorted newest first
- [x] Species tab — full species profile without collapsing; uses `latestAnalysis?.species` fallback so it works even when `plants.species` is null
- [x] Five new care log types: repotted, pruned, misted, pest_treatment, moved — behind a collapsible "More actions" row
- [x] Four new `plants` table columns: `location`, `pot_size`, `acquired_date`, `last_repotted_date`
- [x] `app/add-plant.tsx` — location and acquisition date fields added
- [x] `analyze-plant` Edge Function — accepts `plantContext` (location, pot_size) and weaves it into the prompt
- [x] `app/(tabs)/index.tsx` — Phase 10D Today View: plants sorted by urgency (overdue → due-soon → good → unset); separate overdue (red) and due-soon (amber) banners; green "All caught up!" banner when nothing is overdue; care streak chip (🔥 N-day streak) computed from all care_logs in the past year
- [x] `app/plant/[id].tsx` — Phase 11A: watering notification auto-rescheduled when "watered" care log is saved; `rescheduleWateringNotification()` cancels old notification and schedules fresh one from now; silently no-ops when no interval is set or in Expo Go/web
- [x] `app/(tabs)/settings.tsx` — Phase 11B: Settings screen with signed-in email, Sign Out button (confirmation Alert → supabase.auth.signOut()), and About section
- [x] `app/(tabs)/_layout.tsx` — Explore tab replaced with Settings tab (gearshape.fill icon); Home tab relabelled "My Plants"
- [x] `components/ui/icon-symbol.tsx` — Added gearshape.fill → settings mapping for Android/web

## What Comes Next
See ROADMAP.md for the full feature breakdown and phase plan.

## Plant Profile Architecture
Each plant in Viriditas has two layers of information that together form its complete profile:

**Layer 1 — Personal data (user-specific, evolves over time):**
- Nickname, notes, location, pot size, acquisition date, last repotted date, and photos
- AI health analyses and species identifications over time
- Care logs (watered, fertilized, note, repotted, pruned, misted, pest_treatment, moved)
- Watering reminder interval

**Layer 2 — Species reference data (encyclopedic, fetched once and cached permanently):**
- Generated by the `fetch-species-info` Edge Function using the Claude API when a species is identified
- Stored in the `species_profiles` table, keyed by species name, shared across all users
- Covers: light, water, humidity, soil, temperature, toxicity, common problems, growth habits, propagation
- Displayed as a permanent reference section on the Plant Detail screen
- Fetched at most once per species globally — any subsequent user with the same plant gets the cached version instantly, with no API call
- Refreshable by the user on demand if they want updated information
- Also passed as context to `analyze-plant` so health analyses are species-aware

**Why Claude for species data:**
Third-party plant databases (e.g. Perenual) restrict most of their species catalog to paid
plans and introduce an additional external dependency. Claude has comprehensive knowledge of
common houseplants, covers any species without catalog limits, returns naturally readable
text, and uses infrastructure already in place. The per-species caching model means ongoing
API costs are negligible — the AI is called once per species, ever.

**How the layers combine:**
When the user runs an AI health analysis, the app passes the cached species profile alongside
the photo and care history. This makes every analysis species-aware: Claude already knows
what "normal" looks like for that plant, what its common problems are, and what its care
requirements are — before it even looks at the photo.

## Coding Conventions
- Use TypeScript (`.tsx` for files with JSX, `.ts` for pure logic)
- Use `StyleSheet.create()` for React Native styles (not inline style objects)
- Import Supabase via `import { supabase } from '@/lib/supabase'`
- Import shared types via `import { Plant } from '@/lib/types'`
- Keep screens in `app/`, reusable components in `components/`, shared logic in `lib/`
- Never put API keys or secrets in app code — use `.env.local` and Supabase Edge Functions
- Use `npx expo install` for packages with native dependencies; `npm install` for pure JS packages
- Use `useFocusEffect` + `useCallback` to refresh data when navigating back to a screen
- Dynamic routes use folder/[param].tsx pattern (e.g. `app/plant/[id].tsx`)

## Important Notes
- Kyle is on a Mac, developing for Android (Expo Go on Android device)
- Both Mac and Android must be on the same Wi-Fi network for live preview
- Restart `npx expo start` after any changes to `.env.local`
- AI API keys must never be in frontend code — they belong in a Supabase Edge Function as secrets
- Supabase email confirmation is currently disabled (for development); re-enable before launch
- **Expo Router 6 auth gating:** `useSegments()` and `usePathname()` are unreliable during initial render. Use pure session-based routing in `_layout.tsx` — redirect to `/(tabs)` if session exists, `/(auth)/sign-in` if not. The effect only re-runs when session/loading changes, so it won't interrupt sign-up navigation.
- **Uploading images to Supabase Storage:** React Native's `Blob` does not support `.arrayBuffer()`. Always use `base64: true` in ImagePicker options, then decode manually: `atob(base64)` → `Uint8Array` → `.buffer` for the upload call. Always pass `asset.mimeType` (not a hardcoded `'image/jpeg'`) as the `contentType` in the upload options — browsers commonly produce WebP, and a mismatched content type will cause the Claude API to reject the image during analysis.
- **Image format detection in Edge Functions:** Never trust the `Content-Type` header from Supabase Storage — it reflects whatever was declared at upload time and may be wrong. Instead, detect the real format from magic bytes: WebP starts with `RIFF....WEBP` (bytes 0–3 and 8–11), PNG with `\x89PNG`, GIF with `GIF8`, JPEG with `\xFF\xD8\xFF`. See `fetchImageAsBase64` in `analyze-plant/index.ts` for the implementation.
- **Zsh glob issue with dynamic route filenames:** In zsh, `git add app/plant/[id].tsx` fails because `[id]` is treated as a glob pattern. Always quote the path: `git add 'app/plant/[id].tsx'`.
- **AI Edge Function invocation:** `supabase.functions.invoke` does not reliably inject the auth token in React Native. Always get the session explicitly and pass it: `const { data: { session } } = await supabase.auth.getSession()`, then pass `headers: { Authorization: \`Bearer ${session.access_token}\` }`.
- **Edge Function deployment:** Deploy with `--no-verify-jwt` flag (`supabase functions deploy analyze-plant --no-verify-jwt`) — the function does its own auth via the explicitly passed token. Standard JWT verification at the gateway level fails in React Native.
- **AI provider switching:** Controlled by the `AI_PROVIDER` Supabase secret. Set to `claude` (current) or `gemini`. Requires a redeploy after changing. Claude model: `claude-haiku-4-5-20251001`. Gemini model: `gemini-2.5-flash`.
- **Base64 encoding in Edge Functions:** Use Deno's std library (`import { encode as encodeBase64 } from 'https://deno.land/std@0.168.0/encoding/base64.ts'`) — do not use `btoa()` with manually built binary strings on large images as it can fail.
- **expo-notifications in Expo Go and web:** Remote push notifications were removed from Expo Go in SDK 53, and expo-notifications is not supported on web at all. Always use `lib/notifications.ts` wrapper (never import `expo-notifications` directly). The wrapper skips the module when `Platform.OS === 'web'` OR `Constants.appOwnership === 'expo'`; notifications work fully in development/production native builds.
- **Web deployment:** `vercel.json` is configured for static export via `npx expo export --platform web` into `dist/`. Environment variables (EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY) must be set in the Vercel dashboard — they are not read from `.env.local` during Vercel builds.
- **Supabase client on web:** `lib/supabase.ts` uses `Platform.OS === 'web' ? undefined : AsyncStorage` for the `storage` option. This avoids a `window is not defined` crash during Expo's static render pass (which runs in Node.js). On web, Supabase defaults to `localStorage` in the browser and handles missing `localStorage` gracefully during SSR.
- **Responsive layout:** `components/PageContainer.tsx` wraps screens to cap content at 800px max-width on web. On native it is a transparent passthrough. Wrap the outermost return element of any screen that needs responsive behavior.
- **JSX comments in web screens:** Always use `{/* comment */}` syntax inside JSX — never `// comment`. JavaScript-style `//` comments placed as JSX children render as visible text on screen.
- **ScrollView on web:** Add `showsVerticalScrollIndicator={false}` to ScrollViews in screens wrapped with PageContainer. This suppresses the internal scrollbar track, which looks out of place in a browser. Content is still fully scrollable via mouse wheel and trackpad.
- **Photo grid pattern:** Use `flexDirection: 'row', flexWrap: 'wrap'` on a View for a 2-column grid. Each card uses `width: '50%'` with padding for gutters. Use a `cardOuter` (width + padding) + `cardInner` (aspectRatio + borderRadius + overflow: hidden) two-layer structure so the border radius clips the photo correctly. Use `StyleSheet.absoluteFillObject` on the Image for full-bleed background photos.
- **Enriching plant list data efficiently:** Fetch plants, then fetch photos and care_logs with `.in('plant_id', plantIds)` — 3 total queries regardless of collection size. Build lookup maps in JavaScript (first occurrence per plant_id = most recent, since queries are ordered descending).
- **care_logs type constraint:** The `type` column on `care_logs` has a CHECK constraint. If you add new care log types, run `ALTER TABLE care_logs DROP CONSTRAINT IF EXISTS care_logs_type_check; ALTER TABLE care_logs ADD CONSTRAINT care_logs_type_check CHECK (type IN (...all values...));` in the Supabase SQL editor. Current allowed values: `watered`, `fertilized`, `note`, `repotted`, `pruned`, `misted`, `pest_treatment`, `moved`.
- **Two species fields — don't conflate them:** `plants.species` is set only when the user manually types a species in the Edit form. `analysis_results.species` is what the AI identified. Always check both when species is needed: `const knownSpecies = plant?.species || latestAnalysis?.species`. Using only `plant.species` will make species-dependent UI appear broken even after a successful analysis.
- **In-screen tab pattern:** Use a custom tab bar (row of `TouchableOpacity` items with a bottom border indicator) + a single `ScrollView` whose content switches on an `activeTab` state variable. This is distinct from Expo Router's file-based bottom tab navigator. Active tab uses `borderBottomColor: '#2d6a4f'`; inactive tabs use `'transparent'`.
- **Care streak computation:** `new Date(isoStr).getFullYear/getMonth/getDate` all return local time, so converting UTC timestamps to YYYY-MM-DD using these methods gives local-timezone dates. Use this approach (not `toISOString().split('T')[0]`) to avoid day-boundary bugs in non-UTC timezones. A streak counts consecutive local calendar days with any care log. If today has no care yet, the streak is still "alive" if yesterday was logged — check yesterday before returning 0.
- **Urgency sort on plant grid:** Sort the enriched PlantCard array with `statusOrder = { overdue: 0, 'due-soon': 1, good: 2, unset: 3 }` before setting state. JavaScript's `Array.sort` is stable in V8/Hermes, so plants within each tier keep their original creation order.
- **Notification sync with care logging:** Watering notifications must be rescheduled every time a "watered" care log is saved, otherwise the push alert fires on the original schedule while the in-app badge shows the correct remaining time. The `rescheduleWateringNotification(days)` helper in Plant Detail cancels the existing notification, schedules a fresh one from now, and updates AsyncStorage. It silently no-ops when `watering_interval_days` is null or in Expo Go/web. Always call this after inserting a "watered" care log when the plant has an interval set. Never call `supabase.from('plants').update` inside `rescheduleWateringNotification` — the interval hasn't changed, only the schedule needs updating.
