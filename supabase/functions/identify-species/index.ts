// supabase/functions/identify-species/index.ts
//
// Lightweight Edge Function that identifies a plant species from a photo.
// Used exclusively by the Explore / Encyclopedia screen — where the user
// uploads a photo for a one-off lookup rather than registering a new plant.
//
// Unlike analyze-plant, this function:
//   - Accepts image data directly as base64 (no Supabase Storage needed)
//   - Returns only the species name, not a full health analysis
//   - Does not write anything to the database
//
// Accepts:
//   imageBase64 — base64-encoded image data (without the data: URI prefix)
//   mimeType    — the image MIME type (e.g. "image/jpeg", "image/webp")
//
// Returns:
//   { speciesName: string | null }
//   speciesName is null if the image doesn't show a recognisable plant.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// The only image formats the Claude API accepts — and the only mimeType
// values we forward. Anything else is rejected up front.
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const
type AllowedMimeType = typeof ALLOWED_MIME_TYPES[number]

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Verify that the caller is a signed-in Viriditas user. Checking only
    // that an Authorization header EXISTS is not authentication — the token
    // must be validated against the Supabase auth server.
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { imageBase64, mimeType } = await req.json()

    if (!imageBase64 || !mimeType) {
      return new Response(
        JSON.stringify({ error: 'imageBase64 and mimeType are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!ALLOWED_MIME_TYPES.includes(mimeType as AllowedMimeType)) {
      return new Response(
        JSON.stringify({ error: `mimeType must be one of: ${ALLOWED_MIME_TYPES.join(', ')}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY secret is not set')

    // Ask Claude to identify the plant species from the image.
    // We keep the prompt very focused — just the species name, nothing more.
    // The full care profile is fetched separately via fetch-species-info.
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 100,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                // Claude requires the exact MIME type string
                media_type: mimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
                data: imageBase64,
              },
            },
            {
              type: 'text',
              text: `Identify the houseplant species in this image.
Respond with a JSON object in exactly this format — no extra text, no markdown:
{
  "speciesName": "Genus species (Common Name)",
  "confidence": "high | medium | low",
  "notAPlant": false
}
If the image does not show a plant, set notAPlant to true and speciesName to null.
If you can identify the genus but not the exact species, give the genus with "sp." (e.g. "Philodendron sp.").`,
            },
          ],
        }],
      }),
    })

    const data = await response.json()
    if (!response.ok) throw new Error(data.error?.message ?? 'Claude API error')

    // Strip any accidental markdown fences and parse the JSON response
    let text: string = data.content[0].text
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    const result = JSON.parse(text)

    return new Response(
      JSON.stringify({
        speciesName: result.notAPlant ? null : (result.speciesName ?? null),
        confidence: result.confidence ?? 'low',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('identify-species error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
