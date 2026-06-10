# Viriditas — AI Care Assistant: Product Assessment & Implementation Spec

_Author: PM assessment session (Claude Fable 5, Cowork), 2026-06-10. Baseline: v1.5.2 (`c22dc3f`)._

**What this document is.** A full product assessment of Viriditas against Kyle's vision, followed by a phased, implementation-ready specification. It is the handoff artifact for Claude Code implementation sessions. Every factual claim about the current codebase was verified against the repo at the baseline commit.

**For the implementing session:** read `CLAUDE.md` first (conventions, schema, gotchas), then `docs/ARCHITECTURE.md` and `docs/DATABASE.md`. Work one phase at a time, in order. Each phase ends with: build passing (`npm run build`), docs + `CHANGELOG.md` updated per the versioning convention (each phase = one MINOR bump), and a list of flagged manual steps (SQL migrations, `supabase functions deploy`, new secrets, `git push`). The same execution pattern as the v1.5.0 remediation session applies: if a step can't be automated, flag it and continue.

---

## Part I — The Vision, and Where the App Stands

### The vision (verbatim intent)

> "I have many houseplants in my office. I want an app that I can use to catalogue them, learn about them, and, importantly, use as an assistant to take care of them. The app needs to be consistent, detailed, and crucially it needs to be accurate. It should be able to assess and diagnose a plant, tell me what the exact next step I should take to take care of it is, and know to ask me questions or ask for more pictures if there isn't enough information."

Decomposed: three jobs — **catalogue**, **learn**, **care assistant** — held to three quality bars — **consistent, detailed, accurate**. The third job carries three specific capabilities: (a) assess & diagnose, (b) prescribe the exact next step, (c) recognize insufficient information and ask for more (questions or photos).

### Assessment summary

| Job | Grade | One-line verdict |
|---|---|---|
| Catalogue | **A−** | Two-layer profiles, photos, timelapse, lineage, structured logs — mature. Gap: species identity is never *verified*. |
| Learn | **B** | Deep, consistent species profiles — but unverified AI content with no provenance or correction loop. |
| Care assistant | **C−** | Fixed-interval reminders + single-turn AI garnish. None of the three assistant capabilities exists as designed. |

The product today is an excellent **plant journal with AI features**. The vision describes an **AI caretaker**. The gap is not "more features" — it is one missing interaction model (the AI is never allowed to ask back) and one missing pipeline (AI insight never becomes app action).

### Findings in detail (each verified against code)

**F1 — The reminder engine ignores everything the app knows.**
Watering/fertilizing status is `days_since_last > interval` (`lib/utils.ts → computeWateringStatus`). The app *captures* pot size, soil type, location, light, season, measurements, pest history — and none of it influences scheduling. The assistant's "brain" is a countdown timer.

**F2 — `analyze-plant` is well-fed but single-turn and prose-out.**
The context assembly is genuinely strong (species profile incl. disease signatures, care logs with categories/measurements, prior analyses with `health_score` trend, plant context, season — see `supabase/functions/analyze-plant/index.ts`). But the contract is one shot: `{ species, health, health_score, care }` where `care` is 2–3 sentences of prose. There is **no code path anywhere in the product for the AI to request more information** — verified by search across all four Edge Functions and the client. The model must always answer, which produces confident guessing — the exact failure mode an accuracy-first product cannot afford. Runs on `claude-haiku-4-5-20251001` (cheapest tier) with `max_tokens: 1024`.

**F3 — "Diagnose" never looks at the plant.**
`app/(app)/plant/[id]/diagnose/page.tsx` is a static 11-verdict decision tree (`const FLOW`), ≤3 question levels, with **hardcoded confidence labels**. As triage UX it's decent; as "diagnosis" it's a brand promise the feature doesn't keep. It cannot see photos, cannot use the plant's history, and its verdicts are the same for every plant in every condition matching the same answers.

**F4 — The insight→action loop does not exist.**
When an analysis says "reduce watering for winter," nothing happens: no task, no interval change, no follow-up. Recommendations live and die as prose inside `analysis_results.care`. Today's task list (`app/(app)/page.tsx`) is computed exclusively from intervals. The assistant's advice and the assistant's to-do list are two systems that never talk.

