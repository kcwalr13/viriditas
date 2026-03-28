// supabase/functions/analyze-plant/index.ts
//
// Edge Function that analyzes a plant photo using an AI vision model.
// The AI provider is controlled by the AI_PROVIDER environment variable,
// making it easy to swap between Claude and Gemini without changing app code.
//
// Accepts:
//   imageUrl         — public URL to the plant photo (required)
//   previousAnalyses — array of past analysis summaries (optional)
//                      When provided, the AI uses them to comment on progress over time.
//   recentCareLogs   — array of recent care events (optional)
//                      Used to make recommendations more contextually relevant.
//   speciesProfile   — cached species reference data from species_profiles table (optional)
//                      When provided, the AI knows the species' ideal conditions up front,
//                      making health assessments and recommendations more accurate.
//
// Supported providers (set via AI_PROVIDER secret):
//   claude  — Anthropic Claude API (current default)
//   gemini  — Google Gemini

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { encode as encodeBase64 } from 'https://deno.land/std@0.168.0/encoding/base64.ts'

// Required for all Supabase Edge Functions — allows the app to call this function
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ── Prompt builder ─────────────────────────────────────────────────────────────

// Builds the analysis prompt, weaving in species reference data, analysis history,
// and care log context when available so the AI can give species-aware,
// progress-aware, care-informed responses.
type PreviousAnalysis = {
  date: string
  species: string | null
  health: string | null
  care: string | null
}

type CareLogEntry = {
  type: string
  notes: string | null
  date: string
}

// Matches the fields stored in species_profiles
type SpeciesProfileContext = {
  scientific_name?: string | null
  light?: string | null
  watering?: string | null
  humidity?: string | null
  temperature?: string | null
  common_problems?: string | null
  [key: string]: string | null | undefined
}

function buildPrompt(
  previousAnalyses: PreviousAnalysis[],
  recentCareLogs: CareLogEntry[],
  speciesProfile: SpeciesProfileContext | null
): string {
  const hasHistory = previousAnalyses.length > 0
  const hasCare = recentCareLogs.length > 0

  // When we have a species profile, include the key care facts so the AI can
  // assess whether current conditions match what the species actually needs.
  const speciesSection = speciesProfile
    ? `\nSpecies reference data (use this to assess whether the plant's conditions and health match its known requirements):
- Scientific name: ${speciesProfile.scientific_name ?? 'unknown'}
- Light needs: ${speciesProfile.light ?? 'unknown'}
- Watering: ${speciesProfile.watering ?? 'unknown'}
- Humidity: ${speciesProfile.humidity ?? 'unknown'}
- Temperature: ${speciesProfile.temperature ?? 'unknown'}
- Common problems: ${speciesProfile.common_problems ?? 'unknown'}`
    : ''

  const historySection = hasHistory
    ? `\nPrevious analysis history (most recent first):
${previousAnalyses.map(a =>
  `[${a.date}] Species: ${a.species ?? 'unknown'}. Health: ${a.health ?? 'not recorded'}.`
).join('\n')}
Compare what you observe now against this history and note whether the plant is improving, stable, or declining.`
    : ''

  const careSection = hasCare
    ? `\nRecent care log:
${recentCareLogs.map(l =>
  `[${l.date}] ${l.type}${l.notes ? `: ${l.notes}` : ''}`
).join('\n')}
Factor this care history into your assessment and recommendations — for example, if the plant was recently watered, don't recommend watering unless there's a clear need.`
    : ''

  const healthInstruction = hasHistory
    ? 'Reference previous observations to describe whether the plant is improving, stable, or declining.'
    : 'Note any visible issues like yellowing, pests, root problems, or other concerns.'

  return `You are an expert botanist and plant care specialist.
Analyze this photo of a houseplant and respond with a JSON object in exactly this format:
{
  "species": "Common name (Scientific name if known)",
  "health": "A 2-3 sentence assessment of the plant's current health. ${healthInstruction}",
  "care": "2-3 specific, actionable care recommendations for this plant right now."
}
Only respond with the JSON object. No extra text.${speciesSection}${historySection}${careSection}`
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// Supported image media types for both Claude and Gemini
type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'

// Fetch an image from a URL and return it as a base64 string plus its media type.
// Detecting the real media type is important — browsers commonly upload WebP,
// and the Claude API will reject the request if the declared type doesn't match.
async function fetchImageAsBase64(imageUrl: string): Promise<{ base64: string; mediaType: ImageMediaType }> {
  const response = await fetch(imageUrl)
  if (!response.ok) {
    throw new Error(`Failed to fetch image (${response.status}): ${imageUrl}`)
  }

  const arrayBuffer = await response.arrayBuffer()
  const base64 = encodeBase64(arrayBuffer)

  // Read the actual content type from the response headers.
  // Fall back to inspecting the URL extension, then default to jpeg.
  const contentType = response.headers.get('content-type') ?? ''
  let mediaType: ImageMediaType = 'image/jpeg'
  if (contentType.includes('webp')) mediaType = 'image/webp'
  else if (contentType.includes('png')) mediaType = 'image/png'
  else if (contentType.includes('gif')) mediaType = 'image/gif'
  else if (contentType.includes('jpeg') || contentType.includes('jpg')) mediaType = 'image/jpeg'
  else if (imageUrl.endsWith('.webp')) mediaType = 'image/webp'
  else if (imageUrl.endsWith('.png')) mediaType = 'image/png'
  else if (imageUrl.endsWith('.gif')) mediaType = 'image/gif'

  console.log(`Fetched image — content-type: ${contentType}, resolved media type: ${mediaType}`)
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
          {
            type: 'image',
            // Use the actual detected media type — not a hardcoded jpeg
            source: { type: 'base64', media_type: mediaType, data: base64Image },
          },
          { type: 'text', text: prompt },
        ],
      }],
    }),
  })

  const data = await response.json()

  if (!response.ok) {
    throw new Error(data.error?.message ?? 'Claude API error')
  }

  // Claude sometimes wraps JSON in markdown code fences (```json ... ```)
  // Strip those out before returning so JSON.parse() works cleanly
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
          // Use the actual detected media type — not a hardcoded jpeg
          { inline_data: { mime_type: mediaType, data: base64Image } },
          { text: prompt },
        ],
      }],
      generationConfig: { responseMimeType: 'application/json' },
    }),
  })

  const data = await response.json()

  if (!response.ok) {
    throw new Error(data.error?.message ?? 'Gemini API error')
  }

  return data.candidates[0].content.parts[0].text
}

// ── Main handler ──────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const {
      imageUrl,
      previousAnalyses = [],
      recentCareLogs = [],
      speciesProfile = null,   // optional cached species reference data
    } = await req.json()

    if (!imageUrl) {
      return new Response(
        JSON.stringify({ error: 'imageUrl is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Build a prompt that includes species context, analysis history, and care logs
    const prompt = buildPrompt(previousAnalyses, recentCareLogs, speciesProfile)
    console.log(
      'Analysis with',
      previousAnalyses.length, 'previous analyses,',
      recentCareLogs.length, 'care log entries,',
      speciesProfile ? 'species profile included' : 'no species profile'
    )

    // Fetch the image from the URL and convert to base64 server-side.
    // fetchImageAsBase64 also detects the real media type from response headers
    // so we don't hardcode jpeg and break on WebP uploads from the browser.
    const { base64: base64Image, mediaType } = await fetchImageAsBase64(imageUrl)

    // Choose provider based on environment variable — defaults to claude
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
