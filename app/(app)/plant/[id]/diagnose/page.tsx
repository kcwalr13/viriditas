'use client'
// app/(app)/plant/[id]/diagnose/page.tsx
// Diagnose — two paths to a verdict (Phase 2 of docs/ASSISTANT-SPEC.md):
//
//   1. "Examine with AI" (primary) — a bounded, multimodal diagnostic session
//      backed by the diagnose-plant Edge Function. The AI sees the plant's
//      full history + session photos, may ask up to 3 questions / photo
//      requests, then must deliver a verdict. Verdicts write to `diagnoses`
//      (server-side) and their next steps land as care_recommendations
//      proposals on Today (inserted here, client-side).
//
//   2. "Quick triage" — the original static question tree (11 verdicts, no
//      AI call). Kept as instant, offline-friendly guidance.
//
// Session photos upload under {userId}/{plantId}/diagnosis/{folder}/ and are
// deliberately NOT inserted into the photos table — Timelapse and the Plant
// Detail photo strip read that table and must stay clean of diagnostic shots.
//
// Abandon semantics: navigating away leaves the session `active`; reopening
// this screen offers "Resume examination" while the session is <24h old,
// after which it's marked `abandoned` and a fresh start is offered.

import { createClient } from '@/lib/supabase/client'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useState, useCallback, useRef } from 'react'
import { BigTitle, Chip, HairlineButton } from '@/components/ui'
import { Icon } from '@/components/Icon'
import { PlantPhoto } from '@/components/PlantPhoto'
import { formatTimestamp, toLocalDateStr } from '@/lib/utils'
import type {
  Plant, DiagnosisSession, DiagnosisTurn, DiagnosisVerdict, DiagnoseReply,
} from '@/lib/types'

// sessionStorage key written by /camera's Diagnose mode (v1.10.0): a
// pre-uploaded opening photo as { plantId, photoPath }. Consumed (and removed)
// once on load. Must match the constant in app/(app)/camera/page.tsx.
const CAMERA_DIAGNOSE_HANDOFF_KEY = 'viriditas.cameraDiagnoseHandoff'

// ── Static question tree (Quick triage) ───────────────────────────────────

interface Option {
  id: string
  label: string
  next?: string      // key into FLOW (continues the question chain)
  verdict?: string   // key into VERDICTS (ends the chain)
}

interface Question {
  question: string
  hint?: string
  options: Option[]
}

interface Verdict {
  title: string
  confidence: 'Low' | 'Medium' | 'High'
  reasoning: string[]
  nextSteps: { label: string; immediate: boolean }[]
}

// Each key is a step id. 'intro' is the starting question.
const FLOW: Record<string, Question> = {
  intro: {
    question: 'What seems off?',
    hint: 'Be as specific as you can — the more precise your answer, the better the verdict.',
    options: [
      { id: 'leaves', label: 'Leaves are changing color or texture', next: 'q_leaves' },
      { id: 'wilting', label: 'Plant is drooping or collapsing', next: 'q_wilt' },
      { id: 'growth', label: 'Growth has slowed or stopped', next: 'q_growth' },
      { id: 'pests',  label: 'I can see bugs, webbing, or white residue', verdict: 'pests' },
      { id: 'soil',   label: 'The soil or roots look wrong', next: 'q_soil' },
    ],
  },
  q_leaves: {
    question: 'Which describes the leaves best?',
    options: [
      { id: 'yellow',  label: 'Yellowing — especially older, lower leaves', next: 'q_yellow_detail' },
      { id: 'brown',   label: 'Brown tips or crispy edges', verdict: 'low_humidity' },
      { id: 'pale',    label: 'Overall pallor — washed-out green', verdict: 'low_light' },
      { id: 'spots',   label: 'Spots — dark, light, or with a halo', verdict: 'leaf_disease' },
      { id: 'drooping',label: 'Leaves feel soft or limp', next: 'q_wilt' },
    ],
  },
  q_yellow_detail: {
    question: 'Where is the yellowing concentrated?',
    options: [
      { id: 'lower',   label: 'Older / lower leaves first', verdict: 'overwatering' },
      { id: 'all',     label: 'Spread evenly across the whole plant', verdict: 'underfeeding' },
      { id: 'new',     label: 'New growth only, with green veins still visible', verdict: 'iron_deficiency' },
    ],
  },
  q_wilt: {
    question: 'What does the soil feel like?',
    hint: 'Poke a finger 2cm into the soil.',
    options: [
      { id: 'dry',   label: 'Dry — pulling away from the pot edges', verdict: 'underwatering' },
      { id: 'wet',   label: 'Wet or soggy — has been for a while', verdict: 'overwatering' },
      { id: 'fine',  label: 'Moisture seems fine', verdict: 'root_bound' },
    ],
  },
  q_growth: {
    question: 'Any other symptoms alongside the slow growth?',
    options: [
      { id: 'pale',    label: 'Stems are stretching toward the light', verdict: 'low_light' },
      { id: 'healthy', label: 'Plant otherwise looks healthy — just stalled', verdict: 'root_bound' },
      { id: 'leaves',  label: 'Leaves are also yellowing or dropping', next: 'q_yellow_detail' },
    ],
  },
  q_soil: {
    question: 'What are you noticing about the soil or roots?',
    options: [
      { id: 'soggy',   label: 'Consistently wet, won\'t dry out', verdict: 'overwatering' },
      { id: 'roots',   label: 'Roots coming out of drainage holes or circling', verdict: 'root_bound' },
      { id: 'surface', label: 'White crust on soil surface', verdict: 'mineral_buildup' },
      { id: 'gnats',   label: 'Fungus gnats flying around the soil', verdict: 'fungus_gnats' },
    ],
  },
}