**F5 — The assistant cannot initiate contact.**
`lib/notifications.ts` is an explicit no-op stub ("push notifications are not supported in the web version"). Modern PWA web push works on iOS 16.4+/Android/desktop. Without it, follow-through ("has the yellowing spread? show me") is impossible — the user must remember to ask.

**F6 — Species identity is never verified.**
`lib/types.ts` declares `is_name_verified?: boolean`; no code reads or writes it (column confirmed live in production, 2026-06-10: boolean, default false). AI misidentification at add-time silently becomes the plant's permanent identity, and every downstream feature (care guidance, diagnosis context, toxicity) keys off it.

**F7 — Species knowledge has no provenance and no correction path.**
`species_profiles` rows are single-shot Haiku generations, cached globally and served as authority. Consistency: excellent (everyone sees the same thing). Accuracy: unaudited — and the cache makes any error *permanently consistent*. The toxicity field is the sharpest edge (pet-safety information). "Refresh" regenerates; it does not correct.

**F8 — Consistency risks at the platform level.**
Two AI providers are half-wired (`AI_PROVIDER` switch exists only in `analyze-plant` + `fetch-species-info`; the other two are Claude-only). One product voice/quality bar argues for one provider. Model tier (Haiku everywhere) sets the accuracy ceiling on the highest-stakes path (diagnosis) to the cheapest option.

**F9 — No trust surface.**
The user can't tell the app "this was wrong" (or right) anywhere: not on analyses, not on species facts, not on identifications. An accuracy-first product needs a feedback signal to know whether it's meeting its own bar.

---

## Part II — Product Definition

### Problem statement

Kyle has many office plants and uses Viriditas to track them, but the app cannot yet *take care of them with him*: its reminders ignore context, its AI gives one-shot prose advice that never becomes action, its "diagnosis" never examines the plant, and the AI is structurally forbidden from saying "I need more information." The cost: care decisions stay manual, advice gets lost, and the app's authority outruns its accuracy.

### Goals

