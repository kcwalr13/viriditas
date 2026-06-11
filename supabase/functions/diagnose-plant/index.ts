// supabase/functions/diagnose-plant/index.ts
//
// Interactive diagnosis sessions (Phase 2 of docs/ASSISTANT-SPEC.md — the
// flagship). A bounded, multimodal diagnostic loop: the model examines the
// plant (photos + full history) and may ask up to THREE questions / photo
// requests before it must commit to a verdict. Honest uncertainty is required
// — at the cap, or with insufficient information, the verdict says so (Low
// confidence + differential + safe next step), never a bluff.
//
// Claude-only by design (no AI_PROVIDER branch) on claude-sonnet-4-6: the
// highest-stakes path at low volume (see the cost note in the spec).
//
// Request:  { sessionId?: uuid, plantId: uuid, userText?: string, photoPath?: string }
//   First call omits sessionId — opens the session with the owner's complaint
//   (or a general checkup) and optionally a fresh photo. Session photos are
//   uploaded by the client under {userId}/{plantId}/diagnosis/... and are NOT
//   in the photos table (keeps Timelapse / the photo strip clean).
//
// Response: { sessionId, askCount, reply, diagnosisId? }
//   `reply` is exactly one of:
//     { type: 'question',      text, options: string[]|null, why }
//     { type: 'photo_request', text, why }
//     { type: 'verdict',       title, confidence, reasoning[], next_steps[],
//                              differential|null, follow_up|null }
//
// Server-enforced rules: ask_count is tracked here (never trusted from the
// client); at MAX_ASK_TURNS the model is shown a verdict-only contract; all
// session/transcript writes happen with the service role, scoped to the
// authenticated user. On a verdict the function inserts the diagnoses row
// (verdict_id 'ai-session') so the existing history UI keeps working.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  buildContextSections,
  type PreviousAnalysis,
  type CareLogEntry,
  type PlantContext,
} from '../_shared/plant-context.ts'
import { fetchImageAsBase64, type ImageMediaType } from '../_shared/images.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const MODEL = 'claude-sonnet-4-6'  // decided 2026-06-10; upgrade path: Opus, one-line change
const MAX_ASK_TURNS = 3
const MAX_SESSION_IMAGES = 4       // most recent session photos sent to the model

// ── Session / reply shapes ───────────────────────────────────────────────────

type DiagnosisTurn = {
  role: 'user' | 'assistant'
  type: 'opening' | 'photo' | 'answer' | 'question' | 'photo_request' | 'verdict'
  text?: string
  photo_path?: string
  options?: string[] | null
  why?: string
  at: string
}

type DiagnosisVerdict = {
  title: string
  confidence: 'High' | 'Medium' | 'Low'
  reasoning: string[]
  next_steps: Array<{ label: string; immediate: boolean }>
  differential: string | null
  follow_up: { days: number; check: string } | null
}

type DiagnoseReply =
  | { type: 'question'; text: string; options: string[] | null; why: string }
  | { type: 'photo_request'; text: string; why: string }
  | ({ type: 'verdict' } & DiagnosisVerdict)

// ── Reply sanitizer ──────────────────────────────────────────────────────────
// Never trust model output shape. Returns null when the reply is unusable
// (caller retries once, then errors).

