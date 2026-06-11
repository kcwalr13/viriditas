# Viriditas — Edge Function API Reference

**Purpose:** request/response contract, auth model, error behavior, and deploy commands for
the six Supabase Edge Functions — five that power the AI features plus `send-care-push`
(the cron-invoked web-push digest sender, v1.9.0). Source of truth is the code in
`supabase/functions/*/index.ts`; this file mirrors it as of v1.9.0.

> **Shared modules (v1.7.0):** `supabase/functions/_shared/` holds the plant-context
> prompt builders (`plant-context.ts`) and image fetching with magic-byte type detection
> (`images.ts`), used by both `analyze-plant` and `diagnose-plant`. Supabase bundles
> `_shared/` into each function at deploy time — **changing a shared file requires
> redeploying every function that imports it.**

## Common behavior (the five AI functions)

> `send-care-push` is the exception to the auth and CORS rules below — it is never called
> from the browser. See its own section at the bottom.

- **Auth (required):** functions are deployed with `--no-verify-jwt`, so each validates the
  caller itself. The browser must send `Authorization: Bearer <supabase access token>`; the
  function calls `supabase.auth.getUser()` with that header and returns **401
  `{ "error": "Unauthorized" }`** if it's missing or invalid. (Hardened in v1.5.0.)
- **CORS:** `Access-Control-Allow-Origin: *` with an OPTIONS preflight handler.
- **Errors:** validation failures return **400** with `{ "error": "<message>" }`; anything
  thrown (AI provider errors, JSON parse failures, missing secrets) returns **500** with
  `{ "error": "<message>" }`.
- **Calling from the browser** (the `supabase.functions.invoke` helper doesn't reliably
  inject the token, so pass it explicitly):

```ts
const { data: { session } } = await supabase.auth.getSession()
const { data, error } = await supabase.functions.invoke('analyze-plant', {
  body: payload,
  headers: { Authorization: `Bearer ${session.access_token}` },
})
```

### Secrets

Set via `supabase secrets set KEY=value` (functions must be redeployed to pick up changes):

