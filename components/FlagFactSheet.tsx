'use client'
// components/FlagFactSheet.tsx
// "Report an issue" bottom sheet for species-guide content (Phase 5 of
// docs/ASSISTANT-SPEC.md — the accuracy program). The shared species cache is
// AI-generated and served as authority; this is the correction signal: pick
// the field that looks wrong, optionally say why, and the flag lands in
// species_profile_flags for review under Settings → Flagged facts.
// No auto-correction — flags are for the owner's review only.

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Icon } from './Icon'

// The flaggable species_profiles columns, in display order.
export const FLAGGABLE_FIELDS: Array<{ key: string; label: string }> = [
  { key: 'light',            label: 'Light'            },
  { key: 'watering',         label: 'Watering'         },
  { key: 'humidity',         label: 'Humidity'         },
  { key: 'temperature',      label: 'Temperature'      },
  { key: 'soil',             label: 'Soil'             },
  { key: 'toxicity',         label: 'Toxicity'         },
  { key: 'common_problems',  label: 'Common problems'  },
  { key: 'growth_habits',    label: 'Growth'           },
  { key: 'propagation',      label: 'Propagation'      },
  { key: 'pruning_tips',     label: 'Pruning'          },
  { key: 'disease_symptoms', label: 'Disease symptoms' },
  { key: 'seasonal_care',    label: 'Seasonal care'    },
  { key: 'common_names',     label: 'Names'            },
]

export function flagFieldLabel(key: string): string {
  return FLAGGABLE_FIELDS.find(f => f.key === key)?.label ?? key
}

export function FlagFactSheet({
  speciesProfileId, speciesName, initialField, onClose, onFlagged,
}: {
  speciesProfileId: string
  speciesName: string
  initialField?: string | null   // preselected when opened from a specific section
  onClose: () => void
  onFlagged?: () => void         // caller shows its own confirmation toast
}) {
  const [field,  setField]  = useState<string | null>(initialField ?? null)
  const [note,   setNote]   = useState('')
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState<string | null>(null)

  async function submit() {
    if (!field || saving) return
    setSaving(true)
    setError(null)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setError('Not signed in.')
      setSaving(false)
      return
    }
    const { error: insErr } = await supabase.from('species_profile_flags').insert({
      species_profile_id: speciesProfileId,
      user_id: user.id,
      field,
      note: note.trim() || null,
    })
    if (insErr) {
      // Most likely cause: the Phase 5 migration hasn't been run yet.
      setError('Could not save the report — has the species_profile_flags migration been run?')
    } else {
      onFlagged?.()
      onClose()
    }
    setSaving(false)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end"
      style={{ background: 'rgba(0,0,0,0.4)' }}
      onClick={onClose}
    >
      <div
        className="bg-card rounded-t-2xl border-t border-rule p-5 pb-10 max-h-[85vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-serif italic text-[20px] text-ink">Report an issue</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-paper-alt">
            <Icon name="close" size={16} stroke={2} className="text-ink-muted" />
          </button>
        </div>
        <p className="font-mono text-[10px] tracking-[0.14em] uppercase text-ink-muted mb-4">
          {speciesName}
        </p>

        {/* Field picker */}
        <label className="block font-mono text-[10px] tracking-[0.14em] uppercase text-ink-muted mb-2">
          Which fact looks wrong?
        </label>
        <div className="flex flex-wrap gap-1.5 mb-4">
          {FLAGGABLE_FIELDS.map(f => (
            <button
              key={f.key}
              onClick={() => setField(prev => prev === f.key ? null : f.key)}
              className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${
                field === f.key
                  ? 'bg-ink text-paper border-ink'
                  : 'bg-transparent text-ink-soft border-rule'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Optional note */}
        <label className="block font-mono text-[10px] tracking-[0.14em] uppercase text-ink-muted mb-1.5">
          What&rsquo;s wrong? <span className="normal-case tracking-normal text-ink-muted/60">(optional)</span>
        </label>
        <textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="e.g. This species is toxic to cats — the guide says pet-safe."
          rows={3}
          className="w-full px-3.5 py-3 border border-rule rounded-brand bg-paper text-[13px] text-ink resize-none focus:outline-none focus:ring-1 focus:ring-accent"
        />

        {error && (
          <p className="mt-2 text-[12px] text-danger">{error}</p>
        )}

        <button
          onClick={submit}
          disabled={!field || saving}
          className="mt-4 w-full py-3 rounded-full bg-ink text-paper text-[13px] font-medium disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Submit report'}
        </button>
        <p className="mt-2.5 text-center font-mono text-[9px] tracking-[0.1em] uppercase text-ink-muted">
          Reports collect under Me &rarr; Flagged facts for review.
        </p>
      </div>
    </div>
  )
}
