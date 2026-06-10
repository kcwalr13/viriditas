// lib/recommendations.ts
// Shared mutation helpers for the care_recommendations table (Phase 1 —
// the insight→task loop). Used by both Today and Plant Detail so the
// Accept / Done / Dismiss behavior is identical everywhere.
//
// Every helper returns true on success and false on failure (it never
// throws). Failures are swallowed deliberately — the table may not exist
// yet on a database where the Phase 1 migration hasn't been run, and the
// established pattern (diagnoses, propagations) is to degrade gracefully.

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  AnalysisAction,
  CareLog,
  CareRecommendation,
  DismissedReason,
  IntervalSuggestion,
} from '@/lib/types'
import { toLocalDateStr } from '@/lib/utils'

// ── Conservative action → care-log map ─────────────────────────────────────
// When the user taps "Done" on a recommendation, we auto-log the matching
// care event — but only when the mapping is unambiguous (decision recorded
// in docs/ASSISTANT-SPEC.md, open question 5). Ambiguous actions resolve
// the recommendation without writing a log.
//
// Conservative means: the care VERB must lead the imperative ("Water
// deeply", "Move off the radiator") — a mention elsewhere ("Empty standing
// water from the saucer") is not the care act — and cessation phrasings
// ("Hold off on watering", "Stop misting") never log the act they negate.
export function careLogTypeForAction(action: string): CareLog['type'] | null {
  const a = action.toLowerCase().trim()
  // Negation / cessation / inspection phrasings describe what NOT to do (or
  // merely to check) — when in doubt, no log: the recommendation still resolves.
  if (/\b(don'?t|do not|stop|avoid|hold off|wait|skip|pause|reduce|cut back|less|check|inspect|monitor)\b/.test(a)) return null
  if (/^(water|re-?water|drench|soak)\b/.test(a))   return 'watered'
  if (/^(fertili[sz]e|feed)\b/.test(a))             return 'fertilized'
  if (/^mist\b/.test(a))                            return 'misted'
  if (/^(prune|trim)\b/.test(a))                    return 'pruned'
  if (/^(move|relocate)\b/.test(a))                 return 'moved'
  // Pest treatment needs a treatment verb AND a pest mention — bare "pest"
  // would mislabel isolation/inspection advice as a treatment event.
  if (/^(treat|apply|spray|wipe)\b/.test(a) && /\b(pest|mite|aphid|mealybug|scale|gnat|thrip|insect)/.test(a)) {
    return 'pest_treatment'
  }
  return null
}

// ── Status transitions ──────────────────────────────────────────────────────

export async function acceptRecommendation(
  supabase: SupabaseClient,
  rec: CareRecommendation
): Promise<boolean> {
  const { error } = await supabase
    .from('care_recommendations')
    .update({ status: 'accepted' })
    .eq('id', rec.id)
  if (error) console.warn('acceptRecommendation failed:', error.message)
  return !error
}

// "Done" = the user just did it. Resolves the row and, when the action maps
// cleanly to a care-log type, writes the matching care_logs entry too.
export async function completeRecommendation(
  supabase: SupabaseClient,
  rec: CareRecommendation
): Promise<boolean> {
  // Interval suggestions are applied through the confirm sheet, never via
  // a care log — see applyIntervalSuggestion below.
  const logType = rec.interval_suggestion ? null : careLogTypeForAction(rec.action)
  if (logType) {
    const { error: logError } = await supabase.from('care_logs').insert({
      plant_id: rec.plant_id,
      user_id: rec.user_id,
      type: logType,
      notes: 'via assistant',
      logged_at: new Date().toISOString(),
    })
    if (logError) console.warn('completeRecommendation care log failed:', logError.message)
  }
  const { error } = await supabase
    .from('care_recommendations')
    .update({ status: 'done', resolved_at: new Date().toISOString() })
    .eq('id', rec.id)
  if (error) console.warn('completeRecommendation failed:', error.message)
  return !error
}

export async function dismissRecommendation(
  supabase: SupabaseClient,
  rec: CareRecommendation,
  reason: DismissedReason
): Promise<boolean> {
  const { error } = await supabase
    .from('care_recommendations')
    .update({ status: 'dismissed', dismissed_reason: reason, resolved_at: new Date().toISOString() })
    .eq('id', rec.id)
  if (error) console.warn('dismissRecommendation failed:', error.message)
  return !error
}

// Applies a confirmed interval suggestion: updates the plant's schedule and
// resolves the recommendation as done. Only ever called after the user taps
// Confirm in the interval sheet — never silently (spec house rule).
export async function applyIntervalSuggestion(
  supabase: SupabaseClient,
  rec: CareRecommendation
): Promise<boolean> {
  const suggestion = rec.interval_suggestion
  if (!suggestion) return false
  const column = suggestion.type === 'watering' ? 'watering_interval_days' : 'fertilizing_interval_days'
  const { error: plantError } = await supabase
    .from('plants')
    .update({ [column]: suggestion.suggested_days })
    .eq('id', rec.plant_id)
  if (plantError) {
    console.warn('applyIntervalSuggestion plant update failed:', plantError.message)
    return false
  }
  const { error } = await supabase
    .from('care_recommendations')
    .update({ status: 'done', resolved_at: new Date().toISOString() })
    .eq('id', rec.id)
  if (error) console.warn('applyIntervalSuggestion resolve failed:', error.message)
  return !error
}

// ── Expiry (Phase 1.6) ──────────────────────────────────────────────────────
// Proposals the user never acted on go stale. On Today load the client marks
// `proposed` rows older than 14 days as `expired` — cheap, no cron needed.
export const PROPOSAL_EXPIRY_DAYS = 14

// Returns how many rows were expired (0 on failure) so the caller can skip
// the refresh when nothing changed.
export async function expireStaleRecommendations(
  supabase: SupabaseClient,
  userId: string
): Promise<number> {
  const cutoff = new Date(Date.now() - PROPOSAL_EXPIRY_DAYS * 86_400_000).toISOString()
  const { data, error } = await supabase
    .from('care_recommendations')
    .update({ status: 'expired', resolved_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('status', 'proposed')
    .lt('created_at', cutoff)
    .select('id')
  if (error) {
    console.warn('expireStaleRecommendations failed:', error.message)
    return 0
  }
  return data?.length ?? 0
}

// ── Persistence after an analysis (Phase 1.3) ──────────────────────────────
// The client owns analysis persistence (it inserts analysis_results), so it
// also inserts the recommendation rows: one per action, plus one carrying the
// interval suggestion when present.
export async function insertAnalysisRecommendations(
  supabase: SupabaseClient,
  params: {
    plantId: string
    userId: string
    analysisId: string | null
    actions: AnalysisAction[]
    intervalSuggestion: IntervalSuggestion | null
  }
): Promise<boolean> {
  const rows: Array<Record<string, unknown>> = params.actions.map(a => ({
    plant_id: params.plantId,
    user_id: params.userId,
    source: 'analysis',
    source_id: params.analysisId,
    action: a.action,
    rationale: a.rationale || null,
    urgency: a.urgency,
    due_date: a.due_in_days !== null
      ? toLocalDateStr(new Date(Date.now() + a.due_in_days * 86_400_000))
      : null,
    status: 'proposed',
  }))

  if (params.intervalSuggestion) {
    const s = params.intervalSuggestion
    rows.push({
      plant_id: params.plantId,
      user_id: params.userId,
      source: 'analysis',
      source_id: params.analysisId,
      action: `Change ${s.type} to every ${s.suggested_days} days`,
      rationale: s.reason || null,
      urgency: 'routine',
      due_date: null,
      interval_suggestion: s,
      status: 'proposed',
    })
  }

  if (rows.length === 0) return true
  const { error } = await supabase.from('care_recommendations').insert(rows)
  if (error) console.warn('insertAnalysisRecommendations failed:', error.message)
  return !error
}
