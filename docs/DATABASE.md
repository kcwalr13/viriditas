# Viriditas — Database Reference

**Purpose:** the single place that describes the Supabase (PostgreSQL) schema — tables,
columns, constraints, indexes, RLS, storage — and collects every migration the project has
recorded. The app-facing view of these shapes is `lib/types.ts`.

> **Provenance caveat:** this project has no `supabase/migrations/` directory. The original
> tables were created ad-hoc in the Supabase SQL editor and that DDL was never committed.
> Everything below is assembled from the recorded migration SQL, `lib/types.ts`, and the
> Edge Function code. Where the repo cannot prove a detail, it is marked **TODO/unverified**.
> Recommended follow-up: run `supabase db dump --schema public` against the production
> project and commit the output as the authoritative baseline.

---

## Tables

### `plants`

One row per registered plant, owned by a user.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | uuid | references `auth.users` |
| `nickname` | text | required by the app |
| `species` | text, nullable | set only when the user types/edits it manually (AI IDs live in `analysis_results.species` — see "Two species fields" in [CLAUDE.md](../CLAUDE.md)) |
| `location` | text, nullable | e.g. "Living room — east window" |
| `pot_size` | text, nullable | |
| `notes` | text, nullable | owner's freeform notes; passed to the AI as context |
| `watering_interval_days` | int, nullable | null = no schedule |
| `fertilizing_interval_days` | int, nullable | null = no schedule |
| `soil_type` | text, nullable | |
| `acquired_date` | date, nullable | YYYY-MM-DD |
| `last_repotted_date` | date, nullable | YYYY-MM-DD |
| `tags` | text[], default `'{}'` | freeform tags |
| `pest_notes` | text, nullable | pest history; passed to the AI |
| `last_treatment_date` | date, nullable | most recent pest treatment |
| `created_at` | timestamptz | |
| `is_name_verified` | boolean, default `false` — **confirmed live in production (2026-06-10)** | true when the owner asserted the species name (dossier Confirm chip, manual species edit, or Add Plant confirm/typed name — all v1.6.0). Read by `analyze-plant`'s identity context so the AI hedges unverified species claims. |

### `photos`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `plant_id` | uuid | |
| `user_id` | uuid | |
| `storage_path` | text | path in the `plant-photos` bucket: `{userId}/{plantId}/{timestamp}.{ext}` |
| `created_at` | timestamptz | cover photo = most recent; Time-lapse reads oldest-first |

### `care_logs`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `plant_id` | uuid | |
| `user_id` | uuid | |
| `type` | text, CHECK | one of: `watered`, `fertilized`, `note`, `repotted`, `pruned`, `misted`, `pest_treatment`, `moved`, `measured` |
| `notes` | text, nullable | |
| `logged_at` | timestamptz | |
| `category` | text, nullable, CHECK | only on `note` rows: `growth`, `pest`, `environment`, `concern`, `general`. Legacy rows are NULL (deliberately not backfilled) |
| `measurement_value` | numeric, nullable | only on `measured` rows |
| `measurement_unit` | text, nullable, CHECK | `cm`, `in`, `mm`, `ft`, `leaves`, `stems`, `flowers`, `pups` |

Partial index: `idx_care_logs_plant_category` on `(plant_id, category) WHERE category IS NOT NULL`.

### `analysis_results`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `plant_id` | uuid | |
| `user_id` | uuid | |
| `photo_id` | uuid, nullable | which photo was analyzed |
| `species` | text, nullable | the AI's identification |
| `health` | text, nullable | 2–3 sentence assessment (column is `health`, **not** `health_summary`) |
| `health_score` | int, nullable, CHECK 1–5 | null on analyses predating the column |
| `care` | text, nullable | recommendations (column is `care`, **not** `care_tips`) |
| `created_at` | timestamptz | |

### `species_profiles`

Shared encyclopedic cache — one row per species, **shared across all users**, written by the
`fetch-species-info` Edge Function with the service role.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `species_name` | text, **unique** | lookup key; upsert conflict target |
| `common_names`, `scientific_name` | text, nullable | |
| `light`, `watering`, `humidity`, `temperature`, `soil`, `toxicity` | text | bullet-formatted (`\n• `) by the prompt |
| `common_problems`, `growth_habits`, `propagation` | text | |
| `pruning_tips`, `disease_symptoms`, `seasonal_care` | text, nullable | added later; NULL on older cached rows until refreshed |
| `fetched_at`, `updated_at` | timestamptz | |

### `diagnoses` *(applied in production 2026-06-09)*

Saved results of the Diagnose question flow. Full verified DDL:

```sql
create table if not exists diagnoses (
  id uuid primary key default gen_random_uuid(),
  plant_id uuid not null references plants(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  question_path jsonb not null,
  verdict_id text not null,
  verdict_title text not null,
  confidence text not null,
  reasoning text[] not null,
  next_steps jsonb not null
);
create index if not exists idx_diagnoses_plant on diagnoses(plant_id, created_at desc);
alter table diagnoses enable row level security;
create policy "Users manage own diagnoses" on diagnoses
  for all using (auth.uid() = user_id);
```

### `diagnosis_sessions` *(v1.7.0 — Phase 2 of docs/ASSISTANT-SPEC.md; **applied in production 2026-06-10** — verified: 10 columns, RLS on, 1 policy)*

One row per interactive AI examination. **All writes happen in the `diagnose-plant`
Edge Function with the service role** (transcript and ask-count integrity stay out of
client hands) — except status flips to `abandoned`, which the client performs when the
user starts fresh or a session ages past 24h. The client reads sessions to offer
"Resume examination". Full DDL:

```sql
create table if not exists diagnosis_sessions (
  id uuid primary key default gen_random_uuid(),
  plant_id uuid not null references plants(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  status text not null check (status in ('active','concluded','abandoned')) default 'active',
  turns jsonb not null default '[]'::jsonb,
  ask_count int not null default 0,
  verdict jsonb,
  diagnosis_id uuid references diagnoses(id),
  created_at timestamptz not null default now(),
  concluded_at timestamptz
);
create index if not exists idx_diag_sessions_plant on diagnosis_sessions(plant_id, created_at desc);
alter table diagnosis_sessions enable row level security;
create policy "Users manage own diagnosis_sessions" on diagnosis_sessions
  for all using (auth.uid() = user_id);
```

Column notes:
- `turns` — the transcript, an array of
  `{ role: 'user'|'assistant', type: 'opening'|'photo'|'answer'|'question'|'photo_request'|'verdict', text?, photo_path?, options?, why?, at }`.
- `ask_count` — server-tracked count of question/photo-request turns; hard cap 3, after
  which the function forces a verdict.
- `verdict` — jsonb `{ title, confidence, reasoning[], next_steps[], differential|null, follow_up|null }`,
  set when concluded. `diagnosis_id` links the matching `diagnoses` history row
  (`verdict_id = 'ai-session'`).
- Session photos live in storage under `{userId}/{plantId}/diagnosis/…` and are **not**
  rows in `photos` (keeps Timelapse and the photo strip clean).

### `species_profile_flags` *(v1.8.0 — Phase 5 of docs/ASSISTANT-SPEC.md; **applied in production 2026-06-11** — verified: 6 columns, RLS on, 1 policy)*

User-reported issues with cached species-guide content (the accuracy program's
correction signal). Created from the "Report an issue" sheet on the Plant Detail species
guide and Explore profiles; listed (and resolved by deletion) under Me → Flagged facts.
**No auto-correction** — flags are for review only. The app degrades gracefully when
this table is missing. Full DDL:

```sql
create table if not exists species_profile_flags (
  id uuid primary key default gen_random_uuid(),
  species_profile_id uuid not null references species_profiles(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  field text not null,
  note text,
  created_at timestamptz not null default now()
);
alter table species_profile_flags enable row level security;
create policy "Users manage own species_profile_flags" on species_profile_flags
  for all using (auth.uid() = user_id);
```