function sanitizeReply(raw: unknown): DiagnoseReply | null {
  if (typeof raw !== 'object' || raw === null) return null
  const e = raw as Record<string, unknown>

  if (e.type === 'question') {
    if (typeof e.text !== 'string' || !e.text.trim()) return null
    const options = Array.isArray(e.options)
      ? e.options.filter((o): o is string => typeof o === 'string' && o.trim().length > 0).slice(0, 6)
      : null
    return {
      type: 'question',
      text: e.text.trim(),
      options: options && options.length > 0 ? options : null,
      why: typeof e.why === 'string' ? e.why.trim() : '',
    }
  }

  if (e.type === 'photo_request') {
    if (typeof e.text !== 'string' || !e.text.trim()) return null
    return {
      type: 'photo_request',
      text: e.text.trim(),
      why: typeof e.why === 'string' ? e.why.trim() : '',
    }
  }

  if (e.type === 'verdict') {
    if (typeof e.title !== 'string' || !e.title.trim()) return null
    const confidence = e.confidence === 'High' || e.confidence === 'Medium' || e.confidence === 'Low'
      ? e.confidence
      : 'Low'  // unknown confidence is treated as the honest floor
    const reasoning = Array.isArray(e.reasoning)
      ? e.reasoning.filter((r): r is string => typeof r === 'string' && r.trim().length > 0).slice(0, 6)
      : []
    const nextSteps = Array.isArray(e.next_steps)
      ? e.next_steps.flatMap(s => {
          if (typeof s !== 'object' || s === null) return []
          const step = s as Record<string, unknown>
          if (typeof step.label !== 'string' || !step.label.trim()) return []
          return [{ label: step.label.trim(), immediate: step.immediate === true }]
        }).slice(0, 6)
      : []
    let followUp: DiagnosisVerdict['follow_up'] = null
    if (typeof e.follow_up === 'object' && e.follow_up !== null) {
      const f = e.follow_up as Record<string, unknown>
      if (typeof f.days === 'number' && Number.isFinite(f.days) && typeof f.check === 'string' && f.check.trim()) {
        followUp = { days: Math.min(30, Math.max(1, Math.round(f.days))), check: f.check.trim() }
      }
    }
    return {
      type: 'verdict',
      title: e.title.trim(),
      confidence,
      reasoning,
      next_steps: nextSteps,
      differential: typeof e.differential === 'string' && e.differential.trim() ? e.differential.trim() : null,
      follow_up: followUp,
    }
  }

  return null
}

// ── Prompt ───────────────────────────────────────────────────────────────────

function renderTranscript(turns: DiagnosisTurn[]): string {
  let photoNum = 0
  return turns.map(t => {
    switch (t.type) {
      case 'opening':       return `[owner, opening] ${t.text}`
      case 'answer':        return `[owner, answer] ${t.text}`
      case 'photo':         { photoNum++; return `[owner, photo] Provided photo ${photoNum} (attached below in order).` }
      case 'question':      return `[you, question] ${t.text}${t.options?.length ? ` (options offered: ${t.options.join(' / ')})` : ''}`
      case 'photo_request': return `[you, photo request] ${t.text}`
      case 'verdict':       return `[you, verdict] ${t.text}`
    }
  }).join('\n')
}

const VERDICT_SHAPE = `{"type":"verdict","title":"Short diagnosis title","confidence":"High"|"Medium"|"Low","reasoning":["2-4 short entries tying the verdict to specific evidence — photo details, history, species disease signatures"],"next_steps":[{"label":"Concrete step","immediate":true|false}],"differential":"If X doesn't improve within a week, the alternative explanation is Y"|null,"follow_up":{"days":4,"check":"One specific observable to re-check, phrased as a yes/no question"}|null}`

function buildDiagnosisPrompt(
  contextBlock: string,
  priorDiagnosesSection: string,
  transcript: string,
  askCount: number,
  forceVerdict: boolean
): string {
  const header = `You are an expert botanist conducting a diagnostic examination of a houseplant for its owner. Examine the evidence (photos, history, the owner's answers), and either ask for exactly the information that would change your diagnosis, or deliver a verdict.
${contextBlock}${priorDiagnosesSection}

Examination transcript so far:
${transcript}`

  if (forceVerdict) {
    return `${header}

You have used all ${MAX_ASK_TURNS} of your ask-turns. You MUST deliver a verdict now — asking anything further is not permitted.
If the information is still insufficient, say so honestly: use "Low" confidence, name the most likely explanation in "title", include a "differential" for the leading alternative, and make every next step SAFE — steps that help in either case and cannot make things worse. Never bluff certainty you don't have.

Respond with EXACTLY this JSON shape and nothing else:
${VERDICT_SHAPE}`
  }

  return `${header}

You have used ${askCount} of ${MAX_ASK_TURNS} ask-turns (questions or photo requests). When they run out, you must deliver a verdict.

Respond with EXACTLY ONE JSON object — one of these three shapes:
1. Ask the owner a question (spends an ask-turn):
{"type":"question","text":"The question","options":["short answer choices the owner can tap","..."]|null,"why":"One sentence: what this distinguishes"}
2. Request a specific photo (spends an ask-turn):
{"type":"photo_request","text":"What to photograph and how (angle, distance, what to include)","why":"What you are checking for and why the existing photos can't show it"}
3. Deliver the verdict:
${VERDICT_SHAPE}

Rules:
- Ask ONLY when the answer would genuinely change your diagnosis or treatment. If the case is already clear from the evidence, deliver the verdict immediately — padding questions waste the owner's time.
- One question at a time; make options short and mutually exclusive when you offer them.
- Photo requests must be specific enough to follow (e.g. "close-up of the underside of an affected leaf"), not "another photo".
- Never bluff. If the information remains insufficient, deliver an honest Low-confidence verdict with a differential and SAFE next steps — never fabricated certainty.
- "next_steps": 2-5 concrete steps for THIS plant, immediate=true only for do-today steps.
- "follow_up": include it when re-checking later matters for confirming the diagnosis or catching the differential; days between 2 and 14.
- Only the JSON object. No extra text.`
}

