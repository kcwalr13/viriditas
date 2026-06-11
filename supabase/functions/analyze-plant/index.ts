// supabase/functions/analyze-plant/index.ts
//
// Edge Function that analyzes a plant photo using an AI vision model.
// Provider: Claude only (claude-haiku-4-5). The Gemini branch and the
// AI_PROVIDER switch were retired in v1.8.0 (spec decision #1 — one product
// voice, one quality bar); git history preserves the old paths.
//
// Accepts:
//   imageUrl         — public URL to the plant photo (required)
//   previousAnalyses — array of past analysis summaries (optional)
//   recentCareLogs   — array of recent care events (optional)
//   speciesProfile   — cached species reference data from species_profiles table (optional)
//   plantContext     — location, pot size, soil type, current schedules (optional)
//   seasonContext    — current month + hemisphere for season-aware advice (optional)
//   identityContext  — whether the owner has verified the species name (optional)
//
// Returns (v2 — additive, backward compatible):
//   { result: { species, health, health_score, care, actions, interval_suggestion } }
// `actions` is 0–3 structured next steps; `interval_suggestion` proposes a
// schedule change or is null. Both are sanitized server-side before returning.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
// Context types + section builders shared with diagnose-plant (Phase 2
// extraction). Supabase bundles `_shared/` into each function on deploy.
import {
  buildContextSections,
  type PreviousAnalysis,
  type CareLogEntry,
  type SpeciesProfileContext,
  type PlantContext,
  type SeasonContext,
  type IdentityContext,
} from '../_shared/plant-context.ts'
import { fetchImageAsBase64, type ImageMediaType } from '../_shared/images.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ── v2 structured output (Phase 1) ───────────────────────────────────────────

type ActionUrgency = 'now' | 'soon' | 'routine'

type AnalysisAction = {
  action: string
  rationale: string
  urgency: ActionUrgency
  due_in_days: number | null
}

type IntervalSuggestion = {
  type: 'watering' | 'fertilizing'
  current_days: number | null
  suggested_days: number
  reason: string
}

// ── Prompt builder ────────────────────────────────────────────────────────────

function buildPrompt(
  previousAnalyses: PreviousAnalysis[],
  recentCareLogs: CareLogEntry[],
  speciesProfile: SpeciesProfileContext | null,
  plantContext: PlantContext | null,
  seasonContext: SeasonContext | null,
  identityContext: IdentityContext | null
): string {
  const hasHistory = previousAnalyses.length > 0

  // The shared context block (identity → species → plant context → season →
  // history → care log) — identical to what diagnose-plant feeds its model.
  const contextBlock = buildContextSections(
    previousAnalyses, recentCareLogs, speciesProfile, plantContext, seasonContext, identityContext
  )

  const healthInstruction = hasHistory
    ? 'Reference previous observations to describe whether the plant is improving, stable, or declining.'
    : 'Note any visible issues like yellowing, pests, root problems, or other concerns.'

  return `You are an expert botanist and plant care specialist.
Analyze this photo of a houseplant and respond with a JSON object in exactly this format:
{
  "species": "Common name (Scientific name if known)",
  "health": "A 2-3 sentence assessment of the plant's current health. ${healthInstruction}",
  "health_score": 4,
  "care": "2-3 specific, actionable care recommendations for this plant right now.",
  "actions": [
    { "action": "Move out of direct afternoon sun",
      "rationale": "One or two sentences tying this step to what you observe in the photo or history.",
      "urgency": "soon",
      "due_in_days": 2 }
  ],
  "interval_suggestion": { "type": "watering", "current_days": 7, "suggested_days": 10, "reason": "Why the schedule should change." }
}
health_score must be an integer from 1 to 5: 1=critical, 2=poor, 3=fair, 4=good, 5=excellent.
Rules for "actions" (structured next steps — these become tasks in the owner's app):
- 0 to 3 entries. Emit ZERO actions when the plant is healthy and needs nothing — do not invent work.
- Each "action" is a single imperative step, at most 80 characters, specific to THIS plant in THIS condition — never generic species advice ("provide bright indirect light" is generic; "move it off the radiator shelf" is specific).
- "urgency" must be exactly one of: "now" (today), "soon" (within days), "routine" (fold into normal care).
- "due_in_days" is an integer number of days from today the step should be done by, or null if it has no deadline.
- Do not duplicate the routine the owner already follows (e.g. don't emit "water it" if watering is on schedule).
Rules for "interval_suggestion" (a proposed schedule change):
- Include it ONLY when the evidence clearly supports changing the watering or fertilizing schedule (seasonal dormancy, repeated overwatering signs, growth-rate change). Otherwise set it to null.
- "type" is "watering" or "fertilizing"; "current_days" is the current schedule from the plant context (null if none); "suggested_days" is your proposed interval.
Only respond with the JSON object. No extra text.${contextBlock}`
}

// ── v2 output sanitizers ──────────────────────────────────────────────────────
// Never trust model output shape: clamp to 3 actions, whitelist urgency,
// drop malformed entries (the fetch-species-info field-by-field pattern).