Column notes:
- `field` — which `species_profiles` column looks wrong (e.g. `toxicity`, `watering`);
  the app constrains values to the flaggable-field list in `components/FlagFactSheet.tsx`
  (no DB CHECK — the spec's Appendix A defines none).
- Reads join the species name via the `species_profile_id` FK.

### `care_recommendations` *(v1.6.0 — Phase 1 of docs/ASSISTANT-SPEC.md; **applied in production 2026-06-10** — verified: 14 columns, RLS on, 1 policy)*

Structured next steps proposed by the assistant. Created by the **client** after an AI
analysis (one row per action, plus one carrying an `interval_suggestion` when present)
or after an AI examination verdict (`source='diagnosis'`, v1.7.0 — one row per next step
plus a scheduled follow-up check); resolved by the user from Today or Plant Detail.
Phase 3 adds the `seasonal` source. The app degrades gracefully when this table is
missing (queries soft-fail to empty lists), but Phase 1 features need it. Full DDL:

```sql
create table if not exists care_recommendations (
  id uuid primary key default gen_random_uuid(),
  plant_id uuid not null references plants(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  source text not null check (source in ('analysis','diagnosis','seasonal')),
  source_id uuid,
  action text not null,
  rationale text,
  urgency text not null check (urgency in ('now','soon','routine')) default 'routine',
  due_date date,
  interval_suggestion jsonb,
  status text not null check (status in ('proposed','accepted','done','dismissed','expired')) default 'proposed',
  dismissed_reason text check (dismissed_reason in ('wrong','already_done','later')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists idx_care_recs_user_status on care_recommendations(user_id, status);
create index if not exists idx_care_recs_plant on care_recommendations(plant_id, created_at desc);
alter table care_recommendations enable row level security;
create policy "Users manage own care_recommendations" on care_recommendations
  for all using (auth.uid() = user_id);
```

Column notes:
- `source_id` — the `analysis_results` or `diagnoses` row the recommendation came
  from; intentionally no FK so analyses can be deleted without losing the task.
- `interval_suggestion` — jsonb `{ type: 'watering'|'fertilizing', current_days, suggested_days, reason }`;
  only applied to `plants.*_interval_days` after the user confirms in the interval sheet.
- `status` lifecycle: `proposed` → `accepted` → `done`, or `proposed/accepted` →
  `dismissed` (with `dismissed_reason`), or `proposed` → `expired` (client marks
  proposals older than 14 days on Today load). `resolved_at` set on done/dismissed/expired.

### `propagations` *(applied in production 2026-06-09)*

Propagation/lineage records. Full verified DDL:

```sql
create table if not exists propagations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  parent_plant_id uuid not null references plants(id) on delete cascade,
  child_plant_id uuid references plants(id),
  recipient_name text,
  taken_on date not null,
  status text not null check (status in ('rooting','thriving','failed','unknown')) default 'rooting',
  note text
);
create index if not exists idx_propagations_parent on propagations(parent_plant_id);
alter table propagations enable row level security;
create policy "Users manage own propagations" on propagations
  for all using (auth.uid() = user_id);
```

---

## Row Level Security

- RLS is enabled on all tables.
- `diagnoses` and `propagations` policies are verified above: `for all using (auth.uid() = user_id)`.
- **TODO/unverified:** the exact policy text for `plants`, `photos`, `care_logs`,
  `analysis_results`, and `species_profiles` was created in the SQL editor and never
  committed. The observable behavior implies per-user `auth.uid() = user_id` policies on the
  first four, and `species_profiles` readable by authenticated users but written only via the
  service role (the Edge Function). Export the real policies with `supabase db dump` before
  relying on the details.

## Storage

- Bucket: **`plant-photos`**, public reads (Edge Functions and `next/image` fetch photos via
  `/storage/v1/object/public/plant-photos/...`).
- Upload path convention: `{userId}/{plantId}/{timestamp}.{ext}`, uploaded from the browser
  with the file's own MIME type.
- **Diagnosis session photos** (v1.7.0) upload under
  `{userId}/{plantId}/diagnosis/{sessionFolder}/{timestamp}.{ext}` and get **no `photos`
  row** — they belong to the examination transcript, not the plant's photo journal.
  `diagnose-plant` only accepts photo paths under the caller's own
  `{userId}/{plantId}/diagnosis/` prefix (path-traversal and cross-user access rejected).
- `analyze-plant` refuses to fetch any image outside this bucket (SSRF guard).
- Deleting a plant first removes all its files under `plant-photos/{userId}/{plantId}/`,
  including the nested `diagnosis/{sessionFolder}/` photos (storage `list()` is not
  recursive, so the delete flow walks the diagnosis subfolders explicitly — v1.7.0).
- **TODO/unverified:** the bucket's storage policies (who can upload/delete which paths) are
  not recorded in the repo.

---

## Recorded incremental migrations

These ran against production during development (all verified from session records, in
roughly chronological order). On a fresh project you don't need them — use the baseline
below instead.

```sql
-- Phase 13 (2026-04): tags + pest tracking
ALTER TABLE plants
  ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS pest_notes text,
  ADD COLUMN IF NOT EXISTS last_treatment_date date;

-- Phase 12A: health score
ALTER TABLE analysis_results
  ADD COLUMN IF NOT EXISTS health_score int CHECK (health_score BETWEEN 1 AND 5);

-- Phase 11F/12E: extra species profile sections
ALTER TABLE species_profiles
  ADD COLUMN IF NOT EXISTS pruning_tips text,
  ADD COLUMN IF NOT EXISTS disease_symptoms text,
  ADD COLUMN IF NOT EXISTS seasonal_care text;

-- Phase 15E: measured care log type
ALTER TABLE care_logs DROP CONSTRAINT IF EXISTS care_logs_type_check;
ALTER TABLE care_logs ADD CONSTRAINT care_logs_type_check
  CHECK (type IN ('watered','fertilized','note','repotted','pruned','misted','pest_treatment','moved','measured'));

-- Phase 15 (Gaps 4 & 6): structured journaling
ALTER TABLE care_logs
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS measurement_value numeric,
  ADD COLUMN IF NOT EXISTS measurement_unit text;

ALTER TABLE care_logs DROP CONSTRAINT IF EXISTS care_logs_category_check;
ALTER TABLE care_logs ADD CONSTRAINT care_logs_category_check
  CHECK (category IS NULL OR category IN ('growth','pest','environment','concern','general'));

ALTER TABLE care_logs DROP CONSTRAINT IF EXISTS care_logs_measurement_unit_check;
ALTER TABLE care_logs ADD CONSTRAINT care_logs_measurement_unit_check
  CHECK (measurement_unit IS NULL OR measurement_unit IN ('cm','in','mm','ft','leaves','stems','flowers','pups'));

CREATE INDEX IF NOT EXISTS idx_care_logs_plant_category
  ON care_logs (plant_id, category)
  WHERE category IS NOT NULL;

-- Written 2026-04-19; confirmed applied in production 2026-06-10
ALTER TABLE plants ADD COLUMN IF NOT EXISTS is_name_verified boolean DEFAULT false;
```

Plus the `diagnoses` and `propagations` blocks above (applied 2026-06-09), the
`care_recommendations` block (applied 2026-06-10), the `diagnosis_sessions` block
(applied 2026-06-10), and the `species_profile_flags` block above (**v1.8.0 — NOT yet
applied in production**; run it in the Supabase SQL editor before using fact flagging).

> Phase 15 note: the journaling columns are nullable with no backfill **on purpose** —
> backfilling `'general'` onto old notes would mislead the AI into treating uncategorized
> observations as deliberately tagged.

---

## Fresh-project baseline (reconstructed — verify before trusting)

For standing up a brand-new Supabase project. **This DDL is reconstructed from the
documented schema, not copied from production** — column names, constraints, and indexes
match everything recorded above, but details like NOT NULL choices on older columns are
best-effort. Diff against a `supabase db dump` of production if exactness matters.

```sql
create table if not exists plants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  nickname text not null,
  species text,
  location text,
  pot_size text,
  notes text,
  watering_interval_days int,
  fertilizing_interval_days int,
  soil_type text,
  acquired_date date,
  last_repotted_date date,
  tags text[] default '{}',
  pest_notes text,
  last_treatment_date date,
  is_name_verified boolean default false,
  created_at timestamptz not null default now()
);

create table if not exists photos (
  id uuid primary key default gen_random_uuid(),
  plant_id uuid not null references plants(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  storage_path text not null,
  created_at timestamptz not null default now()
);

create table if not exists care_logs (
  id uuid primary key default gen_random_uuid(),
  plant_id uuid not null references plants(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  type text not null check (type in ('watered','fertilized','note','repotted','pruned','misted','pest_treatment','moved','measured')),
  notes text,
  category text check (category is null or category in ('growth','pest','environment','concern','general')),
  measurement_value numeric,
  measurement_unit text check (measurement_unit is null or measurement_unit in ('cm','in','mm','ft','leaves','stems','flowers','pups')),
  logged_at timestamptz not null default now()
);
create index if not exists idx_care_logs_plant_category
  on care_logs (plant_id, category) where category is not null;

create table if not exists analysis_results (
  id uuid primary key default gen_random_uuid(),
  plant_id uuid not null references plants(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  photo_id uuid references photos(id),
  species text,
  health text,
  health_score int check (health_score between 1 and 5),
  care text,
  created_at timestamptz not null default now()
);

create table if not exists species_profiles (
  id uuid primary key default gen_random_uuid(),
  species_name text not null unique,
  common_names text,
  scientific_name text,
  light text,
  watering text,
  humidity text,
  temperature text,
  soil text,
  toxicity text,
  common_problems text,
  growth_habits text,
  propagation text,
  pruning_tips text,
  disease_symptoms text,
  seasonal_care text,
  fetched_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Per-user RLS on the four personal tables
alter table plants enable row level security;
create policy "Users manage own plants" on plants
  for all using (auth.uid() = user_id);
alter table photos enable row level security;
create policy "Users manage own photos" on photos
  for all using (auth.uid() = user_id);
alter table care_logs enable row level security;
create policy "Users manage own care logs" on care_logs
  for all using (auth.uid() = user_id);
alter table analysis_results enable row level security;
create policy "Users manage own analyses" on analysis_results
  for all using (auth.uid() = user_id);

-- Shared cache: authenticated users read; writes happen via service role only
alter table species_profiles enable row level security;
create policy "Authenticated users read species profiles" on species_profiles
  for select using (auth.role() = 'authenticated');
```

Then run the `diagnoses`, `propagations`, `care_recommendations`, `diagnosis_sessions`,
and `species_profile_flags` blocks from the Tables section, and create the public
`plant-photos` storage bucket (see [SETUP.md](SETUP.md)).