const VERDICTS: Record<string, Verdict> = {
  overwatering: {
    title: 'Signs point to overwatering',
    confidence: 'High',
    reasoning: [
      'Yellowing starting from older leaves is a classic sign — nitrogen is being displaced by waterlogged soil.',
      'Roots sitting in wet soil starve of oxygen, which breaks down their ability to take up nutrients.',
      'If the stem base feels soft or smells off, root rot may already have started.',
    ],
    nextSteps: [
      { label: 'Let the soil dry out completely before watering again.', immediate: true },
      { label: 'Check drainage holes — ensure water flows freely out the bottom.', immediate: true },
      { label: 'Lift the pot — if it feels very heavy, the soil is still waterlogged.', immediate: false },
      { label: 'If the stem base is mushy, unpot and trim any black/brown roots.', immediate: false },
    ],
  },
  underwatering: {
    title: 'Your plant is thirsty',
    confidence: 'High',
    reasoning: [
      'Dry soil combined with wilting or drooping leaves is the clearest sign of underwatering.',
      'Leaves lose turgidity (firmness) when the plant can\'t draw water up from the roots.',
      'Many plants recover within hours of a thorough watering — don\'t rush to write them off.',
    ],
    nextSteps: [
      { label: 'Water thoroughly until it flows out the drainage holes.', immediate: true },
      { label: 'Let the plant recover in place — avoid moving it while stressed.', immediate: true },
      { label: 'Set a watering reminder if you haven\'t already.', immediate: false },
    ],
  },
  low_humidity: {
    title: 'Humidity may be too low',
    confidence: 'Medium',
    reasoning: [
      'Brown leaf tips that are crispy and dry — without yellowing — are a humidity signature.',
      'Central heating and air conditioning drastically reduce indoor humidity levels.',
      'Tropical plants in particular evolved in 60–80% humidity and struggle below 40%.',
    ],
    nextSteps: [
      { label: 'Group plants together — they create a local humidity microclimate.', immediate: true },
      { label: 'Place a tray of water and pebbles beneath the pot.', immediate: false },
      { label: 'Consider a small humidifier near the plant cluster.', immediate: false },
      { label: 'Avoid misting directly onto leaves — it rarely raises ambient humidity meaningfully.', immediate: false },
    ],
  },
  pests: {
    title: 'Signs of a pest infestation',
    confidence: 'Medium',
    reasoning: [
      'Visible bugs, webbing, or white fluffy residue are direct evidence of an infestation.',
      'Common culprits: spider mites (fine webbing under leaves), mealybugs (white cottony clusters), or scale (brown bumps on stems).',
      'Early intervention prevents spread to neighboring plants.',
    ],
    nextSteps: [
      { label: 'Isolate the plant immediately — move it away from others.', immediate: true },
      { label: 'Wipe down all leaves — top and underside — with a damp cloth.', immediate: true },
      { label: 'Apply neem oil or insecticidal soap to affected areas.', immediate: false },
      { label: 'Check neighboring plants within the next 48 hours.', immediate: false },
      { label: 'Repeat treatment weekly for 3 weeks minimum.', immediate: false },
    ],
  },
  low_light: {
    title: 'Insufficient light',
    confidence: 'Medium',
    reasoning: [
      'Pale, washed-out leaves or stems stretching toward the nearest light source suggest the plant is light-starved.',
      'Etiolation (long, weak stems reaching for light) is the plant\'s way of searching for more energy.',
      'Many indoor spaces provide far less light than plants evolved to receive — even near a window.',
    ],
    nextSteps: [
      { label: 'Move the plant closer to a bright window — within 1m is ideal for most tropicals.', immediate: true },
      { label: 'Avoid direct midday sun if moving to a south-facing window.', immediate: false },
      { label: 'A grow light on a timer is a reliable solution in darker spaces.', immediate: false },
    ],
  },
  root_bound: {
    title: 'May be root-bound',
    confidence: 'Medium',
    reasoning: [
      'A plant that\'s stalled despite good care often has outgrown its container.',
      'Roots circling the inside of the pot or emerging from drainage holes confirm it.',
      'When roots pack too tightly, they can\'t absorb water or nutrients efficiently even if conditions are otherwise good.',
    ],
    nextSteps: [
      { label: 'Gently unpot the plant to inspect the root ball.', immediate: false },
      { label: 'If roots are tightly bound, repot into a container 2–3cm wider.', immediate: false },
      { label: 'Use fresh potting mix — the old soil may also be depleted.', immediate: false },
    ],
  },
  underfeeding: {
    title: 'Plant may need feeding',
    confidence: 'Medium',
    reasoning: [
      'General yellowing spread across the whole plant — rather than just lower leaves — often points to nitrogen deficiency.',
      'Potting mix exhausts its nutrients within 6–12 months; after that, regular feeding is essential.',
      'Fast-growing plants deplete nutrients more quickly.',
    ],
    nextSteps: [
      { label: 'Begin a regular feeding schedule during the growing season (spring–summer).', immediate: true },
      { label: 'Use a balanced liquid fertilizer at half the recommended dose.', immediate: false },
      { label: 'Avoid fertilizing in winter — most plants rest and can\'t absorb the excess.', immediate: false },
    ],
  },
  iron_deficiency: {
    title: 'Possible iron or micronutrient deficiency',
    confidence: 'Low',
    reasoning: [
      'Yellowing between leaf veins on new growth (while veins stay green) is interveinal chlorosis — a classic iron deficiency sign.',
      'This can be caused by actual low iron, or by overly alkaline soil that locks iron out of reach.',
      'High pH in tap water can gradually alkalinize the soil and trigger this even if nutrients are present.',
    ],
    nextSteps: [
      { label: 'Try watering with collected rainwater or distilled water for 2–3 cycles.', immediate: false },
      { label: 'Apply a chelated iron supplement or a fertilizer with micronutrients.', immediate: false },
      { label: 'Check if your tap water is very hard — this can be a persistent cause.', immediate: false },
    ],
  },
  leaf_disease: {
    title: 'Possible leaf disease or fungal infection',
    confidence: 'Low',
    reasoning: [
      'Spots with defined edges, rings, or halos often point to a fungal or bacterial issue rather than a nutrient problem.',
      'Overhead watering that leaves leaves wet overnight is a common trigger.',
      'Some spots are cosmetic (e.g. sunburn, mineral deposits) and not infectious.',
    ],
    nextSteps: [
      { label: 'Remove visibly affected leaves and dispose of them away from other plants.', immediate: true },
      { label: 'Water at the base — never splash water onto leaves.', immediate: true },
      { label: 'Improve air circulation around the plant.', immediate: false },
      { label: 'Apply a copper-based fungicide if spots are spreading.', immediate: false },
    ],
  },
  mineral_buildup: {
    title: 'Mineral salt buildup in the soil',
    confidence: 'High',
    reasoning: [
      'White crust on the soil surface or pot rim is mineral salt accumulation from tap water and fertilizer.',
      'Heavy buildup raises soil salinity, which can stress roots and slow uptake of water and nutrients.',
      'A quick flush is usually all that\'s needed.',
    ],
    nextSteps: [
      { label: 'Flush the pot with plain water until it runs clear through the drainage holes.', immediate: true },
      { label: 'Scrape off the crusty layer and top-dress with fresh potting mix.', immediate: false },
      { label: 'Switch to filtered or rainwater if your tap water is very hard.', immediate: false },
    ],
  },
  fungus_gnats: {
    title: 'Fungus gnats in the soil',
    confidence: 'High',
    reasoning: [
      'Tiny flies hovering around the soil are almost certainly fungus gnats — their larvae live in moist topsoil and feed on organic matter and fine roots.',
      'They thrive in consistently moist, organic-rich soil.',
      'The adults are mostly harmless but larvae can damage seedlings and stressed plants.',
    ],
    nextSteps: [
      { label: 'Allow the top 3–5cm of soil to dry out completely between waterings.', immediate: true },
      { label: 'Place yellow sticky traps to catch adults and reduce the population.', immediate: true },
      { label: 'Top-dress with a thin layer of coarse sand or grit to deter egg-laying.', immediate: false },
      { label: 'For serious infestations, drench soil with diluted hydrogen peroxide (1:4 with water).', immediate: false },
    ],
  },
}