| Secret | Used by | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | the five AI functions | required |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | `send-care-push` | web-push VAPID identity; generate with `npx web-push generate-vapid-keys`, subject is a `mailto:` address. The public key is also exposed to the client as `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (env, not a Supabase secret) |
| `CRON_SECRET` | `send-care-push` | shared secret pg_cron sends in the `x-cron-secret` header; generate with `openssl rand -hex 32` |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | (auto) | injected by Supabase; not set manually |

> **Gemini retired (v1.8.0, spec decision #1):** the `AI_PROVIDER` switch, the Gemini
> branches in `analyze-plant`/`fetch-species-info`, and the `GEMINI_API_KEY` secret are
> gone — Claude is the sole provider (one product voice, one quality bar). The
> `AI_PROVIDER` and `GEMINI_API_KEY` secrets can be unset in Supabase
> (`supabase secrets unset AI_PROVIDER GEMINI_API_KEY`); git history preserves the old code.

### Models

| Function | Model |
|---|---|
| `analyze-plant` | `claude-sonnet-4-6` (v1.10.1; was Haiku) |
| `fetch-species-info` | `claude-sonnet-4-6` (v1.10.1; was Haiku) |
| `identify-species` | `claude-sonnet-4-6` (v1.10.1; was Haiku) |
| `suggest-species` | `claude-sonnet-4-6` (v1.10.1; was Haiku) |
| `diagnose-plant` | `claude-sonnet-4-6` (highest-stakes path — see spec cost note) |
| `send-care-push` | — (no AI; sends web push) |

### Deploy

```bash
supabase functions deploy analyze-plant --no-verify-jwt
supabase functions deploy fetch-species-info --no-verify-jwt
supabase functions deploy identify-species --no-verify-jwt
supabase functions deploy suggest-species --no-verify-jwt
supabase functions deploy diagnose-plant --no-verify-jwt
supabase functions deploy send-care-push --no-verify-jwt
```

---

## `analyze-plant`

AI health analysis of a stored plant photo, with full plant/care/species/season context.
Called from Plant Detail (`handleAnalyze`).

**Request**

```jsonc
{
  "imageUrl": "https://<project>.supabase.co/storage/v1/object/public/plant-photos/...", // required
  "previousAnalyses": [   // optional, most recent first
    { "date": "...", "species": "...", "health": "...", "health_score": 4, "care": "..." }
  ],
  "recentCareLogs": [     // optional
    { "type": "watered", "notes": null, "date": "...", "category": null,
      "measurement_value": null, "measurement_unit": null }
  ],
  "speciesProfile": { /* species_profiles row fields; optional */ },
  "plantContext": {       // optional
    "location": "...", "pot_size": "...", "soil_type": "...",
    "plant_notes": "...", "pest_notes": "...", "last_treatment_date": "YYYY-MM-DD",
    "watering_interval_days": 7, "fertilizing_interval_days": null   // v1.6.0 — baseline for interval_suggestion
  },
  "seasonContext": { "month": 6, "hemisphere": "northern" }, // optional
  "identityContext": { "verified": false }  // optional, v1.6.0 — owner-confirmed species name or AI-assumed
}
```

**Response 200** *(v2 as of v1.6.0 — additive, backward compatible)*

```jsonc
{
  "result": {
    "species": "...", "health": "...", "health_score": 4, "care": "...",
    "actions": [            // 0–3 structured next steps; [] for a healthy plant
      { "action": "Move out of direct afternoon sun",   // imperative, plant-specific
        "rationale": "...",
        "urgency": "soon",                              // "now" | "soon" | "routine"
        "due_in_days": 2 }                              // integer or null
    ],
    "interval_suggestion": {  // or null — proposed schedule change, never auto-applied
      "type": "watering", "current_days": 7, "suggested_days": 10, "reason": "..."
    }
  }
}
```

`health_score` is clamped server-side to an integer 1–5. The v2 fields are sanitized
server-side before returning: at most 3 actions, malformed entries dropped, urgency
coerced into the whitelist, `due_in_days` clamped to 0–60, `suggested_days` to 1–365.
When `identityContext.verified` is false the prompt instructs the model to hedge
species-specific claims and flag photo/species mismatches.

**Errors:** 401 unauthorized · 400 `imageUrl is required` · 400 `imageUrl must point to the
plant-photos storage bucket` · 500 provider/parse errors.

**Notes**
- **SSRF guard:** `imageUrl` must be `https`, on this project's own Supabase hostname, with a
  path under `/storage/v1/object/public/plant-photos/`. Anything else is rejected.
- The image is fetched server-side and its media type detected from **magic bytes** (WebP,
  PNG, GIF, JPEG) — the storage `Content-Type` header is not trusted.
- The function does **not** write to the database; the client saves the returned result to
  `analysis_results`, then inserts one `care_recommendations` row per action (plus one for
  the interval suggestion) with `source='analysis'` and `source_id` = the new analysis id.
- When adding a context field, update three places: the call-site payload in
  `app/(app)/plant/[id]/page.tsx`, the type in `analyze-plant/index.ts`, and the
  prompt-builder section that consumes it.

---

## `fetch-species-info`

Returns the encyclopedic profile for a species — from the shared `species_profiles` cache
when possible, otherwise generated by the AI and cached. Called from Plant Detail (species
guide) and Explore.

**Request**

```jsonc
{ "speciesName": "Monstera deliciosa", "forceRefresh": false }
```

**Response 200**

```json
{ "profile": { /* full species_profiles row */ }, "cached": true }
```

`cached: true` means it came straight from the table; `false` means it was just generated
(and upserted with `onConflict: 'species_name'` to survive races).

**Errors:** 401 unauthorized · 400 `speciesName is required` · 500 provider/save errors.

**Notes**
- Writes with the **service role** (the cache is shared across users), which is exactly why
  anonymous calls must be rejected — cache poisoning plus free AI usage.
- AI output is mapped **field-by-field** onto the schema (`sanitizeProfileFields`) rather
  than spread into the upsert, so unexpected keys can never reach the database.
- The prompt requests `\n• ` bullet formatting; profiles cached before that prompt change
  stay bullet-less until refreshed with `forceRefresh: true`.

---

## `identify-species`

Lightweight species identification from a photo sent as base64 — no Storage involved, no
database writes. Called from Explore photo search, Add Plant step 1, and the Camera
screen's Identify mode (v1.10.0).

**Request**

```jsonc
{ "imageBase64": "<raw base64, no data: prefix>", "mimeType": "image/jpeg" }
```

`mimeType` must be one of `image/jpeg`, `image/png`, `image/webp`, `image/gif`.

**Response 200**

```json
{ "speciesName": "Philodendron hederaceum (Heartleaf Philodendron)", "confidence": "high" }
```

`speciesName` is `null` when the image doesn't show a recognizable plant; `confidence` is
`high` | `medium` | `low`. Genus-only IDs come back as e.g. `"Philodendron sp."`.

**Errors:** 401 unauthorized · 400 `imageBase64 and mimeType are required` · 400 mimeType not
in the allowlist · 500 provider/parse errors.

---

## `suggest-species`

Freeform plant-name search → 4–6 candidate species. Handles misspellings, phonetic
approximations, common names. Called from Explore text search (and its category cards).

**Request**

```jsonc
{ "query": "filadendren" }
```

**Response 200**

```json
{
  "suggestions": [
    { "scientificName": "Philodendron hederaceum",
      "commonName": "Heartleaf Philodendron",
      "description": "..." }
  ]
}
```

An empty/whitespace query returns `{ "suggestions": [] }` without calling the AI.

**Errors:** 401 unauthorized · 500 provider/parse errors.

**Notes**
- Thumbnails are *not* fetched here — the browser enriches results client-side from the free
  Wikipedia REST API (`https://en.wikipedia.org/api/rest_v1/page/summary/{scientificName}`).

