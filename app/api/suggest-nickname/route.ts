// app/api/suggest-nickname/route.ts
// Unified AI endpoint: returns nickname suggestions AND care-schedule recommendations.
// POST body: { speciesName: string, imageBase64?: string, mimeType?: string }
// Response:  { suggestions: string[], wateringDays: number | null, feedingDays: number | null }
import { NextRequest, NextResponse } from 'next/server'

interface TextContent  { type: 'text'; text: string }
interface ImageContent { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
type MessageContent = TextContent | ImageContent

interface AiResponse {
  nicknames: string[]
  wateringDays: number | null
  feedingDays: number | null
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      speciesName?: string
      imageBase64?: string
      mimeType?: string
    }

    const { speciesName, imageBase64, mimeType } = body

    if (!speciesName || typeof speciesName !== 'string') {
      return NextResponse.json({ error: 'speciesName is required' }, { status: 400 })
    }

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'AI not configured' }, { status: 500 })
    }

    const hasImage = imageBase64 && mimeType

    const promptText =
      `You are a helpful plant companion app. Given the species "${speciesName}", return a JSON object with:

1. "nicknames": 5 creative, fun, pet-like plant nicknames. Draw from the plant's appearance, personality, mythology, pop culture, or wordplay on the species name. Examples: "Professor Fern", "Sir Drips-a-Lot", "Spike Lee", "Lady Velvet", "The Godfather", "Duchess Ivy", "Señor Cactus".

2. "wateringDays": recommended watering interval in days (integer). Base this on well-known care requirements for the species. For example: succulents/cacti → 14–21, tropical aroids → 5–7, ferns → 4–5, pothos → 7–10, orchids → 7–10. Return null if you cannot determine a good interval.

3. "feedingDays": recommended fertilizing interval in days (integer). For example: succulents → 30–60, tropicals → 14–21, slow growers → 45–60. Return null if unsure.
` +
      (hasImage
        ? '\nA photo of the plant is included — factor in its visible size, pot, soil dryness, and general condition when suggesting intervals.\n'
        : '') +
      `
Return ONLY valid JSON with no explanation:
{
  "nicknames": ["Name1", "Name2", "Name3", "Name4", "Name5"],
  "wateringDays": 7,
  "feedingDays": 30
}`

    const content: MessageContent[] = hasImage
      ? [
          { type: 'image', source: { type: 'base64', media_type: mimeType!, data: imageBase64! } },
          { type: 'text', text: promptText },
        ]
      : [{ type: 'text', text: promptText }]

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 384,
        messages: [{ role: 'user', content }],
      }),
    })

    if (!res.ok) {
      const errText = await res.text()
      console.error('Anthropic error:', errText)
      return NextResponse.json({ error: 'AI request failed' }, { status: 500 })
    }

    const data = await res.json() as { content?: Array<{ text?: string }> }
    const text = data.content?.[0]?.text ?? ''

    // Extract the JSON object from the response
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) {
      return NextResponse.json({ error: 'Could not parse AI response' }, { status: 500 })
    }

    const parsed = JSON.parse(match[0]) as AiResponse
    const suggestions = Array.isArray(parsed.nicknames) ? parsed.nicknames : []
    const wateringDays = typeof parsed.wateringDays === 'number' ? parsed.wateringDays : null
    const feedingDays  = typeof parsed.feedingDays  === 'number' ? parsed.feedingDays  : null

    return NextResponse.json({ suggestions, wateringDays, feedingDays })
  } catch (err) {
    console.error('suggest-nickname error:', err)
    return NextResponse.json({ error: 'Failed to generate suggestions' }, { status: 500 })
  }
}
