// supabase/functions/analyze-plant/index.ts
//
// Edge Function that analyzes a plant photo using an AI vision model.
// The AI provider is controlled by the AI_PROVIDER environment variable,
// making it easy to swap between Claude and Gemini without changing app code.
//
// Accepts:
//   imageUrl         — public URL to the plant photo (required)
//   previousAnalyses — array of past analysis summaries (optional)
//   recentCareLogs   — array of recent care events (optional)
//   speciesProfile   — cached species reference data from species_profiles table (optional)
//   plantContext     — location, pot size, soil type for grounded recommendations (optional)
//   seasonContext    — current month + hemisphere for season-aware advice (optional)
//
// Returns: { result: { species, health, health_score, care } }

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { encode as encodeBase64 } from 'https://deno.land/std@0.168.0/encoding/base64.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ── Types ─────────────────────────────────────────────────────────────────────

type PreviousAnalysis = {
  date: string
  species: string | null
  health: string | null
  health_score: number | null   // Gap 5 — lets AI reference trend
  care: string | null            // Gap 3 — lets AI reflect on prior recommendations
}

type CareLogEntry = {
  type: string
  notes: string | null
  date: string
  category?: 'growth' | 'pest' | 'environment' | 'concern' | 'general' | null   // Gap 4
  measurement_value?: number | null   // Gap 6
  measurement_unit?: string | null    // Gap 6
}

type SpeciesProfileContext = {
  scientific_name?: string | null
  light?: string | null
  watering?: string | null
  humidity?: string | null
  temperature?: string | null
  common_problems?: string | null
  pruning_tips?: string | null       // Gap 1
  disease_symptoms?: string | null   // Gap 1
  seasonal_care?: string | null      // Gap 1
  [key: string]: string | null | undefined
}

type PlantContext = {
  location?: string | null
  pot_size?: string | null
  soil_type?: string | null             // e.g. "aroid mix" — affects watering frequency advice (Phase 12C)
  plant_notes?: string | null           // Gap 2 — freeform owner notes from plants.notes
  pest_notes?: string | null            // Gap 2 — pest history from plants.pest_notes
  last_treatment_date?: string | null   // Gap 2 — YYYY-MM-DD
}

type SeasonContext = {
  month: number                          // 1–12
  hemisphere: 'northern' | 'southern'   // northern by default
}

// ── Prompt builder ────────────────────────────────────────────────────────────

function buildPrompt(
  previousAnalyses: PreviousAnalysis[],
  recentCareLogs: CareLogEntry[],
  speciesProfile: SpeciesProfileContext | null,
  plantContext: PlantContext | null,
  seasonContext: SeasonContext | null
): string {
  const hasHistory = previousAnalyses.length > 0
  const hasCare    = recentCareLogs.length > 0

  const speciesSection = speciesProfile
    ? `\nSpecies reference data (use this to assess whether the plant's conditions match its known requirements):
- Scientific name: ${speciesProfile.scientific_name ?? 'unknown'}
- Light needs: ${speciesProfile.light ?? 'unknown'}
- Watering: ${speciesProfile.watering ?? 'unknown'}
- Humidity: ${speciesProfile.humidity ?? 'unknown'}
- Temperature: ${speciesProfile.temperature ?? 'unknown'}
- Common problems: ${speciesProfile.common_problems ?? 'unknown'}
- Disease & pest symptoms to watch for: ${speciesProfile.disease_symptoms ?? 'unknown'}
- Pruning guidance: ${speciesProfile.pruning_tips ?? 'unknown'}
- Seasonal care notes: ${speciesProfile.seasonal_care ?? 'unknown'}`
    : ''

  const contextParts: string[] = []
  if (plantContext?.location)            contextParts.push(`- Location: ${plantContext.location}`)
  if (plantContext?.pot_size)            contextParts.push(`- Pot size: ${plantContext.pot_size}`)
  if (plantContext?.soil_type)           contextParts.push(`- Soil type: ${plantContext.soil_type}`)
  if (plantContext?.plant_notes)         contextParts.push(`- Owner's notes on this plant: ${plantContext.plant_notes}`)
  if (plantContext?.pest_notes)          contextParts.push(`- Pest history: ${plantContext.pest_notes}`)
  if (plantContext?.last_treatment_date) contextParts.push(`- Most recent pest treatment: ${plantContext.last_treatment_date}`)
  const plantContextSection = contextParts.length > 0
    ? `\nPlant context:\n${contextParts.join('\n')}\nFactor this into your recommendations — reference the specific conditions of their location, let soil type inform watering frequency advice, and take pest history seriously when interpreting what you see in the photo.`
    : ''

  // Seasonal context: lets the AI give season-appropriate advice and flag
  // when winter dormancy should prompt interval adjustments.
  let seasonSection = ''
  if (seasonContext) {
    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    const monthName  = monthNames[seasonContext.month - 1]
    const isWinter   = seasonContext.hemisphere === 'northern'
      ? [11, 12, 1, 2].includes(seasonContext.month)
      : [5, 6, 7, 8].includes(seasonContext.month)
    seasonSection = `\nSeasonal context: ${monthName} (${seasonContext.hemisphere} hemisphere).${
      isWinter
        ? ' It is currently winter — most houseplants have slower growth and need less frequent watering. Mention this if it is relevant to the plant\'s care.'
        : ''
    }`
  }

  const historySection = hasHistory
    ? `\nPrevious analysis history (most recent first):
${previousAnalyses.map(a => {
  const score = a.health_score !== null ? ` Score: ${a.health_score}/5.` : ''
  const care  = a.care ? ` Previous recommendations: ${a.care}` : ''
  return `[${a.date}] Species: ${a.species ?? 'unknown'}. Health: ${a.health ?? 'not recorded'}.${score}${care}`
}).join('\n')}
Compare what you observe now against this history. If scores are trending up, affirm the progress; if trending down, flag it and adjust recommendations accordingly. Where a previous analysis made specific recommendations, use the recent care log below as evidence of whether the owner followed them — and comment on whether those actions appear to have helped.`
    : ''

  const careSection = hasCare
    ? `\nRecent care log:
${recentCareLogs.map(l => {
  let line = `[${l.date}] ${l.type}`
  if (l.type === 'note' && l.category) line += ` (${l.category})`
  if (l.type === 'measured' && l.measurement_value !== null && l.measurement_value !== undefined) {
    line += ` — ${l.measurement_value}${l.measurement_unit ? ' ' + l.measurement_unit : ''}`
  }
  if (l.notes) line += `: ${l.notes}`
  return line
}).join('\n')}
Factor this care history into your assessment. If the plant was recently watered, don't recommend watering unless there's a clear need. Treat 'note' entries as first-person owner observations — the category tag in parentheses indicates what the owner was focused on (growth, pest, environment, concern, general). Treat 'measured' entries as objective trend data: compare successive values to assess growth rate and flag stagnation or acceleration.`
    : ''

  const healthInstruction = hasHistory
    ? 'Reference previous observations to describe whether the plant is improving, stable, or declining.'
    : 'Note any visible issues like yellowing, pests, root problems, or other concerns.'

  return `You are an expert botanist and plant care specialist.
Analyze this photo of a houseplant and respond with a JSON object in exactly this format:
{
  "species": "Common name (Scientific name if known)",
  "health": "A 2-3 sentence assessment of the plant's current health. ${healthInstruction}",
  "health_score": 4,
  "care": "2-3 specific, actionable care recommendations for this plant right now."
}
health_score must be an integer from 1 to 5: 1=critical, 2=poor, 3=fair, 4=good, 5=excellent.
Only respond with the JSON object. No extra text.${speciesSection}${plantContextSection}${seasonSection}${historySection}${careSection}`
}