// ── Claude ───────────────────────────────────────────────────────────────────

type ImageBlock = { type: 'image'; source: { type: 'base64'; media_type: ImageMediaType; data: string } }

async function callClaude(images: ImageBlock[], prompt: string): Promise<string> {
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
      model: MODEL,
      max_tokens: 1536,
      messages: [{
        role: 'user',
        content: [...images, { type: 'text', text: prompt }],
      }],
    }),
  })

  const data = await response.json()
  if (!response.ok) throw new Error(data.error?.message ?? 'Claude API error')
  let text: string = data.content[0].text
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  return text
}

// ── Main handler ─────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const jsonError = (message: string, status: number) =>
    new Response(JSON.stringify({ error: message }), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  try {
    // Verify the caller is a signed-in user (deployed with --no-verify-jwt,
    // so the function validates the token itself — the v1.5.0 pattern).
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return jsonError('Unauthorized', 401)

    const authClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) return jsonError('Unauthorized', 401)

    const { sessionId = null, plantId, userText = null, photoPath = null } = await req.json()
    if (!plantId || typeof plantId !== 'string') return jsonError('plantId is required', 400)
    if (sessionId !== null && typeof sessionId !== 'string') return jsonError('sessionId must be a uuid', 400)
    if (sessionId && !userText && !photoPath) {
      return jsonError('Continuing a session requires userText or photoPath', 400)
    }

    // Service-role client: transcript and ask_count integrity stay out of
    // client hands. Every query below is still scoped to the verified user.
    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Ownership check — the plant must belong to the authenticated user.
    const { data: plant } = await admin
      .from('plants').select('*')
      .eq('id', plantId).eq('user_id', user.id)
      .single()
    if (!plant) return jsonError('Plant not found', 404)

    // Path guard (the analyze-plant SSRF guard, adapted to storage paths):
    // session photos may only come from this user's diagnosis folder for
    // this plant — no traversal, no other users' photos, no external URLs.
    if (photoPath !== null) {
      const allowedPrefix = `${user.id}/${plantId}/diagnosis/`
      if (
        typeof photoPath !== 'string' ||
        !photoPath.startsWith(allowedPrefix) ||
        photoPath.includes('..') ||
        photoPath.includes('://')
      ) {
        return jsonError('photoPath must be a session photo under your diagnosis folder', 400)
      }
    }

    // ── Load or open the session ─────────────────────────────────────────
    let session: {
      id: string
      turns: DiagnosisTurn[]
      ask_count: number
      status: string
    }
    if (sessionId) {
      const { data } = await admin
        .from('diagnosis_sessions').select('*')
        .eq('id', sessionId).eq('user_id', user.id).eq('plant_id', plantId)
        .single()
      if (!data) return jsonError('Session not found', 404)
      if (data.status !== 'active') return jsonError('Session is already concluded', 400)
      session = { id: data.id, turns: (data.turns ?? []) as DiagnosisTurn[], ask_count: data.ask_count ?? 0, status: data.status }
    } else {
      const { data, error } = await admin
        .from('diagnosis_sessions')
        .insert({ plant_id: plantId, user_id: user.id })
        .select()
        .single()
      if (error || !data) {
        // Most likely cause: the Phase 2 migration hasn't been run.
        return jsonError('Could not open a diagnosis session — has the diagnosis_sessions migration been run?', 500)
      }
      session = { id: data.id, turns: [], ask_count: 0, status: 'active' }
    }

    // ── Append the owner's turn(s) ───────────────────────────────────────
    const turns: DiagnosisTurn[] = [...session.turns]
    const nowIso = new Date().toISOString()
    if (turns.length === 0) {
      turns.push({
        role: 'user',
        type: 'opening',
        text: typeof userText === 'string' && userText.trim()
          ? userText.trim()
          : 'General checkup — please assess this plant.',
        at: nowIso,
      })
    } else if (typeof userText === 'string' && userText.trim()) {
      turns.push({ role: 'user', type: 'answer', text: userText.trim(), at: nowIso })
    }
    if (photoPath) {
      turns.push({ role: 'user', type: 'photo', photo_path: photoPath, at: nowIso })
    }

    // ── Assemble context server-side (the request carries none) ──────────
    const [{ data: analyses }, { data: careLogs }, { data: priorDiagnoses }] = await Promise.all([
      admin.from('analysis_results').select('*')
        .eq('plant_id', plantId).order('created_at', { ascending: false }).limit(3),
      admin.from('care_logs').select('*')
        .eq('plant_id', plantId).order('logged_at', { ascending: false }).limit(10),
      admin.from('diagnoses').select('verdict_title, confidence, created_at')
        .eq('plant_id', plantId).order('created_at', { ascending: false }).limit(3),
    ])

    const speciesName: string | null =
      plant.species || (analyses ?? []).find(a => a.species)?.species || null
    let speciesProfile = null
    if (speciesName) {
      const { data } = await admin
        .from('species_profiles').select('*')
        .eq('species_name', speciesName)
        .single()
      speciesProfile = data
    }

    const previousAnalyses: PreviousAnalysis[] = (analyses ?? []).map(a => ({
      date: new Date(a.created_at).toLocaleDateString('en-US'),
      species: a.species,
      health: a.health,
      health_score: a.health_score,
      care: a.care,
    }))
    const recentCareLogs: CareLogEntry[] = (careLogs ?? []).map(l => ({
      type: l.type,
      notes: l.notes,
      date: new Date(l.logged_at).toLocaleDateString('en-US'),
      category: l.category,
      measurement_value: l.measurement_value,
      measurement_unit: l.measurement_unit,
    }))
    const plantContext: PlantContext = {
      location: plant.location,
      pot_size: plant.pot_size,
      soil_type: plant.soil_type,
      plant_notes: plant.notes,
      pest_notes: plant.pest_notes,
      last_treatment_date: plant.last_treatment_date,
      watering_interval_days: plant.watering_interval_days ?? null,
      fertilizing_interval_days: plant.fertilizing_interval_days ?? null,
    }
    const now = new Date()
    const contextBlock = buildContextSections(
      previousAnalyses,
      recentCareLogs,
      speciesProfile,
      plantContext,
      { month: now.getMonth() + 1, hemisphere: 'northern' },
      speciesName ? { verified: !!(plant.species && plant.is_name_verified) } : null
    )
    const priorDiagnosesSection = (priorDiagnoses ?? []).length > 0
      ? `\nPrevious diagnoses for this plant (most recent first):\n${(priorDiagnoses ?? [])
          .map(d => `[${new Date(d.created_at).toLocaleDateString('en-US')}] ${d.verdict_title} (${d.confidence} confidence)`)
          .join('\n')}`
      : ''

    // ── Fetch session photos (most recent MAX_SESSION_IMAGES, in order) ──
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const photoTurns = turns.filter(t => t.type === 'photo' && t.photo_path)
    const photoPaths = photoTurns.slice(-MAX_SESSION_IMAGES).map(t => t.photo_path as string)
    const images: ImageBlock[] = []
    for (const path of photoPaths) {
      const url = `${supabaseUrl}/storage/v1/object/public/plant-photos/${path}`
      const { base64, mediaType } = await fetchImageAsBase64(url)
      images.push({ type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } })
    }

    // ── Ask the model (retry once on malformed / cap-violating output) ───
    const askCount = session.ask_count
    const atCap = askCount >= MAX_ASK_TURNS
    const transcript = renderTranscript(turns)

    let reply: DiagnoseReply | null = null
    for (let attempt = 0; attempt < 2 && !reply; attempt++) {
      // First attempt: normal contract (verdict-only when at the cap).
      // Retry: always verdict-only — the safest recovery from a bad reply.
      const forceVerdict = atCap || attempt > 0
      const prompt = buildDiagnosisPrompt(contextBlock, priorDiagnosesSection, transcript, askCount, forceVerdict)
      try {
        const raw = JSON.parse(await callClaude(images, prompt))
        const candidate = sanitizeReply(raw)
        // The cap is enforced here too, not just in the prompt: an ask-type
        // reply at the cap is discarded and the model is re-asked for a verdict.
        if (candidate && (!forceVerdict || candidate.type === 'verdict')) reply = candidate
      } catch (err) {
        console.error(`diagnose-plant model attempt ${attempt + 1} failed:`, err)
      }
    }
    if (!reply) return jsonError('The examination service returned an unusable reply. Please try again.', 500)

    // ── Persist + respond ────────────────────────────────────────────────
    const replyAt = new Date().toISOString()

    if (reply.type === 'verdict') {
      turns.push({ role: 'assistant', type: 'verdict', text: reply.title, at: replyAt })

      // Write history into the existing diagnoses table so the current
      // history UI keeps working unchanged (spec 2.3). question_path holds
      // a compact transcript summary.
      const compactTranscript = turns.map(t => ({
        role: t.role,
        type: t.type,
        text: t.text ? t.text.slice(0, 300) : undefined,
        photo: t.photo_path ? true : undefined,
      }))
      const verdictBody: DiagnosisVerdict = {
        title: reply.title,
        confidence: reply.confidence,
        reasoning: reply.reasoning,
        next_steps: reply.next_steps,
        differential: reply.differential,
        follow_up: reply.follow_up,
      }
      const { data: diagnosisRow, error: diagError } = await admin
        .from('diagnoses')
        .insert({
          plant_id: plantId,
          user_id: user.id,
          question_path: compactTranscript,
          verdict_id: 'ai-session',
          verdict_title: reply.title,
          confidence: reply.confidence,
          reasoning: reply.reasoning,
          next_steps: reply.next_steps,
        })
        .select('id')
        .single()
      if (diagError) console.error('diagnose-plant: diagnoses insert failed:', diagError.message)

      await admin
        .from('diagnosis_sessions')
        .update({
          turns,
          status: 'concluded',
          concluded_at: replyAt,
          verdict: verdictBody,
          diagnosis_id: diagnosisRow?.id ?? null,
        })
        .eq('id', session.id)

      return new Response(
        JSON.stringify({ sessionId: session.id, askCount, reply, diagnosisId: diagnosisRow?.id ?? null }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Question or photo request — spends an ask-turn.
    turns.push({
      role: 'assistant',
      type: reply.type,
      text: reply.text,
      options: reply.type === 'question' ? reply.options : null,
      why: reply.why,
      at: replyAt,
    })
    const newAskCount = askCount + 1
    const { error: updateError } = await admin
      .from('diagnosis_sessions')
      .update({ turns, ask_count: newAskCount })
      .eq('id', session.id)
    if (updateError) {
      // The reply must not be returned if it wasn't persisted — otherwise the
      // transcript desyncs and ask_count never increments (cap bypass).
      console.error('diagnose-plant: session update failed:', updateError.message)
      return jsonError('Could not save the examination turn. Please try again.', 500)
    }

    return new Response(
      JSON.stringify({ sessionId: session.id, askCount: newAskCount, reply }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('diagnose-plant error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