// ── Component ─────────────────────────────────────────────────────────────

interface PathEntry { questionId: string; answerId: string; answerLabel: string }

type Mode = 'home' | 'triage' | 'session'

type HistoryEntry = {
  id: string
  created_at: string
  verdict_title: string
  confidence: string
  verdict_id: string
}

const SESSION_RESUME_WINDOW_MS = 24 * 60 * 60 * 1000  // active sessions older than this are abandoned

export default function DiagnosePage() {
  const params   = useParams<{ id: string }>()
  const router   = useRouter()
  const supabase = createClient()
  const id       = params.id

  const [plant,   setPlant]   = useState<Plant | null>(null)
  const [loading, setLoading] = useState(true)
  const [mode,    setMode]    = useState<Mode>('home')

  // ── Quick triage state (the original static flow) ──────────────────────
  const [step,       setStep]       = useState<string>('intro')
  const [path,       setPath]       = useState<PathEntry[]>([])
  const [verdictKey, setVerdictKey] = useState<string | null>(null)
  const [nextDone,   setNextDone]   = useState<Record<number, boolean>>({})
  const [saved,      setSaved]      = useState(false)

  // ── AI examination state ────────────────────────────────────────────────
  const [sessionId,    setSessionId]    = useState<string | null>(null)
  const [turns,        setTurns]        = useState<DiagnosisTurn[]>([])
  const [askCount,     setAskCount]     = useState(0)
  const [examining,    setExamining]    = useState(false)   // request in flight
  const [sessionError, setSessionError] = useState<string | null>(null)
  const [aiVerdict,    setAiVerdict]    = useState<DiagnosisVerdict | null>(null)
  const [aiNextDone,   setAiNextDone]   = useState<Record<number, boolean>>({})
  const [recsSaved,    setRecsSaved]    = useState(false)   // verdict next steps persisted to care_recommendations
  const [resumable,    setResumable]    = useState<DiagnosisSession | null>(null)
  const [history,      setHistory]      = useState<HistoryEntry[]>([])

  // Opening composer
  const [showComposer,   setShowComposer]   = useState(false)
  const [openingText,    setOpeningText]    = useState('')
  const [openingPhoto,   setOpeningPhoto]   = useState<File | null>(null)
  const [openingPreview, setOpeningPreview] = useState<string | null>(null)

  // Mid-session free-text answer
  const [answerText, setAnswerText] = useState('')

  // Upload folder for the opening photo: the server session doesn't exist
  // yet on the first call, so the client groups uploads under its own uuid.
  // Once the server returns a sessionId, new uploads use that instead.
  const uploadFolderRef  = useRef<string | null>(null)
  const openingInputRef  = useRef<HTMLInputElement>(null)
  const sessionInputRef  = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    const { data } = await supabase.from('plants').select('*').eq('id', id).single()
    setPlant(data as Plant | null)

    // Active sessions: stale ones (>24h) are abandoned; the freshest recent
    // one is offered for resume. Soft-fails if the migration hasn't been run.
    const { data: actives, error: sessErr } = await supabase
      .from('diagnosis_sessions')
      .select('*')
      .eq('plant_id', id)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
    if (!sessErr && actives) {
      const cutoff = Date.now() - SESSION_RESUME_WINDOW_MS
      // Not worth resuming: older than the window, OR empty (a session row
      // whose opening call failed before any turn persisted — resuming an
      // empty transcript would be a dead end).
      const stale = actives.filter(s =>
        new Date(s.created_at).getTime() < cutoff || (s.turns ?? []).length === 0)
      const fresh = actives.filter(s =>
        new Date(s.created_at).getTime() >= cutoff && (s.turns ?? []).length > 0)
      if (stale.length > 0) {
        await supabase.from('diagnosis_sessions')
          .update({ status: 'abandoned' })
          .in('id', stale.map(s => s.id))
      }
      setResumable((fresh[0] as DiagnosisSession | undefined) ?? null)
    }

    // Past examinations (both AI sessions and quick-triage runs).
    const { data: past } = await supabase
      .from('diagnoses')
      .select('id, created_at, verdict_title, confidence, verdict_id')
      .eq('plant_id', id)
      .order('created_at', { ascending: false })
      .limit(10)
    if (past) setHistory(past as HistoryEntry[])

    setLoading(false)
  }, [supabase, id])

  useEffect(() => { load() }, [load])

  // Camera handoff (v1.10.0): /camera's Diagnose mode uploads an opening photo
  // under the session-photo path convention, stashes { plantId, photoPath } in
  // sessionStorage, and routes here. Consume it once, after load() has settled
  // (so stale active sessions are already abandoned and any resumable one is
  // known), and open a fresh examination with that photo as the opening turn.
  const handoffConsumedRef = useRef(false)
  useEffect(() => {
    if (loading || handoffConsumedRef.current) return
    const raw = sessionStorage.getItem(CAMERA_DIAGNOSE_HANDOFF_KEY)
    if (!raw) return
    handoffConsumedRef.current = true
    sessionStorage.removeItem(CAMERA_DIAGNOSE_HANDOFF_KEY)
    try {
      const handoff = JSON.parse(raw) as { plantId?: string; photoPath?: string }
      if (handoff.plantId !== id || !handoff.photoPath) return
      // The user just chose to examine a fresh photo — same intent as
      // "Start fresh", so an existing resumable session is abandoned.
      if (resumable) {
        void supabase.from('diagnosis_sessions')
          .update({ status: 'abandoned' })
          .eq('id', resumable.id)
        setResumable(null)
      }
      resetSessionState()
      setMode('session')
      void sendTurn(null, null, { fresh: true, photoPath: handoff.photoPath })
    } catch {
      // Malformed handoff — ignore; the normal Diagnose home renders.
    }
  }, [loading]) // eslint-disable-line react-hooks/exhaustive-deps

  function getPhotoUrl(path: string): string {
    return supabase.storage.from('plant-photos').getPublicUrl(path).data.publicUrl
  }

  // ── AI examination flow ─────────────────────────────────────────────────

  async function uploadSessionPhoto(file: File, forSessionId: string | null): Promise<string | null> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null
    if (!uploadFolderRef.current) uploadFolderRef.current = crypto.randomUUID()
    const folder = forSessionId ?? uploadFolderRef.current
    const ext = file.type === 'image/webp' ? 'webp'
              : file.type === 'image/png'  ? 'png'
              : file.type === 'image/gif'  ? 'gif'
              : 'jpg'
    const path = `${user.id}/${id}/diagnosis/${folder}/${Date.now()}.${ext}`
    const buffer = await file.arrayBuffer()
    const { error } = await supabase.storage
      .from('plant-photos').upload(path, buffer, { contentType: file.type })
    return error ? null : path
  }

  // Sends one owner turn (text and/or photo) to diagnose-plant and appends
  // the assistant's reply. On failure the optimistic turns roll back so a
  // retry doesn't duplicate anything (the server only persists turns
  // alongside a successful reply). `fresh: true` forces a brand-new session
  // regardless of lingering state — beginExamination uses it because React
  // state resets in the same tick wouldn't be visible to this closure yet.
  async function sendTurn(
    text: string | null,
    photo: File | null,
    opts?: { fresh?: boolean; photoPath?: string }
  ) {
    if (examining) return
    const activeSessionId = opts?.fresh ? null : sessionId
    const baseTurns: DiagnosisTurn[] = opts?.fresh ? [] : turns
    setExamining(true)
    setSessionError(null)
    const prevTurns = baseTurns
    try {
      // opts.photoPath = a photo already in storage under the session-photo
      // convention (the /camera Diagnose handoff) — skip the upload.
      let photoPath: string | null = opts?.photoPath ?? null
      if (!photoPath && photo) {
        photoPath = await uploadSessionPhoto(photo, activeSessionId)
        if (!photoPath) throw new Error('Photo upload failed — please try again.')
      }

      const { data: { session: authSession } } = await supabase.auth.getSession()
      if (!authSession) throw new Error('Not logged in')

      // Optimistic transcript append — mirrors what the server will store.
      const nowIso = new Date().toISOString()
      const newTurns: DiagnosisTurn[] = [...baseTurns]
      if (baseTurns.length === 0) {
        newTurns.push({
          role: 'user', type: 'opening',
          text: text?.trim() || 'General checkup — please assess this plant.',
          at: nowIso,
        })
      } else if (text?.trim()) {
        newTurns.push({ role: 'user', type: 'answer', text: text.trim(), at: nowIso })
      }
      if (photoPath) newTurns.push({ role: 'user', type: 'photo', photo_path: photoPath, at: nowIso })
      setTurns(newTurns)

      const { data, error: fnError } = await supabase.functions.invoke('diagnose-plant', {
        body: { sessionId: activeSessionId, plantId: id, userText: text?.trim() || null, photoPath },
        headers: { Authorization: `Bearer ${authSession.access_token}` },
      })
      if (fnError) {
        // supabase-js wraps non-2xx responses in a generic FunctionsHttpError;
        // read the body so the server's actual message (e.g. the migration
        // hint, "Session is already concluded") reaches the user.
        let message = fnError.message || 'Examination failed'
        const ctx = (fnError as { context?: Response }).context
        if (ctx && typeof ctx.json === 'function') {
          try {
            const body = await ctx.json()
            if (body?.error) message = body.error
          } catch { /* keep the generic message */ }
        }
        throw new Error(message)
      }
      if (data?.error) throw new Error(data.error)
      if (!data?.reply || !data?.sessionId) throw new Error('Unexpected response from the examination service.')

      setSessionId(data.sessionId)
      setAskCount(typeof data.askCount === 'number' ? data.askCount : 0)

      const reply: DiagnoseReply = data.reply
      const assistantTurn: DiagnosisTurn = reply.type === 'verdict'
        ? { role: 'assistant', type: 'verdict', text: reply.title, at: new Date().toISOString() }
        : {
            role: 'assistant', type: reply.type, text: reply.text,
            options: reply.type === 'question' ? reply.options : null,
            why: reply.why, at: new Date().toISOString(),
          }
      setTurns([...newTurns, assistantTurn])

      if (reply.type === 'verdict') {
        const verdictBody: DiagnosisVerdict = {
          title: reply.title,
          confidence: reply.confidence,
          reasoning: reply.reasoning,
          next_steps: reply.next_steps,
          differential: reply.differential,
          follow_up: reply.follow_up,
        }
        setAiVerdict(verdictBody)
        setResumable(null)  // session is concluded — nothing to resume
        await persistVerdictRecommendations(verdictBody, data.diagnosisId ?? null)
        // Show the fresh verdict in the history list without a refetch.
        if (data.diagnosisId) {
          setHistory(prev => [{
            id: data.diagnosisId, created_at: new Date().toISOString(),
            verdict_title: verdictBody.title, confidence: verdictBody.confidence,
            verdict_id: 'ai-session',
          }, ...prev])
        }
      }
    } catch (err: unknown) {
      setTurns(prevTurns)  // roll back the optimistic append
      setSessionError(err instanceof Error ? err.message : 'Examination failed. Please try again.')
    } finally {
      setExamining(false)
    }
  }

  // Phase 2.3: a concluded verdict feeds Phase 1's loop — each next step
  // becomes a proposed recommendation, plus one for the follow-up check.
  async function persistVerdictRecommendations(v: DiagnosisVerdict, diagnosisId: string | null) {
    if (recsSaved) return
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const rows = v.next_steps.map(s => ({
        plant_id: id,
        user_id: user.id,
        source: 'diagnosis',
        source_id: diagnosisId,
        action: s.label.slice(0, 160),
        rationale: `From the AI examination verdict: ${v.title}`,
        urgency: s.immediate ? 'now' : 'routine',
        due_date: s.immediate ? toLocalDateStr(new Date()) : null,
        status: 'proposed',
      }))
      if (v.follow_up) {
        rows.push({
          plant_id: id,
          user_id: user.id,
          source: 'diagnosis',
          source_id: diagnosisId,
          action: `Follow-up check: ${v.follow_up.check}`.slice(0, 160),
          rationale: `Scheduled by the examination verdict "${v.title}" — recheck in ${v.follow_up.days} days.`,
          urgency: 'soon',
          due_date: toLocalDateStr(new Date(Date.now() + v.follow_up.days * 86_400_000)),
          status: 'proposed',
        })
      }
      if (rows.length > 0) {
        const { error } = await supabase.from('care_recommendations').insert(rows)
        if (!error) {
          setRecsSaved(true)
          router.refresh()  // Today's proposal section reads the same table
        }
      } else {
        setRecsSaved(true)
      }
    } catch {
      // Graceful-fail (table missing / offline) — the verdict still renders.
    }
  }

  // Clears every per-session piece of state. Called before any NEW
  // examination — without this, starting again after a concluded session
  // would reuse the old sessionId and the server would reject it.
  function resetSessionState() {
    setSessionId(null)
    setTurns([])
    setAskCount(0)
    setAiVerdict(null)
    setAiNextDone({})
    setRecsSaved(false)
    setSessionError(null)
    setAnswerText('')
    uploadFolderRef.current = null
  }

  function beginExamination() {
    resetSessionState()
    setMode('session')
    setShowComposer(false)
    // `fresh` forces a new session in sendTurn — the state resets above
    // aren't visible to its closure within this same tick.
    void sendTurn(openingText || null, openingPhoto, { fresh: true })
    setOpeningText('')
    setOpeningPhoto(null)
    setOpeningPreview(null)
  }

  function resumeExamination() {
    if (!resumable) return
    resetSessionState()
    setSessionId(resumable.id)
    setTurns(resumable.turns ?? [])
    setAskCount(resumable.ask_count ?? 0)
    setMode('session')
  }

  async function startFresh() {
    if (resumable) {
      // Starting over abandons the old session explicitly.
      await supabase.from('diagnosis_sessions')
        .update({ status: 'abandoned' })
        .eq('id', resumable.id)
      setResumable(null)
    }
    resetSessionState()
    setShowComposer(true)
  }

  // Leaving the session screen mid-examination keeps the session active
  // (spec: nav away = still resumable for 24h).
  function leaveSession() {
    if (sessionId && !aiVerdict && turns.length > 0) {
      setResumable({
        id: sessionId, plant_id: id, user_id: '', status: 'active',
        turns, ask_count: askCount, verdict: null, diagnosis_id: null,
        created_at: new Date().toISOString(), concluded_at: null,
      })
    }
    setMode('home')
  }

  // ── Quick triage handlers (unchanged logic) ─────────────────────────────
  function handleAnswer(questionId: string, option: Option) {
    const entry: PathEntry = { questionId, answerId: option.id, answerLabel: option.label }
    const newPath = [...path, entry]
    setPath(newPath)

    if (option.verdict) {
      setVerdictKey(option.verdict)
      setStep('result')
      saveDiagnosis(newPath, option.verdict)
    } else if (option.next) {
      setStep(option.next)
    }
  }

  async function saveDiagnosis(entryPath: PathEntry[], vKey: string) {
    if (saved) return
    const v = VERDICTS[vKey]
    if (!v) return
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      await supabase.from('diagnoses').insert({
        plant_id: id,
        user_id: session.user.id,
        question_path: entryPath,
        verdict_id: vKey,
        verdict_title: v.title,
        confidence: v.confidence,
        reasoning: v.reasoning,
        next_steps: v.nextSteps,
      })
      setSaved(true)
    } catch {
      // Table may not exist yet — silently ignore. The UI still works fully.
    }
  }

  function resetTriage() {
    setStep('intro')
    setPath([])
    setVerdictKey(null)
    setNextDone({})
    setSaved(false)
  }

  // ── Render ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-rule border-t-ink rounded-full animate-spin" />
      </div>
    )
  }

  const verdict = verdictKey ? VERDICTS[verdictKey] : null
  const question = step !== 'result' ? FLOW[step] : null
  const lastTurn = turns[turns.length - 1]
  const awaiting = !examining && !aiVerdict && lastTurn?.role === 'assistant'
    ? lastTurn : null

  return (
    <div className="min-h-screen bg-paper flex flex-col">

      {/* Top chrome */}
      <div className="flex items-center justify-between px-3 pt-4 pb-2">
        <button
          onClick={
            mode === 'session' ? leaveSession
            : mode === 'triage' ? (step === 'intro' ? () => setMode('home') : resetTriage)
            : () => router.back()
          }
          className="w-10 h-10 rounded-full flex items-center justify-center bg-card border border-rule"
          aria-label={mode === 'home' ? 'Back' : 'Back to Diagnose'}
        >
          <Icon name="back" size={18} className="text-ink" />
        </button>
        <div className="font-mono text-[10px] tracking-[1.6px] uppercase text-ink-muted">
          {mode === 'session' ? 'Examination' : 'Diagnose'} · {plant?.nickname ?? '…'}
        </div>
        <div className="w-10" />
      </div>

      {/* Plant micro-card */}
      {plant && mode !== 'session' && (
        <div className="flex items-center gap-3 px-5 pt-3 pb-1">
          <div className="w-11 h-11 rounded-[10px] overflow-hidden border border-rule flex-shrink-0">
            <PlantPhoto name={plant.nickname} showLabel={false} />
          </div>
          <div>
            <div className="font-serif italic text-[17px] text-ink leading-tight">{plant.nickname}</div>
            {(plant.species) && (
              <div className="text-[11px] text-ink-soft mt-0.5">{plant.species}</div>
            )}
          </div>
        </div>
      )}

      {/* ══ HOME ══════════════════════════════════════════════════════════ */}
      {mode === 'home' && (
        <div className="px-5 pt-4 pb-16">
          {/* Examine with AI — primary CTA */}
          <div className="p-4 bg-card border border-rule rounded-[14px]">
            <div className="flex items-center gap-1.5 font-mono text-[9px] tracking-[1.6px] uppercase text-accent mb-2">
              <Icon name="sparkle" size={11} className="text-accent" stroke={2} />
              AI examination
            </div>
            <div className="font-serif italic text-[20px] text-ink leading-snug">
              Examine with AI
            </div>
            <p className="text-[13px] text-ink-soft mt-1.5 leading-relaxed">
              The assistant reads {plant?.nickname ?? 'this plant'}&rsquo;s full history and photos,
              asks for what it can&rsquo;t see — a closer shot, a detail — and only then gives a
              verdict with honest confidence.
            </p>
            <div className="mt-3.5 flex flex-col gap-2">
              {resumable ? (
                <>
                  <HairlineButton icon="sparkle" onClick={resumeExamination} fullWidth>
                    Resume examination
                  </HairlineButton>
                  <HairlineButton variant="outline" onClick={() => void startFresh()} fullWidth>
                    Start fresh
                  </HairlineButton>
                </>
              ) : (
                <HairlineButton icon="sparkle" onClick={() => setShowComposer(v => !v)} fullWidth>
                  Begin examination
                </HairlineButton>
              )}
            </div>

            {/* Opening composer */}
            {showComposer && (
              <div className="mt-4 pt-4 border-t border-dashed border-rule">
                <label className="block font-mono text-[10px] tracking-[0.14em] uppercase text-ink-muted mb-1.5">
                  What&rsquo;s worrying you? <span className="normal-case tracking-normal text-ink-muted/60">(optional)</span>
                </label>
                <textarea
                  value={openingText}
                  onChange={e => setOpeningText(e.target.value)}
                  placeholder="Leave blank for a general checkup…"
                  rows={3}
                  className="w-full px-3.5 py-3 border border-rule rounded-brand bg-paper text-[13px] text-ink resize-none focus:outline-none focus:ring-1 focus:ring-accent"
                />
                {/* Optional opening photo */}
                <input
                  ref={openingInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={e => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    setOpeningPhoto(file)
                    setOpeningPreview(URL.createObjectURL(file))
                    if (openingInputRef.current) openingInputRef.current.value = ''
                  }}
                />
                <div className="mt-2.5 flex items-center gap-2.5">
                  <button
                    onClick={() => openingInputRef.current?.click()}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-full border border-rule text-[12px] font-medium text-ink-soft"
                  >
                    <Icon name="camera" size={13} stroke={1.9} />
                    {openingPhoto ? 'Change photo' : 'Add a fresh photo'}
                  </button>
                  {openingPreview && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={openingPreview} alt="opening" className="w-11 h-11 rounded-[8px] object-cover border border-rule" />
                  )}
                </div>
                <div className="mt-3">
                  <HairlineButton onClick={beginExamination} fullWidth>
                    Start the examination
                  </HairlineButton>
                </div>
              </div>
            )}
          </div>

          {/* Quick triage entry */}
          <button
            onClick={() => { resetTriage(); setMode('triage') }}
            className="mt-3 w-full flex items-center justify-between px-4 py-3.5 text-left bg-card border border-rule rounded-[14px] transition-colors hover:bg-paper-alt"
          >
            <div>
              <div className="font-serif italic text-[16px] text-ink leading-snug">
                Quick triage — common issues
              </div>
              <div className="text-[12px] text-ink-soft mt-0.5">
                Two or three taps to instant guidance. No AI, works offline.
              </div>
            </div>
            <Icon name="chev" size={14} className="text-ink-muted flex-shrink-0 ml-3" />
          </button>

          {/* Past examinations */}
          {history.length > 0 && (
            <div className="mt-6">
              <div className="font-mono text-[9px] tracking-[1.4px] uppercase text-ink-muted mb-2.5 px-1">
                Past examinations · {history.length}
              </div>
              <div className="bg-card border border-rule rounded-[14px] px-4">
                {history.map((h, i) => (
                  <div key={h.id} className={`py-3 ${i === history.length - 1 ? '' : 'border-b border-dashed border-rule'}`}>
                    <div className="flex items-center gap-2">
                      <span className={`font-mono text-[8px] tracking-[0.1em] uppercase px-1.5 py-0.5 rounded-full ${
                        h.verdict_id === 'ai-session' ? 'bg-accent-soft text-accent' : 'bg-paper-alt text-ink-muted'
                      }`}>
                        {h.verdict_id === 'ai-session' ? 'AI' : 'Triage'}
                      </span>
                      <span className="font-mono text-[9px] tracking-[0.08em] uppercase text-ink-muted">
                        {formatTimestamp(h.created_at)} · {h.confidence} confidence
                      </span>
                    </div>
                    <div className="font-serif italic text-[15px] text-ink mt-1 leading-snug">
                      {h.verdict_title}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══ AI EXAMINATION SESSION ════════════════════════════════════════ */}
      {mode === 'session' && (
        <div className="px-5 pt-2 pb-16">
          {/* Transcript — field-notes styling, not a generic chat */}
          {turns.map((t, i) => {
            if (t.role === 'assistant') {
              return (
                <div key={i} className="mt-4">
                  <div className="font-mono text-[9px] tracking-[1.6px] uppercase text-accent mb-1.5 flex items-center gap-1.5">
                    <Icon name="sparkle" size={10} stroke={2} className="text-accent" />
                    § Examination
                    {t.type === 'photo_request' && ' · photo requested'}
                    {t.type === 'verdict' && ' · verdict'}
                  </div>
                  <div className="font-serif text-[17px] text-ink leading-snug" style={{ textWrap: 'pretty' as React.CSSProperties['textWrap'] }}>
                    {t.text}
                  </div>
                  {t.why && (
                    <div className="mt-1 font-serif italic text-[13px] text-ink-soft leading-snug">
                      {t.why}
                    </div>
                  )}
                </div>
              )
            }
            if (t.type === 'photo' && t.photo_path) {
              return (
                <div key={i} className="mt-3 flex justify-end">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={getPhotoUrl(t.photo_path)}
                    alt="session photo"
                    className="w-32 h-32 rounded-[12px] object-cover border border-rule"
                  />
                </div>
              )
            }
            return (
              <div key={i} className="mt-3 flex justify-end">
                <div className="max-w-[80%] px-3.5 py-2.5 bg-paper-alt border border-rule rounded-[14px] text-[13px] text-ink leading-snug">
                  {t.text}
                </div>
              </div>
            )
          })}

          {/* Thinking indicator */}
          {examining && (
            <div className="mt-4 flex items-center gap-2.5 text-ink-soft">
              <div className="w-4 h-4 border-2 border-rule border-t-accent rounded-full animate-spin" />
              <span className="font-mono text-[10px] tracking-[0.14em] uppercase">Examining…</span>
            </div>
          )}

          {/* Error banner */}
          {sessionError && (
            <div className="mt-4 flex items-start justify-between px-3 py-2 bg-danger-soft border border-rule rounded-brand text-sm text-danger">
              <span>{sessionError}</span>
              <button onClick={() => setSessionError(null)} aria-label="Dismiss" className="ml-2 text-danger/70">
                <Icon name="close" size={14} stroke={2} />
              </button>
            </div>
          )}

          {/* ── Reply affordances for the latest assistant turn ─────────── */}
          {awaiting && awaiting.type === 'question' && (
            <div className="mt-4">
              {awaiting.options && awaiting.options.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {awaiting.options.map(opt => (
                    <Chip key={opt} onClick={() => void sendTurn(opt, null)}>{opt}</Chip>
                  ))}
                </div>
              )}
              {/* Free-text fallback — always available */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={answerText}
                  onChange={e => setAnswerText(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && answerText.trim()) {
                      void sendTurn(answerText.trim(), null)
                      setAnswerText('')
                    }
                  }}
                  placeholder="Or answer in your own words…"
                  className="flex-1 px-3.5 py-3 border border-rule rounded-brand bg-card text-[13px] text-ink focus:outline-none focus:ring-1 focus:ring-accent"
                />
                <button
                  onClick={() => { if (answerText.trim()) { void sendTurn(answerText.trim(), null); setAnswerText('') } }}
                  disabled={!answerText.trim()}
                  aria-label="Send answer"
                  className="w-11 h-11 rounded-full bg-ink text-paper flex items-center justify-center disabled:opacity-40"
                >
                  <Icon name="arrow-right" size={16} stroke={2} className="text-paper" />
                </button>
              </div>
            </div>
          )}

          {awaiting && awaiting.type === 'photo_request' && (
            <div className="mt-4">
              <input
                ref={sessionInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={e => {
                  const file = e.target.files?.[0]
                  if (file) void sendTurn(null, file)
                  if (sessionInputRef.current) sessionInputRef.current.value = ''
                }}
              />
              {/* Framed dropzone */}
              <button
                onClick={() => sessionInputRef.current?.click()}
                className="w-full p-6 rounded-[14px] border border-dashed border-accent bg-paper-alt flex flex-col items-center gap-2"
              >
                <Icon name="camera" size={26} stroke={1.7} className="text-accent" />
                <span className="font-serif italic text-[15px] text-ink">Take the requested photo</span>
                <span className="font-mono text-[9px] tracking-[0.12em] uppercase text-ink-muted">
                  or tap to upload
                </span>
              </button>
              {/* Free-text fallback — describe it instead */}
              <div className="flex gap-2 mt-2.5">
                <input
                  type="text"
                  value={answerText}
                  onChange={e => setAnswerText(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && answerText.trim()) {
                      void sendTurn(answerText.trim(), null)
                      setAnswerText('')
                    }
                  }}
                  placeholder="Can't take a photo? Describe what you see…"
                  className="flex-1 px-3.5 py-3 border border-rule rounded-brand bg-card text-[13px] text-ink focus:outline-none focus:ring-1 focus:ring-accent"
                />
                <button
                  onClick={() => { if (answerText.trim()) { void sendTurn(answerText.trim(), null); setAnswerText('') } }}
                  disabled={!answerText.trim()}
                  aria-label="Send description"
                  className="w-11 h-11 rounded-full bg-ink text-paper flex items-center justify-center disabled:opacity-40"
                >
                  <Icon name="arrow-right" size={16} stroke={2} className="text-paper" />
                </button>
              </div>
            </div>
          )}

          {/* ── Verdict card ─────────────────────────────────────────────── */}
          {aiVerdict && (
            <div className="mt-6">
              <div className="flex items-center gap-1.5 font-mono text-[9px] tracking-[1.6px] uppercase text-accent mb-2">
                <Icon name="sparkle" size={11} className="text-accent" stroke={2} />
                Verdict · {aiVerdict.confidence} confidence
              </div>
              <BigTitle italic>{aiVerdict.title}</BigTitle>

              {/* Reasoning */}
              {aiVerdict.reasoning.length > 0 && (
                <div className="mt-4 p-4 bg-card border border-rule rounded-[14px]">
                  <div className="font-mono text-[9px] tracking-[1.4px] uppercase text-ink-muted mb-3">
                    Why I think so
                  </div>
                  {aiVerdict.reasoning.map((r, i) => (
                    <div key={i} className="flex gap-2.5 py-1.5 text-[13px] text-ink-soft leading-relaxed">
                      <span className="font-mono text-[10px] text-ink-muted mt-0.5 flex-shrink-0">·</span>
                      <span>{r}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Differential — the honest alternative */}
              {aiVerdict.differential && (
                <div className="mt-3 p-3.5 bg-paper-alt border border-rule rounded-[14px]">
                  <div className="font-mono text-[9px] tracking-[1.4px] uppercase text-ink-muted mb-1.5">
                    Differential
                  </div>
                  <p className="font-serif italic text-[14px] text-ink leading-snug">
                    {aiVerdict.differential}
                  </p>
                </div>
              )}

              {/* Next steps checklist */}
              {aiVerdict.next_steps.length > 0 && (
                <div className="mt-4">
                  <div className="font-mono text-[9px] tracking-[1.4px] uppercase text-ink-muted mb-3 px-1">
                    Next steps · {aiVerdict.next_steps.length}
                  </div>
                  {aiVerdict.next_steps.map((s, i) => (
                    <div
                      key={i}
                      className={`flex items-start gap-3 p-3.5 mb-2 rounded-[14px] border ${
                        s.immediate ? 'bg-accent-soft/25 border-accent/30' : 'bg-card border-rule'
                      }`}
                    >
                      <button
                        onClick={() => setAiNextDone(d => ({ ...d, [i]: !d[i] }))}
                        className={`w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center border mt-0.5 transition-colors ${
                          aiNextDone[i] ? 'bg-accent border-accent'
                          : s.immediate ? 'bg-transparent border-accent'
                          : 'bg-transparent border-rule'
                        }`}
                        aria-label={aiNextDone[i] ? 'Mark undone' : 'Mark done'}
                      >
                        {aiNextDone[i] && <Icon name="check" size={12} className="text-paper" stroke={2.5} />}
                        {!aiNextDone[i] && s.immediate && (
                          <Icon name="arrow-right" size={11} className="text-accent" stroke={2.5} />
                        )}
                      </button>
                      <div className="flex-1">
                        <p className={`text-[13px] leading-snug ${aiNextDone[i] ? 'line-through text-ink-muted' : 'text-ink'}`}>
                          {s.label}
                        </p>
                        {s.immediate && !aiNextDone[i] && (
                          <div className="font-mono text-[9px] tracking-[1px] uppercase text-accent mt-1">
                            Do today
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Follow-up line */}
              {aiVerdict.follow_up && (
                <div className="mt-3 flex items-start gap-2.5 px-3.5 py-3 bg-warn-soft border border-rule rounded-[14px]">
                  <Icon name="clock" size={14} stroke={1.9} className="mt-0.5 shrink-0 text-warn" />
                  <span className="text-[12px] text-warn leading-snug">
                    Follow-up in {aiVerdict.follow_up.days} day{aiVerdict.follow_up.days === 1 ? '' : 's'}: {aiVerdict.follow_up.check}
                  </span>
                </div>
              )}

              {/* Phase 1 hand-off note */}
              {recsSaved && (
                <div className="mt-3 flex items-center gap-2 px-3.5 py-2.5 bg-accent-soft border border-rule rounded-[14px]">
                  <Icon name="check" size={13} stroke={2.2} className="text-accent shrink-0" />
                  <span className="text-[12px] text-accent">
                    Next steps added as proposals on your Today screen.
                  </span>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2.5 mt-5">
                <div className="flex-1">
                  <HairlineButton icon="leaf" onClick={() => router.push(`/plant/${id}`)} fullWidth>
                    View {plant?.nickname ?? 'plant'}
                  </HairlineButton>
                </div>
                <div className="flex-1">
                  <HairlineButton variant="outline" onClick={() => setMode('home')} fullWidth>
                    Done
                  </HairlineButton>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══ QUICK TRIAGE (the original static flow) ═══════════════════════ */}

      {/* ── INTRO STEP ── */}
      {mode === 'triage' && step === 'intro' && question && (
        <div className="px-5 pt-4 pb-10">
          <BigTitle>{question.question}</BigTitle>
          {question.hint && (
            <p className="text-[13px] text-ink-soft mt-2 leading-relaxed">{question.hint}</p>
          )}
          <div className="mt-6 flex flex-col gap-2.5">
            {question.options.map(opt => (
              <button
                key={opt.id}
                onClick={() => handleAnswer(step, opt)}
                className="flex items-center justify-between px-4 py-3.5 text-left
                  bg-card border border-rule rounded-[14px] transition-colors hover:bg-paper-alt"
              >
                <span className="font-serif italic text-[16px] text-ink leading-snug">
                  {opt.label}
                </span>
                <Icon name="chev" size={14} className="text-ink-muted flex-shrink-0 ml-3" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── QUESTION STEPS ── */}
      {mode === 'triage' && step !== 'intro' && step !== 'result' && question && (
        <div className="px-5 pt-4 pb-10">
          {/* Breadcrumb trail */}
          {path.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-4">
              {path.map((p, i) => (
                <span key={i} className="font-mono text-[10px] px-2 py-1 rounded-full bg-paper-alt text-ink-soft">
                  {p.answerLabel.length > 32 ? p.answerLabel.slice(0, 32) + '…' : p.answerLabel}
                </span>
              ))}
            </div>
          )}
          <BigTitle>{question.question}</BigTitle>
          {question.hint && (
            <p className="text-[13px] text-ink-soft mt-2 leading-relaxed">{question.hint}</p>
          )}
          <div className="mt-5 flex flex-col gap-2.5">
            {question.options.map(opt => (
              <button
                key={opt.id}
                onClick={() => handleAnswer(step, opt)}
                className="flex items-center justify-between px-4 py-3.5 text-left
                  bg-card border border-rule rounded-[14px] transition-colors hover:bg-paper-alt"
              >
                <span className="font-serif italic text-[16px] text-ink leading-snug">
                  {opt.label}
                </span>
                <Icon name="chev" size={14} className="text-ink-muted flex-shrink-0 ml-3" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── RESULT / VERDICT ── */}
      {mode === 'triage' && step === 'result' && verdict && (
        <div className="px-5 pt-4 pb-16">
          {/* Verdict header */}
          <div className="flex items-center gap-1.5 font-mono text-[9px] tracking-[1.6px] uppercase text-accent mb-2">
            <Icon name="sparkle" size={11} className="text-accent" stroke={2} />
            Verdict · {verdict.confidence} confidence
          </div>
          <BigTitle italic>{verdict.title}</BigTitle>

          {/* Reasoning card */}
          <div className="mt-4 p-4 bg-card border border-rule rounded-[14px]">
            <div className="font-mono text-[9px] tracking-[1.4px] uppercase text-ink-muted mb-3">
              Why I think so
            </div>
            {verdict.reasoning.map((r, i) => (
              <div key={i} className="flex gap-2.5 py-1.5 text-[13px] text-ink-soft leading-relaxed">
                <span className="font-mono text-[10px] text-ink-muted mt-0.5 flex-shrink-0">·</span>
                <span>{r}</span>
              </div>
            ))}
          </div>

          {/* Next steps */}
          <div className="mt-4">
            <div className="font-mono text-[9px] tracking-[1.4px] uppercase text-ink-muted mb-3 px-1">
              Next steps · {verdict.nextSteps.length}
            </div>
            {verdict.nextSteps.map((s, i) => (
              <div
                key={i}
                className="flex items-start gap-3 p-3.5 mb-2 rounded-[14px] border"
                style={{
                  background: s.immediate ? '#B9C9A8' + '40' : '#FAF6EC',
                  borderColor: s.immediate ? '#4C6A4844' : '#D9D0BD',
                }}
              >
                <button
                  onClick={() => setNextDone(d => ({ ...d, [i]: !d[i] }))}
                  className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center border mt-0.5 transition-colors"
                  style={{
                    borderColor: nextDone[i] ? '#4C6A48' : (s.immediate ? '#4C6A48' : '#D9D0BD'),
                    background: nextDone[i] ? '#4C6A48' : 'transparent',
                  }}
                  aria-label={nextDone[i] ? 'Mark undone' : 'Mark done'}
                >
                  {nextDone[i] && <Icon name="check" size={12} className="text-paper" stroke={2.5} />}
                  {!nextDone[i] && s.immediate && (
                    <Icon name="arrow-right" size={11} className="text-accent" stroke={2.5} />
                  )}
                </button>
                <div className="flex-1">
                  <p className={`text-[13px] leading-snug ${nextDone[i] ? 'line-through text-ink-muted' : 'text-ink'}`}>
                    {s.label}
                  </p>
                  {s.immediate && !nextDone[i] && (
                    <div className="font-mono text-[9px] tracking-[1px] uppercase text-accent mt-1">
                      Do today
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="flex gap-2.5 mt-5">
            <div className="flex-1">
              <HairlineButton
                icon="leaf"
                onClick={() => router.push(`/plant/${id}`)}
                fullWidth
              >
                View {plant?.nickname ?? 'plant'}
              </HairlineButton>
            </div>
            <div className="flex-1">
              <HairlineButton
                variant="outline"
                onClick={resetTriage}
                fullWidth
              >
                Start over
              </HairlineButton>
            </div>
          </div>

          {/* Follow-up note */}
          <div className="mt-5 p-3.5 bg-paper-alt rounded-[14px] text-[11px] text-ink-soft leading-relaxed">
            Check in on your plant in 5–7 days to see if the treatment worked.
            If symptoms worsen, try <button onClick={() => { setMode('home'); setShowComposer(true) }} className="text-accent font-medium">an AI examination</button> —
            it can see the photos and history this quick flow can&rsquo;t.
          </div>
        </div>
      )}
    </div>
  )
}