---

## `diagnose-plant` *(v1.7.0)*

Interactive diagnosis sessions (Phase 2 of `docs/ASSISTANT-SPEC.md`) — a bounded,
multimodal diagnostic loop. Claude-only on **`claude-sonnet-4-6`** (the highest-stakes
path at low volume). Called from the Diagnose screen's "Examine with AI" flow.

**Request**

```jsonc
{
  "sessionId": "uuid",      // omit on the first call — the function opens the session
  "plantId": "uuid",        // required; must belong to the caller
  "userText": "string",     // the complaint / answer; optional on the first call
  "photoPath": "string"     // storage path of a just-uploaded session photo; optional
}
```

The first call omits `sessionId` and opens with the owner's complaint (blank = general
checkup) and optionally a fresh photo. Continuing a session requires `userText` or
`photoPath`. Session photos are uploaded by the **client** to the `plant-photos` bucket
under `{userId}/{plantId}/diagnosis/{sessionFolder}/{ts}.{ext}` **without** a `photos`
table row; the function rejects any `photoPath` outside the caller's own
`{userId}/{plantId}/diagnosis/` prefix (no traversal, no URLs).

**Response 200**

```jsonc
{
  "sessionId": "uuid",      // echo (or the freshly-opened session's id)
  "askCount": 1,            // server-tracked ask-turns used so far (max 3)
  "reply": { /* exactly ONE of the three shapes below */ },
  "diagnosisId": "uuid"     // present only when reply.type === "verdict"
}
```

`reply` shapes:

```jsonc
{ "type": "question",      "text": "...", "options": ["...", "..."] | null, "why": "..." }
{ "type": "photo_request", "text": "Close-up of the underside of an affected leaf", "why": "..." }
{ "type": "verdict",       "title": "...", "confidence": "High" | "Medium" | "Low",
  "reasoning": ["..."],
  "next_steps": [ { "label": "...", "immediate": true } ],
  "differential": "If X doesn't improve, the alternative is Y" | null,
  "follow_up": { "days": 4, "check": "..." } | null }
```

**Errors:** 401 unauthorized · 400 `plantId is required` / `sessionId must be a uuid` /
bad `photoPath` / concluded session / continuation without input · 404 plant or session
not found · 500 model/parse errors (an unusable reply after one retry, a failed
session-turn save) · 500 `Could not open a diagnosis session — has the
diagnosis_sessions migration been run?` (**the expected failure until the v1.7.0
migration is applied in production**).

**Notes**
- **Context is assembled server-side** (the request carries none): plant row, species
  profile (incl. `disease_symptoms`), last 10 care logs, last 3 analyses, last 3 prior
  diagnoses, season, and identity-verified status — via the shared
  `_shared/plant-context.ts` builders, identical to `analyze-plant`'s context.
