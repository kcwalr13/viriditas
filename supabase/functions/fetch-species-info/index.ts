// supabase/functions/fetch-species-info/index.ts
//
// Edge Function that fetches encyclopedic species data for a houseplant.
// Uses the Claude API to generate a structured species profile, then saves
// it to the species_profiles table so it never needs to be fetched again.
//
// Accepts:
//   speciesName — the species name as identified by AI analysis (required)
//
// Behaviour:
//   1. Checks if a profile already exists in species_profiles for this species.
//   2. If yes, returns it immediately (no AI call needed).
//   3. If no, calls Claude to generate a rich JSON species profile.
//   4. Saves the profile to species_profiles (keyed by species name).
//   5. Returns the profile to the app.
//
// Because profiles are shared across all users, the AI is called at most once
// per species ever — subsequent users with the same plant get the cached version.
//
// Provider: Claude only. The Gemini branch and the AI_PROVIDER switch were
// retired in v1.8.0 (spec decision #1 — one product voice, one quality bar);
// git history preserves the old paths.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Required for all Supabase Edge Functions — allows the app to call this function
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ── Prompt ────────────────────────────────────────────────────────────────────

// Builds the prompt for the AI species profile request.
// We ask for strict JSON so the response can be reliably parsed and stored.
function buildSpeciesPrompt(speciesName: string): string {
  return `You are an expert botanist and houseplant care specialist.

Provide a comprehensive care and reference profile for the following houseplant: "${speciesName}"

Respond with a JSON object in exactly this format — no extra text, no markdown fences:
{
  "common_names": "Comma-separated list of common names (e.g. Rubber Plant, Rubber Fig)",
  "scientific_name": "The full scientific/Latin name (e.g. Ficus elastica)",
  "light": "Detailed light requirements. Use bullet format with '• ' for distinct points:\n• Preferred intensity and direction\n• Signs of too much or too little light\n• Any seasonal variation",
  "watering": "Watering guidance in bullet format:\n• How often and how to judge when to water\n• Signs of overwatering and underwatering\n• Any seasonal adjustments",
  "humidity": "Humidity needs — 1–3 sentences is fine if straightforward, or use bullets if there are multiple distinct points.",
  "temperature": "Temperature range and tolerance in bullet format:\n• Ideal range in °F and °C\n• Cold and heat tolerance limits\n• Whether to keep away from drafts, vents, or radiators",
  "soil": "Soil and repotting guidance in bullet format:\n• Best soil mix and drainage needs\n• When and how to repot\n• Pot size guidance",
  "toxicity": "Whether toxic to cats, dogs, or humans — be specific about symptoms if toxic. 1–2 sentences.",
  "common_problems": "The most frequent issues in bullet format — one bullet per problem:\n• [Problem name]: cause and how to treat",
  "growth_habits": "Growth characteristics — 2–3 sentences or bullets covering size at maturity, growth rate, and notable growth pattern.",
  "propagation": "Propagation methods in bullet format:\n• [Method]: brief steps",
  "pruning_tips": "Pruning guidance in bullet format:\n• When to prune (season or growth stage)\n• What to remove and why\n• How to make clean cuts",
  "disease_symptoms": "Visual symptoms to watch for in bullet format — one bullet per condition:\n• [Disease/Pest/Deficiency]: what it looks like and how to treat it",
  "seasonal_care": "How care needs shift across seasons in bullet format:\n• Spring: growth resumes — what to adjust\n• Summer: peak growth — watering and feeding notes\n• Autumn: slow-down — what to reduce\n• Winter: dormancy or rest — watering, light, and temperature notes"
}

IMPORTANT: Within each JSON string value, use '\\n• ' (newline + bullet) to separate distinct points where bullet format is requested above. This makes the content easy to read in the app.

If the species name is unrecognized or too vague to give reliable care information, still return the JSON but note the uncertainty in the relevant fields.`
}

// ── Claude ────────────────────────────────────────────────────────────────────

async function callClaude(speciesName: string): Promise<Record<string, string>> {
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
      max_tokens: 2048,   // Species profiles are longer than health analyses
      messages: [{
        role: 'user',
        content: buildSpeciesPrompt(speciesName),
      }],
    }),
  })

  const data = await response.json()
  if (!response.ok) throw new Error(data.error?.message ?? 'Claude API error')

  // Strip any markdown code fences Claude might add
  let text: string = data.content[0].text
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  return JSON.parse(text)
}

// ── Profile field whitelist ───────────────────────────────────────────────────

// The AI's JSON is untrusted output. Map it field-by-field onto the exact
// species_profiles schema instead of spreading it into the upsert — a blind
// spread would let unexpected keys reach the database write.
function sanitizeProfileFields(fields: Record<string, unknown>) {
  const str = (v: unknown): string | null =>
    typeof v === 'string' && v.trim() !== '' ? v : null
  return {
    common_names:     str(fields.common_names),
    scientific_name:  str(fields.scientific_name),
    light:            str(fields.light),
    watering:         str(fields.watering),
    humidity:         str(fields.humidity),
    temperature:      str(fields.temperature),
    soil:             str(fields.soil),
    toxicity:         str(fields.toxicity),
    common_problems:  str(fields.common_problems),
    growth_habits:    str(fields.growth_habits),
    propagation:      str(fields.propagation),
    pruning_tips:     str(fields.pruning_tips),
    disease_symptoms: str(fields.disease_symptoms),
    seasonal_care:    str(fields.seasonal_care),
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Verify that the caller is a signed-in Viriditas user. This function
    // writes to the shared species_profiles cache with the service role, so
    // it must not be callable anonymously (cache poisoning + free AI calls).
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const authClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { speciesName, forceRefresh = false } = await req.json()

    if (!speciesName || typeof speciesName !== 'string' || speciesName.trim() === '') {
      return new Response(
        JSON.stringify({ error: 'speciesName is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const normalizedName = speciesName.trim()

    // Create a Supabase client using the service role key.
    // The service role bypasses RLS, letting the Edge Function read and write
    // species_profiles without needing a user token.
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // ── Check cache first (unless forceRefresh requested) ────────────────────

    if (!forceRefresh) {
      const { data: existing, error: fetchError } = await supabase
        .from('species_profiles')
        .select('*')
        .eq('species_name', normalizedName)
        .single()

      if (existing && !fetchError) {
        console.log('Returning cached species profile for:', normalizedName)
        return new Response(
          JSON.stringify({ profile: existing, cached: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    } else {
      console.log('Force refresh requested for:', normalizedName)
    }

    // ── Fetch from AI ────────────────────────────────────────────────────────

    console.log('Fetching new species profile for:', normalizedName)

    const profileFields = await callClaude(normalizedName)

    // ── Save to database ─────────────────────────────────────────────────────

    // Upsert in case of a race condition (two users fetching the same species
    // at the same moment — only one row should exist)
    const { data: saved, error: saveError } = await supabase
      .from('species_profiles')
      .upsert({
        species_name: normalizedName,
        ...sanitizeProfileFields(profileFields),
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'species_name',  // Don't fail if it was just inserted by another request
      })
      .select()
      .single()

    if (saveError) {
      throw new Error(`Failed to save species profile: ${saveError.message}`)
    }

    return new Response(
      JSON.stringify({ profile: saved, cached: false }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('fetch-species-info error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