// ── Helpers ───────────────────────────────────────────────────────────────────

type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'

function detectMediaType(bytes: Uint8Array): ImageMediaType {
  if (
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) return 'image/webp'
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) return 'image/png'
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) return 'image/gif'
  if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) return 'image/jpeg'
  return 'image/jpeg'
}

async function fetchImageAsBase64(imageUrl: string): Promise<{ base64: string; mediaType: ImageMediaType }> {
  const response = await fetch(imageUrl)
  if (!response.ok) throw new Error(`Failed to fetch image (${response.status}): ${imageUrl}`)
  const arrayBuffer = await response.arrayBuffer()
  const bytes = new Uint8Array(arrayBuffer)
  const base64 = encodeBase64(arrayBuffer)
  const mediaType = detectMediaType(bytes)
  console.log(`Fetched image — detected media type: ${mediaType}`)
  return { base64, mediaType }
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
      max_tokens: 1024,
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

// ── Gemini ────────────────────────────────────────────────────────────────────

async function callGemini(base64Image: string, mediaType: ImageMediaType, prompt: string): Promise<string> {
  const apiKey = Deno.env.get('GEMINI_API_KEY')
  if (!apiKey) throw new Error('GEMINI_API_KEY secret is not set')

  const model = 'gemini-2.5-flash'
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { inline_data: { mime_type: mediaType, data: base64Image } },
          { text: prompt },
        ],
      }],
      generationConfig: { responseMimeType: 'application/json' },
    }),
  })

  const data = await response.json()
  if (!response.ok) throw new Error(data.error?.message ?? 'Gemini API error')
  return data.candidates[0].content.parts[0].text
}

// ── Main handler ──────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const {
      imageUrl,
      previousAnalyses = [],
      recentCareLogs   = [],
      speciesProfile   = null,
      plantContext     = null,
      seasonContext    = null,
    } = await req.json()

    if (!imageUrl) {
      return new Response(
        JSON.stringify({ error: 'imageUrl is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const prompt = buildPrompt(previousAnalyses, recentCareLogs, speciesProfile, plantContext, seasonContext)
    console.log(
      'Analysis with',
      previousAnalyses.length, 'previous analyses,',
      recentCareLogs.length, 'care log entries,',
      speciesProfile ? 'species profile included' : 'no species profile',
      seasonContext  ? `month: ${seasonContext.month}` : 'no season context'
    )

    const { base64: base64Image, mediaType } = await fetchImageAsBase64(imageUrl)

    const provider = Deno.env.get('AI_PROVIDER') ?? 'claude'
    let resultText: string

    if (provider === 'claude') {
      resultText = await callClaude(base64Image, mediaType, prompt)
    } else if (provider === 'gemini') {
      resultText = await callGemini(base64Image, mediaType, prompt)
    } else {
      throw new Error(`Unknown AI_PROVIDER: ${provider}`)
    }

    const result = JSON.parse(resultText)

    // Clamp health_score to the valid 1–5 range in case the model drifts
    if (typeof result.health_score === 'number') {
      result.health_score = Math.min(5, Math.max(1, Math.round(result.health_score)))
    }

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
