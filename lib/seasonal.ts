// lib/seasonal.ts
// Phase 3 — adaptive schedules (docs/ASSISTANT-SPEC.md). Local, non-AI
// seasonal heuristics: when the month rolls over, Today generates schedule
// proposals from each plant's cached species guide (`seasonal_care` prose)
// plus the current season. Everything lands as a normal `care_recommendations`
// proposal with an `interval_suggestion` — Phase 1's confirm sheet applies
// unchanged, so nothing ever moves without a tap.
//
// Design rule: SILENCE OVER NOISE. A proposal is only emitted when the rules
// table has an active multiplier for the season AND the species' own
// seasonal_care prose corroborates the direction (best-effort keyword match).
// No prose, no signal, no parse → no proposal.

import type { IntervalSuggestion } from '@/lib/types'

export type Season = 'winter' | 'spring' | 'summer' | 'autumn'

// Meteorological seasons, northern hemisphere (matches the Today masthead's
// season tag; the hemisphere is hardcoded app-wide for now — see ROADMAP).
export function getSeason(month: number): Season {
  if ([12, 1, 2].includes(month)) return 'winter'
  if ([3, 4, 5].includes(month))  return 'spring'
  if ([6, 7, 8].includes(month))  return 'summer'
  return 'autumn'
}

// First day of the current season — used to dedupe: any seasonal
// recommendation created since this date (whatever its status) suppresses a
// new one for the same plant + care type. That's both the spec's "skip if an
// unresolved seasonal row exists" and "dismiss suppresses until next season".
export function seasonStart(now: Date): Date {
  const month = now.getMonth() + 1
  const year = now.getFullYear()
  if (month === 12)           return new Date(year, 11, 1)      // winter started this Dec
  if ([1, 2].includes(month)) return new Date(year - 1, 11, 1)  // winter started last Dec
  if ([3, 4, 5].includes(month))  return new Date(year, 2, 1)   // spring: Mar 1
  if ([6, 7, 8].includes(month))  return new Date(year, 5, 1)   // summer: Jun 1
  return new Date(year, 8, 1)                                    // autumn: Sep 1
}

// ── Rules table (tune here) ─────────────────────────────────────────────────
// One rule per (season, care type). `multiplier` scales the CURRENT interval
// (>1 = less frequent care, <1 = more frequent). `proseSignals` must match the
// species' seasonal_care text for the rule to fire — the rule supplies the
// magnitude, the species guide supplies the justification.
//
// Spring and autumn deliberately have no rules: without a remembered baseline
// we can't tell "restore the summer schedule" from "fight a schedule the
// owner chose on purpose", so we stay quiet. Revisit once accepted seasonal
// changes are tracked across seasons.

type SeasonalRule = {
  season: Season
  type: 'watering' | 'fertilizing'
  multiplier: number
  proseSignals: RegExp[]
  reasonTemplate: string   // {species} is replaced with the species name
}

const RULES: SeasonalRule[] = [
  {
    // Winter dormancy: stretch the watering interval ~40% (the spec's
    // suggested +30–50% band for tropicals).
    season: 'winter',
    type: 'watering',
    multiplier: 1.4,
    proseSignals: [
      /reduce[d]?\s+water/i,
      /water(ing)?\s+(less|sparingly|reduced?|minimal)/i,
      /less\s+(frequent\s+)?water/i,
      /allow\s+.{0,30}(dry|drying)/i,
      /dry\s+out\s+between/i,
      /water\s+sparingly/i,
      /winter\s+.{0,50}(less|reduce|sparing|dry)/i,
      /dormant|dormancy/i,
    ],
    reasonTemplate:
      'Winter dormancy — the {species} guide says to cut back on watering while growth slows.',
  },
  {
    // Winter: most houseplants stop feeding entirely; doubling the interval
    // is the conservative middle ground between "pause" and "as usual".
    season: 'winter',
    type: 'fertilizing',
    multiplier: 2,
    proseSignals: [
      /stop\s+fertili[sz]/i,
      /no\s+fertili[sz]er?/i,
      /(pause|halt|skip|avoid|suspend|withhold)\s+.{0,15}(feed|fertili[sz])/i,
      /fertili[sz]e\s+.{0,40}(spring|summer|growing\s+season)/i,
      /feed\s+.{0,40}(spring|summer|growing\s+season)/i,
      /growing\s+season/i,
      /dormant|dormancy/i,
    ],
    reasonTemplate:
      'Winter rest — the {species} guide ties feeding to the growing season, so stretch the schedule until spring.',
  },
  {
    // Summer growth: tighten the watering interval ~25%.
    season: 'summer',
    type: 'watering',
    multiplier: 0.75,
    proseSignals: [
      /more\s+(frequent\s+)?water/i,
      /increase[d]?\s+water/i,
      /water\s+(more|regularly|frequently|generously)/i,
      /keep\s+.{0,25}moist/i,
      /summer\s+.{0,50}(more|increase|frequent|moist)/i,
      /growing\s+season\s+.{0,50}water/i,
    ],
    reasonTemplate:
      'Summer growth — the {species} guide calls for more frequent water while the plant is active.',
  },
]

// ── Proposal builder ─────────────────────────────────────────────────────────

export type SeasonalProposal = {
  type: 'watering' | 'fertilizing'
  action: string
  reason: string
  intervalSuggestion: IntervalSuggestion
}

// Decides whether ONE care type of ONE plant deserves a seasonal proposal.
// Returns null in every doubtful case (silence over noise).
export function buildSeasonalProposal(opts: {
  season: Season
  type: 'watering' | 'fertilizing'
  currentDays: number | null
  speciesName: string
  seasonalCareText: string | null
}): SeasonalProposal | null {
  const { season, type, currentDays, speciesName, seasonalCareText } = opts
  if (!currentDays || currentDays <= 0) return null          // no schedule to adjust
  if (!seasonalCareText || !seasonalCareText.trim()) return null  // no guide prose → stay quiet

  const rule = RULES.find(r => r.season === season && r.type === type)
  if (!rule) return null

  // Best-effort prose corroboration — any one signal is enough.
  const corroborated = rule.proseSignals.some(re => re.test(seasonalCareText))
  if (!corroborated) return null

  const suggested = Math.min(365, Math.max(1, Math.round(currentDays * rule.multiplier)))
  if (suggested === currentDays) return null                 // nothing would change

  const reason = rule.reasonTemplate.replace('{species}', speciesName)
  return {
    type,
    action: `Change ${type} to every ${suggested} days for ${season}`,
    reason,
    intervalSuggestion: {
      type,
      current_days: currentDays,
      suggested_days: suggested,
      reason,
    },
  }
}