const URGENCY_VALUES: ActionUrgency[] = ['now', 'soon', 'routine']

function sanitizeActions(raw: unknown): AnalysisAction[] {
  if (!Array.isArray(raw)) return []
  const out: AnalysisAction[] = []
  for (const entry of raw) {
    if (out.length >= 3) break
    if (typeof entry !== 'object' || entry === null) continue
    const e = entry as Record<string, unknown>
    if (typeof e.action !== 'string' || e.action.trim().length === 0) continue
    const urgency: ActionUrgency = typeof e.urgency === 'string' && URGENCY_VALUES.includes(e.urgency as ActionUrgency)
      ? e.urgency as ActionUrgency
      : 'routine'
    const due = typeof e.due_in_days === 'number' && Number.isFinite(e.due_in_days)
      ? Math.min(60, Math.max(0, Math.round(e.due_in_days)))
      : null
    out.push({
      action: e.action.trim().slice(0, 120),
      rationale: typeof e.rationale === 'string' ? e.rationale.trim() : '',
      urgency,
      due_in_days: due,
    })
  }
  return out
}

function sanitizeIntervalSuggestion(raw: unknown): IntervalSuggestion | null {
  if (typeof raw !== 'object' || raw === null) return null
  const e = raw as Record<string, unknown>
  if (e.type !== 'watering' && e.type !== 'fertilizing') return null
  if (typeof e.suggested_days !== 'number' || !Number.isFinite(e.suggested_days)) return null
  return {
    type: e.type,
    current_days: typeof e.current_days === 'number' && Number.isFinite(e.current_days)
      ? Math.round(e.current_days)
      : null,
    suggested_days: Math.min(365, Math.max(1, Math.round(e.suggested_days))),
    reason: typeof e.reason === 'string' ? e.reason.trim() : '',
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// SSRF guard: the function fetches imageUrl server-side, so a malicious caller
// could otherwise point it at internal services or arbitrary hosts. Only URLs
// on this project's own Supabase Storage (plant-photos bucket) are allowed.
function isAllowedImageUrl(imageUrl: string): boolean {
  try {
    const parsed = new URL(imageUrl)
    const allowedHost = new URL(Deno.env.get('SUPABASE_URL') ?? '').hostname
    return (
      parsed.protocol === 'https:' &&
      parsed.hostname === allowedHost &&
      parsed.pathname.startsWith('/storage/v1/object/public/plant-photos/')
    )
  } catch {
    return false
  }
}

// ── Claude ────────────────────────────────────────────────────────────────────

async function callClaude(base64Image: string, mediaType: ImageMediaType, prompt: string): Promise<string> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY secret is not set')

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      // v2 adds structured actions to the output — 1024 was occasionally
      // tight with 3 actions + rationales on top of health/care prose.
      max_tokens: 1536,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64Image } },
          { type: 'text', text: prompt },
        ],
      }],
    }),
  })

  const data = await response.json()
  if (!response.ok) throw new Error(data.error?.message ?? 'Claude API error')
  let text: string = data.content[0].text
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  return text
}

// ── Main handler ──────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    // Verify that the caller is a signed-in Viriditas user. The function is
    // deployed with --no-verify-jwt, so it must validate the token itself.
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const {
      imageUrl,
      previousAnalyses = [],
      recentCareLogs   = [],
      speciesProfile   = null,
      plantContext     = null,
      seasonContext    = null,
      identityContext  = null,
    } = await req.json()

    if (!imageUrl) {
      return new Response(
        JSON.stringify({ error: 'imageUrl is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!isAllowedImageUrl(imageUrl)) {
      return new Response(
        JSON.stringify({ error: 'imageUrl must point to the plant-photos storage bucket' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const prompt = buildPrompt(previousAnalyses, recentCareLogs, speciesProfile, plantContext, seasonContext, identityContext)
    console.log(
      'Analysis with',
      previousAnalyses.length, 'previous analyses,',
      recentCareLogs.length, 'care log entries,',
      speciesProfile ? 'species profile included' : 'no species profile',
      seasonContext  ? `month: ${seasonContext.month}` : 'no season context'
    )

    const { base64: base64Image, mediaType } = await fetchImageAsBase64(imageUrl)

    const resultText = await callClaude(base64Image, mediaType, prompt)
    const result = JSON.parse(resultText)

    // Clamp health_score to the valid 1–5 range in case the model drifts
    if (typeof result.health_score === 'number') {
      result.health_score = Math.min(5, Math.max(1, Math.round(result.health_score)))
    }

    // v2 structured output — sanitized before it leaves the function so the
    // client can trust the shape (≤3 actions, whitelisted urgency values).
    result.actions = sanitizeActions(result.actions)
    result.interval_suggestion = sanitizeIntervalSuggestion(result.interval_suggestion)

    return new Response(
      JSON.stringify({ result }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('analyze-plant error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
