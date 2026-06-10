// Shared TypeScript types used throughout the app.
// When we fetch data from Supabase, it will match these shapes.

export type Plant = {
  id: string
  user_id: string
  nickname: string
  species: string | null          // null means the user didn't fill this in
  notes: string | null
  watering_interval_days: number | null     // null means no reminder set
  fertilizing_interval_days: number | null  // null means no reminder set (Phase 12B)
  soil_type: string | null         // e.g. "Aroid mix" (Phase 12C)
  location: string | null          // e.g. "Living room — east window"
  pot_size: string | null          // e.g. "6 inch terracotta"
  acquired_date: string | null     // ISO date string, e.g. "2024-03-15"
  last_repotted_date: string | null
  tags: string[]                    // freeform tag strings, e.g. ["rare", "propagation"]
  pest_notes: string | null         // free-text notes on pest history
  last_treatment_date: string | null // date of most recent pest treatment
  // is_name_verified is true when the user has confirmed/corrected the species
  // name (Confirm chip in the dossier, manual species edit, or Add Plant
  // confirmation); false when it came from AI identification only. Column is
  // live in production (verified 2026-06-10). Phase 5 identity slice.
  is_name_verified?: boolean
  created_at: string
}

export type PlantPhoto = {
  id: string
  plant_id: string
  user_id: string
  storage_path: string     // path in Supabase Storage, e.g. "{user_id}/{plant_id}/{timestamp}.jpg"
  created_at: string
}

// Structured note categorization (Phase 15 — Gap 4). Applies only to `note` logs.
// Legacy rows carry null; UI renders them without a category badge.
export type NoteCategory = 'growth' | 'pest' | 'environment' | 'concern' | 'general'

// Allowed units for `measured` logs (Phase 15 — Gap 6). Legacy rows carry null
// on both value+unit and keep their free-text in `notes`.
export type MeasurementUnit = 'cm' | 'in' | 'mm' | 'ft' | 'leaves' | 'stems' | 'flowers' | 'pups'

export type CareLog = {
  id: string
  plant_id: string
  user_id: string
  // Primary actions (shown in the main quick-action bar):
  //   watered, fertilized, note
  // Secondary actions (shown in the expandable "More" row):
  //   repotted, pruned, misted, pest_treatment, moved, measured
  type: 'watered' | 'fertilized' | 'note' | 'repotted' | 'pruned' | 'misted' | 'pest_treatment' | 'moved' | 'measured'
  notes: string | null
  logged_at: string
  category: NoteCategory | null
  measurement_value: number | null
  measurement_unit: MeasurementUnit | null
}

export type AnalysisResult = {
  id: string
  plant_id: string
  user_id: string
  photo_id: string | null  // which photo this analysis was based on
  species: string | null
  health: string | null
  health_score: number | null  // 1–5 integer (Phase 12A); null for analyses before this was added
  care: string | null
  created_at: string
}

// ── Care recommendations (Phase 1 — the insight→task loop) ─────────────────
// One row per structured action the assistant proposes. Created by the client
// after an AI analysis (source 'analysis'); later phases add 'diagnosis' and
// 'seasonal' sources. The user resolves each row from Today or Plant Detail.

export type RecommendationSource = 'analysis' | 'diagnosis' | 'seasonal'
export type RecommendationUrgency = 'now' | 'soon' | 'routine'
export type RecommendationStatus = 'proposed' | 'accepted' | 'done' | 'dismissed' | 'expired'
export type DismissedReason = 'wrong' | 'already_done' | 'later'

// A proposed schedule change, stored as jsonb on the recommendation row.
// Nothing is applied until the user confirms it in the interval sheet.
export type IntervalSuggestion = {
  type: 'watering' | 'fertilizing'
  current_days: number | null    // null when the plant had no schedule
  suggested_days: number
  reason: string
}

export type CareRecommendation = {
  id: string
  plant_id: string
  user_id: string
  source: RecommendationSource
  source_id: string | null               // the analysis_results / diagnoses row it came from
  action: string                         // imperative, e.g. "Move out of direct afternoon sun"
  rationale: string | null               // why the assistant suggests it
  urgency: RecommendationUrgency
  due_date: string | null                // YYYY-MM-DD
  interval_suggestion: IntervalSuggestion | null
  status: RecommendationStatus
  dismissed_reason: DismissedReason | null
  created_at: string
  resolved_at: string | null
}

// Shape of one entry in the analyze-plant v2 `actions` array (already
// sanitized server-side: ≤3 entries, whitelisted urgency).
export type AnalysisAction = {
  action: string
  rationale: string
  urgency: RecommendationUrgency
  due_in_days: number | null
}

// Encyclopedic species reference data — fetched once per species via the
// fetch-species-info Edge Function and cached permanently in Supabase.
// Shared across all users (one row per species).
export type SpeciesProfile = {
  id: string
  species_name: string      // the lookup key — matches plants.species
  common_names: string | null
  scientific_name: string | null
  light: string | null
  watering: string | null
  humidity: string | null
  temperature: string | null
  soil: string | null
  toxicity: string | null
  common_problems: string | null
  growth_habits: string | null
  propagation: string | null
  pruning_tips: string | null       // how and when to prune; shape/health benefits
  disease_symptoms: string | null   // visual signs of disease, pests, nutrient deficiency
  seasonal_care: string | null      // season-specific care notes (Phase 12E); null for cached profiles before this was added
  fetched_at: string
  updated_at: string
}