1. **Every AI insight is actionable or explicitly informational** — analyses and diagnoses emit structured next steps the user can accept, complete, or dismiss; ≥60% of analyses produce at least one accepted action within the first month of use.
2. **The app can honestly say "I don't know yet"** — diagnosis becomes a bounded multi-turn session in which the AI may request specific photos or answers before committing to a verdict; ≥30% of sessions include at least one ask-back (if it never asks, it's still guessing).
3. **The exact next step is always one glance away** — Today surfaces accepted actions and follow-ups alongside interval tasks, with due dates and rationale.
4. **Schedules learn** — accepted recommendations and seasonality can adjust intervals (always with confirmation, never silently).
5. **Accuracy becomes measurable** — identity verification, content flagging, and accept/dismiss telemetry give the app a real signal for whether its advice is right.

### Non-goals (v2 scope fence)

- **No multi-user / social features** (sharing, comments, public profiles). Solo-use app; lineage's `recipient_name` stays free text.
- **No native apps.** PWA remains the delivery vehicle; push must work within PWA constraints.
- **No hardware/sensor integrations** (moisture probes, auto-waterers). Different product.
- **No open-ended plant chatbot.** Conversation exists *only* inside bounded diagnosis sessions with hard turn limits. (Scope control + cost control + keeps the editorial product voice.)
- **No silent automation.** The assistant proposes; Kyle disposes. No schedule or data changes without explicit confirmation.
- **No Gemini parity work.** Open question below proposes retiring it; under no circumstance extend it to new functions.

### User stories (single persona: the plant keeper)

P0:
- As a plant keeper, when an AI analysis finds something wrong, I want concrete next steps with urgency and a due date — not paragraphs — so I know exactly what to do and when.
- As a plant keeper, I want to accept a recommendation and see it appear in my Today list, so advice becomes a plan without me transcribing it.
- As a plant keeper, when I start a diagnosis, I want the app to examine *my* plant (photos + history), ask me for a closer shot or a detail it's missing, and only then give a verdict with honest confidence — so I can trust what it tells me.
- As a plant keeper, I want a concluded diagnosis to schedule its own follow-up check ("recheck in 4 days"), so treatment doesn't depend on my memory.
- As a plant keeper, I want to confirm or correct the AI's species identification once, and have the app remember it's verified, so everything built on identity is built on rock.

P1:
- As a plant keeper, I want the app to suggest seasonal schedule adjustments (with one-tap apply), so winter dormancy doesn't depend on me remembering plant biology.
- As a plant keeper, I want a push notification when care is overdue or a diagnosis follow-up is due, so the assistant reaches me instead of waiting to be opened.
- As a plant keeper, I want to flag a species fact that looks wrong, so the shared knowledge layer can be corrected rather than regenerated blind.

### Success metrics

Leading (check ~2 weeks after each phase ships; all measurable with simple SQL on existing/new tables):
- Action acceptance rate: `accepted / proposed` on `care_recommendations` (target >60%; <30% means recommendations are noise — revisit prompt).
- Ask-back rate: sessions with ≥1 `photo_request` or `question` turn (target 30–60%; ~0% = still guessing, ~100% = annoying).
- Verdict rate: sessions reaching a verdict within the turn cap (target >90%).
- Dismissed-as-wrong rate on recommendations (target <20%).

Lagging (first review ~6 weeks post Phase 2):
- Overdue-task rate on Today (should trend down).
- Mean `health_score` across active plants (should trend up or hold ≥4).
- Care streak / weekly active care days (existing `computeStreak` data; should hold or rise).

---

## Part III — Implementation Spec (phased)

> House rules for all phases: TypeScript, no `any`; Editorial palette tokens + `<Icon/>` (never emoji in UI); follow `CLAUDE.md` conventions for Supabase clients, date handling, and post-mutation `router.refresh()`. New tables follow the existing RLS pattern. New/changed Edge Functions: deploy with `--no-verify-jwt` **and** validate auth in-function via `getUser()` (the v1.5.0 pattern); update `docs/EDGE-FUNCTIONS.md` and `docs/DATABASE.md` in the same phase. Keep `analyze-plant`'s SSRF guard intact for any new storage fetches.

### Phase 1 — Structured actions & the insight→task loop  `P0 · target v1.6.0`

The smallest change that turns "AI garnish" into "assistant": analyses emit structured actions; actions become reviewable tasks; accepted interval suggestions update schedules.

**1.1 New table `care_recommendations`** (full SQL in Appendix A):
`id, plant_id, user_id, source ('analysis'|'diagnosis'|'seasonal'), source_id (uuid, nullable — the analysis/diagnosis row), action (text, imperative ≤80 chars), rationale (text), urgency ('now'|'soon'|'routine'), due_date (date, nullable), interval_suggestion (jsonb, nullable — see contract), status ('proposed'|'accepted'|'done'|'dismissed'|'expired'), dismissed_reason (text, nullable: 'wrong'|'already_done'|'later'), created_at, resolved_at`.
Index on `(user_id, status)` and `(plant_id, created_at desc)`. RLS: users manage own rows.

**1.2 `analyze-plant` v2 response contract** — additive, backward compatible. Keep `species`, `health`, `health_score`, `care` exactly as today (the log-book card still renders prose). Add:

```json
"actions": [
  { "action": "Move out of direct afternoon sun",
    "rationale": "Bleached patches on the newest two leaves are consistent with scorch, and the west window gets direct exposure.",
    "urgency": "soon",
    "due_in_days": 2 }
],
"interval_suggestion": { "type": "watering", "current_days": 7, "suggested_days": 10,
                         "reason": "Winter dormancy + 0 measured growth since October." } | null
```

Prompt changes in `analyze-plant/index.ts`: require 0–3 actions ("emit zero when the plant is healthy — do not invent work"); each action imperative and plant-specific, never generic species advice; `interval_suggestion` only when evidence supports it; JSON-only output (the function already parses JSON — extend the schema block at ~line 150). Validate server-side: clamp actions to 3, whitelist urgency values, drop malformed entries (the `fetch-species-info` field-by-field pattern).

**1.3 Persistence** — follow the existing ownership pattern (the **client** inserts `analysis_results` at `plant/[id]/page.tsx:~498`): after a successful analysis the client inserts one `care_recommendations` row per action (status `proposed`, `source='analysis'`, `source_id=` the new analysis id, `due_date` = today + `due_in_days`). The interval suggestion is stored on a recommendation row with `interval_suggestion` set and `action` like "Change watering to every 10 days".

**1.4 Today integration** (`app/(app)/page.tsx` + `TodayClient.tsx`): new section **"§ Assistant — proposed"** between the task list and the collection strip, rendered only when proposals exist. Each card: plant name, action, urgency chip (reuse `Chip` tones: now→danger, soon→warn, routine→neutral), rationale as collapsible serif footnote, and three controls — **Accept**, **Done** (did it just now → also writes a matching `care_logs` entry when the action maps to a log type), **Dismiss** (sheet with the three reasons). Accepted items join the main task list sorted by `due_date`/urgency above interval tasks of equal urgency. Accepting an `interval_suggestion` shows a confirm sheet ("Watering: every 7d → every 10d") and on confirm updates `plants.watering_interval_days`/`fertilizing_interval_days` — never silently.

**1.5 Plant Detail**: the AI-diagnosis card renders the same action rows inline (read-only status after resolution). Server fetch additions follow the existing 3-query enrichment pattern (`.in('plant_id', ids)`).

**1.6 Expiry**: on Today load, client marks `proposed` rows older than 14 days as `expired` (cheap, no cron needed yet).

**Acceptance criteria (Phase 1)**
- [ ] Analysis of a struggling plant yields 1–3 proposed actions visible on Today and Plant Detail; analysis of a healthy plant yields zero (verify both with real photos).
- [ ] Accept → task appears in Today's list with due date; Done → recommendation resolved (+ care log written when applicable); Dismiss → captures reason; all three update without page reload (`router.refresh()` pattern).
- [ ] Accepting an interval suggestion updates the plant's interval **only after** the confirm sheet, and the schedule section reflects it immediately.
- [ ] Old clients / existing `analysis_results` rows render unchanged (additive contract verified).
- [ ] `analyze-plant` redeployed; `docs/EDGE-FUNCTIONS.md` + `docs/DATABASE.md` + `CHANGELOG.md` updated; migration flagged for production.

### Phase 2 — Interactive diagnosis sessions  `P0 · target v1.7.0 · the flagship`

Replaces the *brand promise* of the static tree with a real, bounded, multimodal diagnostic loop. The static tree survives as fast triage.

**2.1 New table `diagnosis_sessions`** (full SQL in Appendix A):
`id, plant_id, user_id, status ('active'|'concluded'|'abandoned'), turns (jsonb array — the transcript), ask_count (int default 0), verdict (jsonb, nullable), diagnosis_id (uuid, nullable → diagnoses.id once concluded), created_at, concluded_at`.
Transcript turn shape: `{ role: 'user'|'assistant', type: 'opening'|'photo'|'answer'|'question'|'photo_request'|'verdict', text?: string, photo_path?: string, options?: string[], at: ISO timestamp }`.

**2.2 New Edge Function `diagnose-plant`** — Claude-only (no `AI_PROVIDER` branch), model **`claude-sonnet-4-6`** (verify the current recommended Sonnet model string at implementation time; rationale: highest-stakes path, low volume — see cost note in Part IV). Auth via `getUser()`; same CORS + error-shape conventions as the other functions.

Request: `{ sessionId?: uuid, plantId: uuid, userText?: string, photoPath?: string }` — first call omits `sessionId` and opens with the user's complaint (or "general checkup") + optionally a fresh photo. Photos are uploaded by the client to the `plant-photos` bucket under `{userId}/{plantId}/diagnosis/{sessionId}/{ts}.{ext}` **without** inserting into `photos`(keeps Timelapse/photo strip clean — they read the `photos` table); the function fetches them with the same bucket-path allowlist guard as `analyze-plant`.

Context assembly: extract the context builder out of `analyze-plant/index.ts` into **`supabase/functions/_shared/plant-context.ts`** (Supabase deploys `_shared/` automatically with each function) and feed `diagnose-plant` the identical context (species profile incl. `disease_symptoms`, care logs, prior analyses + scores, plant context, season) **plus** the session transcript and prior `diagnoses` rows for this plant.

Response — a discriminated union; the model must return exactly one:

```json
{ "type": "question",      "text": "...", "options": ["...", "..."] | null, "why": "..." }
{ "type": "photo_request", "text": "Close-up of the underside of an affected leaf", "why": "Checking for spider-mite stippling/webbing, which top-down shots hide." }
{ "type": "verdict",       "title": "...", "confidence": "High"|"Medium"|"Low",
  "reasoning": ["...", "..."],
  "next_steps": [ { "label": "...", "immediate": true|false } ],
  "differential": "If X doesn't improve, the alternative is Y" | null,
  "follow_up": { "days": 4, "check": "Has the yellowing spread past the two lower leaves?" } | null }
```

Hard rules (enforced in the prompt *and* the function): **max 3 ask-turns** (`ask_count` is server-tracked; at the cap the function instructs the model that it must produce a verdict); when information remains insufficient, the verdict must say so honestly — Low confidence, a differential, and a *safe* next step, never a bluff. The function appends turns and updates the session row server-side (service-role write, scoped by the authenticated user id — keeps transcript integrity out of client hands).

**2.3 Conclusion writes history.** On `verdict`, the function inserts into the existing **`diagnoses`** table so the current history UI keeps working unchanged: `question_path` := compact transcript summary jsonb, `verdict_id` := `'ai-session'`, `verdict_title`/`confidence`/`reasoning` mapped 1:1, `next_steps` := the existing `{label, immediate}` checklist shape. It also returns the verdict to the client, which inserts `care_recommendations` rows (`source='diagnosis'`) for each next step, plus one for `follow_up` with `due_date = today + days` — feeding Phase 1's loop. (Recommendation inserts stay client-side for pattern consistency.)

**2.4 UI** (`app/(app)/plant/[id]/diagnose/page.tsx` rework): the static tree remains as **"Quick triage — common issues"**; primary CTA becomes **"Examine with AI"**. The session screen is *not* a generic chat: field-notes styling — assistant turns as serif editorial blocks with a mono `§ EXAMINATION` header, user turns as quiet right-aligned cards, photo requests rendering a framed dropzone (reuse the camera/file-input conventions: `<input type="file" accept="image/*" capture="environment">`) with the "why" as a caption. Question turns with `options` render as `Chip` rows; free-text fallback always available. Verdict renders in the existing verdict-card style (it already shows confidence + checklist) + the follow-up line. Abandoning mid-session (nav away) leaves status `active`; reopening Diagnose offers "Resume examination" if an active session <24h exists, else marks it `abandoned` and starts fresh.

**Acceptance criteria (Phase 2)**
- [ ] A session with an ambiguous opening photo produces at least one `photo_request` or `question` before any verdict (test with a deliberately unclear photo).
- [ ] A session with a clear case (e.g., obvious overwatering + history) verdicts on turn 1 without padding questions.
- [ ] The function never exceeds 3 ask-turns; turn 4 is always a verdict (force by answering vaguely thrice).
- [ ] Low-confidence verdicts include a differential and safe next step — no fabricated certainty (review wording on at least 2 real sessions).
- [ ] Concluded session appears in the existing Diagnose history list (via `diagnoses`) and its next steps appear as proposals on Today.
- [ ] Session photos do **not** appear in Timelapse or the Plant Detail photo strip.
- [ ] `auth` enforced (401 on missing/invalid token — test like the v1.5.0 verification); SSRF guard verified for session photo paths.
- [ ] Manual steps flagged: migration, `supabase functions deploy diagnose-plant --no-verify-jwt`, redeploy of `analyze-plant` if `_shared` extraction touched it.

### Phase 3 — Adaptive schedules  `P1 · target v1.8.0`

Smallest credible version — no new AI surface, just making existing knowledge move the schedule:

- **Seasonal review**: on Today load, if the month differs from `viriditas.lastSeasonalCheck` (localStorage), generate *local* (non-AI) proposals from cached `species_profiles.seasonal_care` + current season for each scheduled plant, as `care_recommendations` rows with `source='seasonal'` and an `interval_suggestion` (e.g., winter → suggest +30–50% watering interval for tropicals). Dedupe: skip if an unresolved seasonal row exists for that plant+type.
- Phase 1's confirm-sheet flow applies unchanged — nothing moves without a tap.
- Keep heuristics in `lib/seasonal.ts` with the rules table commented for tuning; parsing `seasonal_care` prose is best-effort — when it can't parse, emit nothing (silence over noise).

**Acceptance:** month rollover produces ≤1 proposal per plant per care type; accept updates the interval via the existing confirm sheet; dismiss suppresses that plant+type until next season.

### Phase 4 — Web push (the assistant reaches out)  `P1 · target v1.9.0`

- Service worker + `Notification`/`PushManager` opt-in from Settings ("Care reminders") — explain iOS requires the installed (A2HS) app. Store subscriptions in new table `push_subscriptions` (Appendix A).
- Sender: scheduled Supabase Edge Function (`send-care-push`, daily ~9am local — document the cron mechanism the current CLI supports; Vercel Cron hitting the function is the fallback) that finds, per user: overdue care tasks + `care_recommendations` due today (incl. diagnosis follow-ups), and sends **one digest push** ("2 plants need you: water Mabel, recheck Big Fern's leaves") via `web-push` with VAPID keys in Supabase secrets.
- Hard rules: max 1 push/day; nothing when there's nothing due; deep-link to Today.

**Acceptance:** opt-in→subscription row; overdue plant produces next-morning digest on desktop + installed iOS PWA; revoking permission cleans up the row; no push on quiet days. Manual steps flagged: VAPID secret generation, cron setup, function deploy.

### Phase 5 — Accuracy program  `P1, with one P0 slice · target v1.10.0`

- **(P0 slice) Species identity verification.** The `is_name_verified` column is confirmed live in production (verified 2026-06-10) — no migration needed, code only. Plant Detail dossier: species row gains a quiet `Confirm` chip when unverified → sets `is_name_verified=true`; manual species edits set it too; verified rows show a small mono "VERIFIED" tag. Add Plant step 1: AI identification shows "AI-identified — tap to confirm or correct" beneath the result. `analyze-plant` context gains one line: identity verified vs AI-assumed (lets the model hedge species-specific claims when unverified).
- **Species fact flagging.** `species_profile_flags` table (Appendix A) + a "Report an issue" affordance on each species-guide section (field, optional note). Flags are for Kyle's review (a simple list under Settings → flagged facts); no auto-correction.
- **Toxicity caution line.** Wherever toxicity renders, a one-line mono caption: "AI-generated — verify with your vet for pet-critical decisions." (Honest authority beats implied authority.)
- **Provider consolidation.** Pending the open question below: remove the Gemini branches and the `AI_PROVIDER` switch, or document it as frozen/unsupported. Either way, stop the half-state.

**Acceptance:** confirm flow round-trips to DB and survives reload; unverified→verified reflected in the next analysis's prompt context; flags persist and list correctly; toxicity caption on Explore + species guide + Plant Detail.

---

## Part IV — Sequencing, Cost, Open Questions

### Sequencing & session slicing

Dependencies: Phase 2 writes into Phase 1's table (1 → 2 strictly ordered). Phase 3 reuses Phase 1's confirm flow. Phase 4 reads Phase 1/2 outputs but is otherwise independent. Phase 5's P0 slice can ride along with any session.

Recommended Claude Code sessions: **Session A = Phase 1 + Phase 5 identity slice** (one migration batch, one function redeploy). **Session B = Phase 2** (largest; schema + new function + `_shared` extraction + UI rework). **Session C = Phases 3 + rest of 5.** **Session D = Phase 4** (its own platform quirks). One MINOR version bump per session, CHANGELOG + docs updated each time, manual steps flagged at the end — the established pattern.

### Cost & model note

Diagnosis sessions on Sonnet: roughly 3–6k input tokens/turn (context + image) + ~500 output → on the order of **$0.05–0.15 per full session** at current Sonnet pricing — negligible at solo-use volume, and the accuracy delta on the highest-stakes path is exactly what the vision pays for. Keep Haiku for `identify-species`/`suggest-species`/`fetch-species-info` (volume paths, lower stakes). Revisit only if usage patterns change.

### Open questions

| # | Question | Owner | Blocking? |
|---|---|---|---|
| 1 | Retire Gemini entirely (delete branches + secret) vs freeze-and-document? Recommendation: retire — one voice, one quality bar, less code. | Kyle | Blocks only Phase 5's last item |
| 2 | Exact Sonnet model string at implementation time (this spec assumes `claude-sonnet-4-6`). | Implementing session (check docs) | Blocks Phase 2 deploy |
| 3 | ~~Is the `is_name_verified` column live in production?~~ **Resolved 2026-06-10: yes** — boolean, default false, confirmed via production SQL. Phase 5 slice is code-only. | — | No |
| 4 | Supabase scheduled functions availability on current plan/CLI vs Vercel Cron for the push sender. | Implementing session (verify, then choose) | Blocks Phase 4 only |
| 5 | Should "Done" on a recommendation that maps to no care-log type (e.g., "move the plant") write a `moved` log automatically? Recommendation: yes when unambiguous, else skip. | Kyle (taste call) | No — default to recommendation |

---

## Appendix A — Migration SQL

```sql
-- Phase 1
create table if not exists care_recommendations (
  id uuid primary key default gen_random_uuid(),
  plant_id uuid not null references plants(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  source text not null check (source in ('analysis','diagnosis','seasonal')),
  source_id uuid,
  action text not null,
  rationale text,
  urgency text not null check (urgency in ('now','soon','routine')) default 'routine',
  due_date date,
  interval_suggestion jsonb,
  status text not null check (status in ('proposed','accepted','done','dismissed','expired')) default 'proposed',
  dismissed_reason text check (dismissed_reason in ('wrong','already_done','later')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists idx_care_recs_user_status on care_recommendations(user_id, status);
create index if not exists idx_care_recs_plant on care_recommendations(plant_id, created_at desc);
alter table care_recommendations enable row level security;
create policy "Users manage own care_recommendations" on care_recommendations
  for all using (auth.uid() = user_id);

-- Phase 2
create table if not exists diagnosis_sessions (
  id uuid primary key default gen_random_uuid(),
  plant_id uuid not null references plants(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  status text not null check (status in ('active','concluded','abandoned')) default 'active',
  turns jsonb not null default '[]'::jsonb,
  ask_count int not null default 0,
  verdict jsonb,
  diagnosis_id uuid references diagnoses(id),
  created_at timestamptz not null default now(),
  concluded_at timestamptz
);
create index if not exists idx_diag_sessions_plant on diagnosis_sessions(plant_id, created_at desc);
alter table diagnosis_sessions enable row level security;
create policy "Users manage own diagnosis_sessions" on diagnosis_sessions
  for all using (auth.uid() = user_id);

-- Phase 4
create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  endpoint text not null unique,
  keys jsonb not null,
  created_at timestamptz not null default now()
);
alter table push_subscriptions enable row level security;
create policy "Users manage own push_subscriptions" on push_subscriptions
  for all using (auth.uid() = user_id);

-- Phase 5
create table if not exists species_profile_flags (
  id uuid primary key default gen_random_uuid(),
  species_profile_id uuid not null references species_profiles(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  field text not null,
  note text,
  created_at timestamptz not null default now()
);
alter table species_profile_flags enable row level security;
create policy "Users manage own species_profile_flags" on species_profile_flags
  for all using (auth.uid() = user_id);

-- Phase 5: NOT NEEDED — column confirmed live in production 2026-06-10 (kept for fresh-project setup)
alter table plants add column if not exists is_name_verified boolean default false;
```

## Appendix B — Contract quick-reference

`analyze-plant` v2 adds to the existing result object: `actions: Array<{action, rationale, urgency: 'now'|'soon'|'routine', due_in_days: number|null}>` (0–3 entries) and `interval_suggestion: {type: 'watering'|'fertilizing', current_days, suggested_days, reason} | null`.

`diagnose-plant` request: `{sessionId?, plantId, userText?, photoPath?}` → response is exactly one of `question | photo_request | verdict` (shapes in §2.2). Server enforces: ≤3 ask-turns, verdict required at cap, transcript/`ask_count` updated server-side, session photos only from `{userId}/{plantId}/diagnosis/` paths.

_End of spec._
