# Viriditas — Edge Function API Reference

**Purpose:** request/response contract, auth model, error behavior, and deploy commands for
the five Supabase Edge Functions that power the AI features. Source of truth is the code in
`supabase/functions/*/index.ts`; this file mirrors it as of v1.7.0.

> **Shared modules (v1.7.0):** `supabase/functions/_shared/` holds the plant-context
> prompt builders (`plant-context.ts`) and image fetching with magic-byte type detection
> (`images.ts`), used by both `analyze-plant` and `diagnose-plant`. Supabase bundles
> `_shared/` into each function at deploy time — **changing a shared file requires
> redeploying every function that imports it.**

## Common behavior (all five functions)

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
| `ANTHROPIC_API_KEY` | all five | required |
| `AI_PROVIDER` | analyze-plant, fetch-species-info | `claude` (default if unset) or `gemini` |
| `GEMINI_API_KEY` | analyze-plant, fetch-species-info | only needed when `AI_PROVIDER=gemini` |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | (auto) | injected by Supabase; not set manually |

### Provider support matrix

| Function | Claude | Gemini (`AI_PROVIDER=gemini`) |
|---|---|---|
| `analyze-plant` | ✅ `claude-haiku-4-5-20251001` | ✅ `gemini-2.5-flash` |
| `fetch-species-info` | ✅ | ✅ |
| `identify-species` | ✅ | ❌ always Claude |
| `suggest-species` | ✅ | ❌ always Claude |
| `diagnose-plant` | ✅ `claude-sonnet-4-6` | ❌ always Claude (by design — see spec) |

### Deploy

```bash
supabase functions deploy analyze-plant --no-verify-jwt
supabase functions deploy fetch-species-info --no-verify-jwt
supabase functions deploy identify-species --no-verify-jwt
supabase functions deploy suggest-species --no-verify-jwt
supabase functions deploy diagnose-plant --no-verify-jwt
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
database writes. Called from Explore photo search and Add Plant step 1.

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
