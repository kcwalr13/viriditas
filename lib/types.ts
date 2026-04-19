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
  // is_name_verified is true when the user has manually confirmed/corrected the
  // species name; false (or absent) when it came from AI identification only.
  // Migration required before this persists: see ROADMAP_CURRENT.md
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
