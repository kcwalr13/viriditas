// supabase/functions/suggest-species/index.ts
//
// Edge Function that takes a freeform plant search query and returns a list of
// candidate houseplant species the user might mean.
//
// Handles misspellings, phonetic approximations, common names, and partial names.
// (e.g. "filadendren" → several Philodendron species)
//
// Accepts:  { query: string }
// Returns:  { suggestions: Array<{ scientificName, commonName, description }> }
//
// Thumbnails are NOT fetched here — the browser fetches them from the free
// Wikipedia REST API after receiving the suggestions list.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface Suggestion {
  scientificName: string
  commonName: string
  description: string
}

// ── Claude ────────────────────────────────────────────────────────────────────

async function suggestWithClaude(query: string, apiKey: string): Promise<Suggestion[]> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',  // upgraded from Haiku 2026-06-11 — accuracy over cost while solo-use (see CHANGELOG 1.10.1)
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: `A user is searching for a houseplant with the query: "${query}"

Identify the 4–6 most likely houseplant species they could be looking for. Be generous in your interpretation — account for:
• Misspellings and phonetic approximations (e.g. "filadendren" → Philodendron)
• Common names, nicknames, and trade names
• Partial, abbreviated, or truncated names
• Similar-sounding or related species

Return ONLY a JSON array — no surrounding text, no markdown fences, no explanation:
[
  {
    "scientificName": "Genus species (full two-part scientific name)",
    "commonName": "The most widely recognised common English name",
    "description": "One sentence describing what makes this plant visually distinctive or why it is popular as a houseplant."
  }
]

Include only plants commonly kept as houseplants. Order the list by most likely match first.`,
      }],
    }),
  })

  const data = await response.json()
  if (!response.ok) throw new Error(data.error?.message ?? 'Claude API error')

  const text: string = data.content?.[0]?.text?.trim() ?? ''

  // Claude sometimes wraps the array in a code fence — strip it
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()

  // Extract the JSON array from the response
  const jsonMatch = cleaned.match(/\[[\s\S]*\]/)
  if (!jsonMatch) throw new Error('Unexpected response format from AI')

  return JSON.parse(jsonMatch[0]) as Suggestion[]
}

// ── Main handler ──────────────────────────────────────────────────────────────

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Verify that the caller is a signed-in Viriditas user
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

    const { query } = await req.json()

    // Empty query → return empty list (no AI call needed)
    if (!query?.trim()) {
      return new Response(JSON.stringify({ suggestions: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY secret is not configured')

    const suggestions = await suggestWithClaude(query.trim(), apiKey)

    return new Response(JSON.stringify({ suggestions }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('suggest-species error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
