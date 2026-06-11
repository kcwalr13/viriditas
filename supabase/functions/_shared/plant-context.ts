// supabase/functions/_shared/plant-context.ts
//
// Shared plant-context assembly for the AI Edge Functions (Phase 2 extraction
// — see docs/ASSISTANT-SPEC.md §2.2). Both analyze-plant and diagnose-plant
// feed the model the same picture of the plant: species reference data,
// owner-supplied context, season, analysis history, and recent care logs.
// Supabase bundles `_shared/` automatically when deploying each function.
//
// These are pure string builders — no network, no database. Callers gather
// the data (analyze-plant receives it from the client; diagnose-plant fetches
// it server-side) and map it onto these types.

// ── Context types ─────────────────────────────────────────────────────────────

export type PreviousAnalysis = {
  date: string
  species: string | null
  health: string | null
  health_score: number | null   // Gap 5 — lets AI reference trend
  care: string | null            // Gap 3 — lets AI reflect on prior recommendations
}

export type CareLogEntry = {
  type: string
  notes: string | null
  date: string
  category?: 'growth' | 'pest' | 'environment' | 'concern' | 'general' | null   // Gap 4
  measurement_value?: number | null   // Gap 6
  measurement_unit?: string | null    // Gap 6
}

export type SpeciesProfileContext = {
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

export type PlantContext = {
  location?: string | null
  pot_size?: string | null
  soil_type?: string | null             // e.g. "aroid mix" — affects watering frequency advice (Phase 12C)
  plant_notes?: string | null           // Gap 2 — freeform owner notes from plants.notes
  pest_notes?: string | null            // Gap 2 — pest history from plants.pest_notes
  last_treatment_date?: string | null   // Gap 2 — YYYY-MM-DD
  watering_interval_days?: number | null     // Phase 1 — current schedule, baseline for interval_suggestion
  fertilizing_interval_days?: number | null  // Phase 1
}

export type SeasonContext = {
  month: number                          // 1–12
  hemisphere: 'northern' | 'southern'   // northern by default
}

// Phase 5 identity slice: lets the model hedge species-specific claims when
// the species name is AI-assumed rather than owner-confirmed.
export type IdentityContext = {
  verified: boolean
}

// ── Section builders ──────────────────────────────────────────────────────────

export function buildIdentitySection(identityContext: IdentityContext | null): string {
  if (!identityContext) return ''
  return identityContext.verified
    ? `\nSpecies identity: the owner has verified the species name — treat the species reference data as reliable.`
    : `\nSpecies identity: the species name is AI-assumed and has NOT been confirmed by the owner. Hedge species-specific claims accordingly, and say so if what you see in the photo seems inconsistent with the assumed species.`
}

export function buildSpeciesSection(speciesProfile: SpeciesProfileContext | null): string {
  if (!speciesProfile) return ''
  return `\nSpecies reference data (use this to assess whether the plant's conditions match its known requirements):
- Scientific name: ${speciesProfile.scientific_name ?? 'unknown'}
- Light needs: ${speciesProfile.light ?? 'unknown'}
- Watering: ${speciesProfile.watering ?? 'unknown'}
- Humidity: ${speciesProfile.humidity ?? 'unknown'}
- Temperature: ${speciesProfile.temperature ?? 'unknown'}
- Common problems: ${speciesProfile.common_problems ?? 'unknown'}
- Disease & pest symptoms to watch for: ${speciesProfile.disease_symptoms ?? 'unknown'}
- Pruning guidance: ${speciesProfile.pruning_tips ?? 'unknown'}
- Seasonal care notes: ${speciesProfile.seasonal_care ?? 'unknown'}`
}

export function buildPlantContextSection(plantContext: PlantContext | null): string {
  const contextParts: string[] = []
  if (plantContext?.location)            contextParts.push(`- Location: ${plantContext.location}`)
  if (plantContext?.pot_size)            contextParts.push(`- Pot size: ${plantContext.pot_size}`)
  if (plantContext?.soil_type)           contextParts.push(`- Soil type: ${plantContext.soil_type}`)
  if (plantContext?.plant_notes)         contextParts.push(`- Owner's notes on this plant: ${plantContext.plant_notes}`)
  if (plantContext?.pest_notes)          contextParts.push(`- Pest history: ${plantContext.pest_notes}`)
  if (plantContext?.last_treatment_date) contextParts.push(`- Most recent pest treatment: ${plantContext.last_treatment_date}`)
  // Current schedules — the baseline any interval_suggestion must be judged
  // against. Gated on the KEY being present, not just on plantContext: v1.5.x
  // clients send plantContext without the interval keys, and asserting
  // "none set" for them would be inventing a claim. The v2 client always
  // sends both keys (explicit null = genuinely no schedule).
  if (plantContext && plantContext.watering_interval_days !== undefined) {
    contextParts.push(`- Current watering schedule: ${plantContext.watering_interval_days ? `every ${plantContext.watering_interval_days} days` : 'none set'}`)
  }
  if (plantContext && plantContext.fertilizing_interval_days !== undefined) {
    contextParts.push(`- Current fertilizing schedule: ${plantContext.fertilizing_interval_days ? `every ${plantContext.fertilizing_interval_days} days` : 'none set'}`)
  }
  return contextParts.length > 0
    ? `\nPlant context:\n${contextParts.join('\n')}\nFactor this into your recommendations — reference the specific conditions of their location, let soil type inform watering frequency advice, and take pest history seriously when interpreting what you see in the photo.`
    : ''
}

// Seasonal context: lets the AI give season-appropriate advice and flag
// when winter dormancy should prompt interval adjustments.
export function buildSeasonSection(seasonContext: SeasonContext | null): string {
  if (!seasonContext) return ''
  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const monthName  = monthNames[seasonContext.month - 1]
  const isWinter   = seasonContext.hemisphere === 'northern'
    ? [11, 12, 1, 2].includes(seasonContext.month)
    : [5, 6, 7, 8].includes(seasonContext.month)
  return `\nSeasonal context: ${monthName} (${seasonContext.hemisphere} hemisphere).${
    isWinter
      ? ' It is currently winter — most houseplants have slower growth and need less frequent watering. Mention this if it is relevant to the plant\'s care.'
      : ''
  }`
}

export function buildHistorySection(previousAnalyses: PreviousAnalysis[]): string {
  if (previousAnalyses.length === 0) return ''
  return `\nPrevious analysis history (most recent first):
${previousAnalyses.map(a => {
  const score = a.health_score !== null ? ` Score: ${a.health_score}/5.` : ''
  const care  = a.care ? ` Previous recommendations: ${a.care}` : ''
  return `[${a.date}] Species: ${a.species ?? 'unknown'}. Health: ${a.health ?? 'not recorded'}.${score}${care}`
}).join('\n')}
Compare what you observe now against this history. If scores are trending up, affirm the progress; if trending down, flag it and adjust recommendations accordingly. Where a previous analysis made specific recommendations, use the recent care log below as evidence of whether the owner followed them — and comment on whether those actions appear to have helped.`
}

export function buildCareSection(recentCareLogs: CareLogEntry[]): string {
  if (recentCareLogs.length === 0) return ''
  return `\nRecent care log:
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
}

// The full context block, in the canonical order both functions use:
// identity → species reference → plant context → season → history → care log.
export function buildContextSections(
  previousAnalyses: PreviousAnalysis[],
  recentCareLogs: CareLogEntry[],
  speciesProfile: SpeciesProfileContext | null,
  plantContext: PlantContext | null,
  seasonContext: SeasonContext | null,
  identityContext: IdentityContext | null
): string {
  return (
    buildIdentitySection(identityContext) +
    buildSpeciesSection(speciesProfile) +
    buildPlantContextSection(plantContext) +
    buildSeasonSection(seasonContext) +
    buildHistorySection(previousAnalyses) +
    buildCareSection(recentCareLogs)
  )
}