- **All session writes use the service role**, scoped to the authenticated user —
  transcript and `ask_count` integrity never depend on the client. Turns are only
  persisted alongside a successful reply, so a failed call can be retried safely.
  One caveat: the **opening** call inserts the session row before the model call, so a
  failed first call can leave behind an empty `active` session — the client treats
  zero-turn sessions as not resumable and abandons them on the next Diagnose visit.
- **The 3-ask cap is enforced twice:** the prompt switches to a verdict-only contract at
  the cap, and an ask-type reply at the cap is discarded and retried as verdict-only.
- On a verdict the function inserts the **`diagnoses`** history row (`verdict_id:
  'ai-session'`, `question_path` = compact transcript) and concludes the session; the
  client then inserts `care_recommendations` proposals for the next steps + follow-up.
- Up to the 4 most recent session photos are attached to the model call, fetched with
  magic-byte media-type detection (`_shared/images.ts`).
- The opening photo can be pre-uploaded by the Camera screen's Diagnose mode (v1.10.0):
  it uses the same `{userId}/{plantId}/diagnosis/…` path convention, so the existing
  path guard applies unchanged — no contract change.

---

## `send-care-push` *(v1.9.0)*

The daily care-digest sender (Phase 4 of `docs/ASSISTANT-SPEC.md`). Not an AI function
and **never called from the browser** — pg_cron + pg_net invoke it once a day at
13:00 UTC (~9 am Eastern; see the schedule SQL in [SETUP.md](SETUP.md) step 5).

**Auth:** there is no user JWT on this path. The caller must send
`x-cron-secret: <CRON_SECRET>`; any other request gets **401**. If `CRON_SECRET` is not
configured the function refuses to run (**500** — fails closed, never open). POST only
(**405** otherwise). No CORS headers — browsers have no business here.

**Request** (header `x-cron-secret` required):

```json
{}
```

**Response 200:**

```json
{ "ok": true, "usersConsidered": 2, "usersPushed": 1, "sent": 2, "pruned": 0, "skipped": 0 }
```

`usersConsidered` = users with ≥1 subscription · `usersPushed` = users who received a
digest · `sent` = individual device pushes · `pruned` = dead subscriptions deleted ·
`skipped` = users already pushed today.

**What it sends.** Per subscribed user it gathers, with the service role:

- **Overdue care** — plants whose watering or fertilizing interval has lapsed (the same
  rule as `computeWateringStatus` in `lib/utils.ts`: more days since the last
  `watered`/`fertilized` log than the interval, or no log at all). Due-soon is *not*
  included — pushes are for things that need action now.
- **Assistant tasks due** — `care_recommendations` with status `proposed`/`accepted` and
  `due_date` ≤ today (Eastern). This is what carries diagnosis follow-up checks.

If anything is due, ONE digest goes to all of the user's devices — e.g. title
`2 plants need you 🌿`, body `Water Mabel · Recheck lower leaves (Big Fern)`, capped at
4 items + `+N more`. The payload deep-links to Today (`/`); `public/sw.js` renders it and
handles the click.

**Hard rules** (from the spec):

- **Max one push per user per day** — enforced via `push_subscriptions.last_pushed_at`
  (set after a successful send; users with any subscription already pushed today in
  Eastern time are skipped), so even a double-fired cron can't spam.
- **Silence on quiet days** — a user with nothing due gets nothing at all.

**Subscription hygiene:** a push endpoint answering **404/410** means the browser revoked
the subscription (permission withdrawn, app uninstalled) — the row is deleted. Other send
errors are logged and the subscription is kept.

**Notes**

- Sends use `npm:web-push@3.6.7` under Deno's npm compatibility with VAPID keys from
  Supabase secrets. The client subscribes with the matching public key
  (`NEXT_PUBLIC_VAPID_PUBLIC_KEY` env var → `lib/notifications.ts`).
- "Today" is computed in `America/New_York`, matching the app's hardcoded
  northern-hemisphere assumption.
- Database reads follow the 3-query enrichment pattern (plants, then care_logs +
  care_recommendations batched with `.in(...)`) regardless of user count.
