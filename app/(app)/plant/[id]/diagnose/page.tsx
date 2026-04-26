'use client'
// app/(app)/plant/[id]/diagnose/page.tsx
// Guided diagnostic question flow → verdict card → next-step checklist.
//
// Structure:
//   intro → question tree (2–3 steps) → result (verdict + reasoning + next steps)
//
// The question tree is a static data structure — no AI required. The pattern
// (specific questions → specific verdicts) is more reliable than a general
// "what's wrong with my plant?" prompt. Think: branching clinical flow.
//
// Saves a row to the `diagnoses` table on completion (graceful-fail if the
// table doesn't exist yet — see REQUIRED MIGRATION note below).
//
// REQUIRED MIGRATION — run once in the Supabase SQL editor before this
// screen is used in production:
//
// create table if not exists diagnoses (
//   id uuid primary key default gen_random_uuid(),
//   plant_id uuid not null references plants(id) on delete cascade,
//   user_id uuid not null references auth.users(id),
//   created_at timestamptz not null default now(),
//   question_path jsonb not null,
//   verdict_id text not null,
//   verdict_title text not null,
//   confidence text not null,
//   reasoning text[] not null,
//   next_steps jsonb not null
// );
// create index if not exists idx_diagnoses_plant on diagnoses(plant_id, created_at desc);
// alter table diagnoses enable row level security;
// create policy "Users manage own diagnoses" on diagnoses
//   for all using (auth.uid() = user_id);

import { createClient } from '@/lib/supabase/client'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useState, useCallback } from 'react'
import { BigTitle, HairlineButton } from '@/components/ui'
import { Icon } from '@/components/Icon'
import { PlantPhoto } from '@/components/PlantPhoto'
import type { Plant } from '@/lib/types'

// ── Question tree data ────────────────────────────────────────────────────

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

export default function DiagnosePage() {
  const params   = useParams<{ id: string }>()
  const router   = useRouter()
  const supabase = createClient()
  const id       = params.id

  const [plant,      setPlant]      = useState<Plant | null>(null)
  const [loading,    setLoading]    = useState(true)
  const [step,       setStep]       = useState<string>('intro')
  const [path,       setPath]       = useState<PathEntry[]>([])
  const [verdictKey, setVerdictKey] = useState<string | null>(null)
  const [nextDone,   setNextDone]   = useState<Record<number, boolean>>({})
  const [saved,      setSaved]      = useState(false)

  const load = useCallback(async () => {
    const { data } = await supabase.from('plants').select('*').eq('id', id).single()
    setPlant(data as Plant | null)
    setLoading(false)
  }, [supabase, id])

  useEffect(() => { load() }, [load])

  // ── Handle answer selection ─────────────────────────────────────────────
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

  // ── Save to DB (graceful-fail if table doesn't exist yet) ───────────────
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

  function reset() {
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

  return (
    <div className="min-h-screen bg-paper flex flex-col">

      {/* Top chrome */}
      <div className="flex items-center justify-between px-3 pt-4 pb-2">
        <button
          onClick={step === 'intro' ? () => router.back() : reset}
          className="w-10 h-10 rounded-full flex items-center justify-center bg-card border border-rule"
          aria-label={step === 'intro' ? 'Back' : 'Restart'}
        >
          <Icon name="back" size={18} className="text-ink" />
        </button>
        <div className="font-mono text-[10px] tracking-[1.6px] uppercase text-ink-muted">
          Diagnose · {plant?.nickname ?? '…'}
        </div>
        <div className="w-10" />
      </div>

      {/* Plant micro-card */}
      {plant && (
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

      {/* ── INTRO STEP ── */}
      {step === 'intro' && question && (
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
      {step !== 'intro' && step !== 'result' && question && (
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
      {step === 'result' && verdict && (
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
                onClick={reset}
                fullWidth
              >
                Start over
              </HairlineButton>
            </div>
          </div>

          {/* Follow-up note */}
          <div className="mt-5 p-3.5 bg-paper-alt rounded-[14px] text-[11px] text-ink-soft leading-relaxed">
            Check in on your plant in 5–7 days to see if the treatment worked.
            If symptoms worsen, run the diagnosis again — sometimes a second pass reveals a different angle.
          </div>
        </div>
      )}
    </div>
  )
}
