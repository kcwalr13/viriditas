// Shared TypeScript types used throughout the app.
// When we fetch data from Supabase, it will match these shapes.

export type Plant = {
  id: string
  user_id: string
  nickname: string
  species: string | null          // null means the user didn't fill this in
  notes: string | null
  watering_interval_days: number | null  // null means no reminder set
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
  type: 'watered' | 'fertilized' | 'note'
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
