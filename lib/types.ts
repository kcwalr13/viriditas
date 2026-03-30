// Shared TypeScript types used throughout the app.
// When we fetch data from Supabase, it will match these shapes.

export type Plant = {
  id: string
  user_id: string
  nickname: string
  species: string | null          // null means the user didn't fill this in
  notes: string | null
  watering_interval_days: number | null  // null means no reminder set
  location: string | null         // e.g. "Living room — east window"
  pot_size: string | null         // e.g. "6 inch terracotta"
  acquired_date: string | null    // ISO date string, e.g. "2024-03-15"
  last_repotted_date: string | null
  created_at: string
}

export type PlantPhoto = {
  id: string
  plant_id: string
  user_id: string
  storage_path: string     // path in Supabase Storage, e.g. "{user_id}/{plant_id}/{timestamp}.jpg"
  created_at: string
}

export type CareLog = {
  id: string
  plant_id: string
  user_id: string
  // Primary actions (shown in the main quick-action bar):
  //   watered, fertilized, note
  // Secondary actions (shown in the expandable "More" row):
  //   repotted, pruned, misted, pest_treatment, moved
  type: 'watered' | 'fertilized' | 'note' | 'repotted' | 'pruned' | 'misted' | 'pest_treatment' | 'moved'
  notes: string | null
  logged_at: string
}

export type AnalysisResult = {
  id: string
  plant_id: string
  user_id: string
  photo_id: string | null  // which photo this analysis was based on
  species: string | null
  health: string | null
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
  fetched_at: string
  updated_at: string
}
