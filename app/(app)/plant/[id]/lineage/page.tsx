'use client'
// app/(app)/plant/[id]/lineage/page.tsx
// Propagation graph — shows where this plant came from and where cuttings went.
//
// v1: local records only. Recipients are free-text (friend names). No cross-account
// linking yet — the data model is forward-compatible for a future v2.
//
// REQUIRED MIGRATION — run once in the Supabase SQL editor:
//
// create table if not exists propagations (
//   id uuid primary key default gen_random_uuid(),
//   user_id uuid not null references auth.users(id),
//   parent_plant_id uuid not null references plants(id) on delete cascade,
//   child_plant_id uuid references plants(id),
//   recipient_name text,
//   taken_on date not null,
//   status text not null
//     check (status in ('rooting','thriving','failed','unknown'))
//     default 'rooting',
//   note text
// );
// create index if not exists idx_propagations_parent on propagations(parent_plant_id);
// alter table propagations enable row level security;
// create policy "Users manage own propagations" on propagations
//   for all using (auth.uid() = user_id);
//
// Also add parent_propagation_id to plants if you want to track which propagation
// event created a plant:
// alter table plants
//   add column if not exists parent_propagation_id uuid references propagations(id);

import { createClient } from '@/lib/supabase/client'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useState, useCallback } from 'react'
import { BigTitle, HairlineButton } from '@/components/ui'
import { Icon } from '@/components/Icon'
import { PlantPhoto } from '@/components/PlantPhoto'
import { formatDate } from '@/lib/utils'
import type { Plant } from '@/lib/types'

// The status options that can be assigned to a propagation.
const STATUS_OPTIONS = ['rooting', 'thriving', 'failed', 'unknown'] as const
type PropStatus = typeof STATUS_OPTIONS[number]

interface Propagation {
  id: string
  user_id: string
  parent_plant_id: string
  child_plant_id: string | null
  recipient_name: string | null
  taken_on: string          // YYYY-MM-DD
  status: PropStatus
  note: string | null
}

// Color and label for each propagation status.
const STATUS_META: Record<PropStatus, { label: string; color: string }> = {
  rooting:  { label: 'Rooting',  color: '#B4571E' },
  thriving: { label: 'Thriving', color: '#4C6A48' },
  failed:   { label: 'Failed',   color: '#9B3A2E' },
  unknown:  { label: 'Unknown',  color: '#8A9389' },
}

type AddingState = {
  recipientName: string
  takenOn: string
  status: PropStatus
  note: string
}

const EMPTY_FORM: AddingState = {
  recipientName: '',
  takenOn: new Date().toISOString().split('T')[0],
  status: 'rooting',
  note: '',
}

export default function LineagePage() {
  const params   = useParams<{ id: string }>()
  const router   = useRouter()
  const supabase = createClient()
  const id       = params.id

  const [plant,        setPlant]        = useState<Plant | null>(null)
  const [propagations, setPropagations] = useState<Propagation[]>([])
  const [loading,      setLoading]      = useState(true)
  const [dbMissing,    setDbMissing]    = useState(false)

  // "Log a cutting" form state
  const [adding,     setAdding]     = useState(false)
  const [form,       setForm]       = useState<AddingState>(EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [error,      setError]      = useState<string | null>(null)

  // ── Load data ───────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true)
    const { data: plantRow } = await supabase
      .from('plants')
      .select('*')
      .eq('id', id)
      .single()
    setPlant(plantRow as Plant | null)

    // Gracefully handle the case where the propagations table doesn't exist yet.
    const { data: propRows, error: propErr } = await supabase
      .from('propagations')
      .select('*')
      .eq('parent_plant_id', id)
      .order('taken_on', { ascending: false })

    if (propErr?.code === '42P01') {
      // Table doesn't exist — show a friendly "run the migration" message.
      setDbMissing(true)
    } else {
      setPropagations((propRows ?? []) as Propagation[])
    }
    setLoading(false)
  }, [supabase, id])

  useEffect(() => { load() }, [load])

  // ── Add a propagation record ────────────────────────────────────────────
  async function handleAdd() {
    if (!form.recipientName.trim() && !form.note.trim()) {
      setError('Add at least a recipient name or a note.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not signed in')
      const { data, error: insertErr } = await supabase
        .from('propagations')
        .insert({
          parent_plant_id: id,
          user_id: session.user.id,
          recipient_name: form.recipientName.trim() || null,
          taken_on: form.takenOn,
          status: form.status,
          note: form.note.trim() || null,
        })
        .select()
        .single()
      if (insertErr) throw insertErr
      setPropagations(prev => [data as Propagation, ...prev])
      setAdding(false)
      setForm(EMPTY_FORM)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleStatusChange(propId: string, newStatus: PropStatus) {
    await supabase.from('propagations').update({ status: newStatus }).eq('id', propId)
    setPropagations(prev => prev.map(p => p.id === propId ? { ...p, status: newStatus } : p))
  }

  // ── Render ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-rule border-t-ink rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-paper flex flex-col pb-16">

      {/* Top chrome */}
      <div className="flex items-center justify-between px-3 pt-4 pb-2">
        <button
          onClick={() => router.back()}
          className="w-10 h-10 rounded-full flex items-center justify-center bg-card border border-rule"
          aria-label="Back"
        >
          <Icon name="back" size={18} className="text-ink" />
        </button>
        <div className="font-mono text-[10px] tracking-[1.6px] uppercase text-ink-muted">
          Lineage · {plant?.nickname ?? '…'}
        </div>
        <div className="w-10" />
      </div>

      {/* Header */}
      <div className="px-5 pt-3 pb-2">
        <BigTitle>The {plant?.nickname ?? 'plant'} family</BigTitle>
        <p className="text-[13px] text-ink-soft mt-2 leading-relaxed">
          Keep track of every cutting you share. A propagation record stays here
          as a permanent part of this plant&apos;s story.
        </p>
      </div>

      {/* Migration notice if propagations table doesn't exist */}
      {dbMissing && (
        <div className="mx-5 mt-3 p-4 bg-warn-soft border border-warn/30 rounded-[14px]">
          <div className="font-mono text-[9px] tracking-[1.4px] uppercase text-warn mb-1.5">
            Setup needed
          </div>
          <p className="text-[13px] text-ink leading-snug">
            The propagation table hasn&apos;t been created yet. Run the SQL migration
            in the Supabase editor (see the comment at the top of this file), then
            refresh this page.
          </p>
        </div>
      )}

      {/* This plant node — "You" */}
      {plant && (
        <div className="px-5 mt-5">
          <div className="font-mono text-[9px] tracking-[1.4px] uppercase text-ink-muted mb-2">
            § 01 · This plant
          </div>
          <div className="flex gap-3 items-stretch p-3 rounded-[14px] border-2 border-accent bg-card">
            <div className="w-14 h-[70px] rounded-[8px] overflow-hidden border border-rule flex-shrink-0">
              <PlantPhoto name={plant.nickname} showLabel={false} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-mono text-[9px] tracking-[1.4px] uppercase text-accent">You</div>
              <div className="font-serif italic text-[19px] text-ink leading-tight mt-0.5">
                {plant.nickname}
              </div>
              {plant.species && (
                <div className="text-[12px] text-ink-soft mt-0.5">{plant.species}</div>
              )}
              {plant.acquired_date && (
                <div className="text-[11px] text-ink-muted mt-1">
                  Since {formatDate(plant.acquired_date)}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Connector dot */}
      {!dbMissing && (
        <div className="flex justify-center my-1">
          <div className="flex flex-col items-center gap-0">
            <div className="w-px h-4 bg-rule" />
            <div className="w-3 h-3 rounded-full border border-rule bg-paper" />
            <div className="w-px h-4 bg-rule" />
          </div>
        </div>
      )}

      {/* Propagations (cuttings given away) */}
      {!dbMissing && (
        <div className="px-5">
          <div className="font-mono text-[9px] tracking-[1.4px] uppercase text-ink-muted mb-3">
            § 02 · Cuttings shared · {propagations.length}
          </div>

          {propagations.length === 0 && !adding && (
            <div className="p-5 bg-card border border-rule rounded-[14px] text-center">
              <div className="font-serif italic text-[16px] text-ink mb-1">No cuttings recorded yet.</div>
              <div className="text-[13px] text-ink-soft">
                Every cutting you give away can live here — a permanent part of this plant&apos;s story.
              </div>
            </div>
          )}

          {propagations.map(prop => (
            <div key={prop.id} className="mb-3">
              <PropagationCard
                prop={prop}
                onStatusChange={(s) => handleStatusChange(prop.id, s)}
              />
            </div>
          ))}

          {/* "Log a cutting" form */}
          {adding ? (
            <div className="mt-2 p-4 bg-card border border-rule rounded-[14px]">
              <div className="font-mono text-[9px] tracking-[1.4px] uppercase text-ink-muted mb-3">
                Log a cutting
              </div>

              <div className="flex flex-col gap-3">
                <div>
                  <label className="block font-mono text-[10px] uppercase tracking-wider text-ink-soft mb-1">
                    Recipient
                  </label>
                  <input
                    type="text"
                    placeholder="Who got the cutting?"
                    value={form.recipientName}
                    onChange={e => setForm(f => ({ ...f, recipientName: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl border border-rule bg-paper text-ink text-[14px]
                      placeholder:text-ink-muted outline-none focus:border-accent"
                  />
                </div>

                <div>
                  <label className="block font-mono text-[10px] uppercase tracking-wider text-ink-soft mb-1">
                    Date taken
                  </label>
                  <input
                    type="date"
                    value={form.takenOn}
                    onChange={e => setForm(f => ({ ...f, takenOn: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl border border-rule bg-paper text-ink text-[14px]
                      outline-none focus:border-accent"
                  />
                </div>

                <div>
                  <label className="block font-mono text-[10px] uppercase tracking-wider text-ink-soft mb-1.5">
                    Status
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {STATUS_OPTIONS.map(s => (
                      <button
                        key={s}
                        onClick={() => setForm(f => ({ ...f, status: s }))}
                        className="px-3 py-1.5 rounded-full text-[12px] font-medium border transition-colors"
                        style={{
                          background: form.status === s ? STATUS_META[s].color : 'transparent',
                          color: form.status === s ? '#F4EFE6' : STATUS_META[s].color,
                          borderColor: STATUS_META[s].color + '60',
                        }}
                      >
                        {STATUS_META[s].label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block font-mono text-[10px] uppercase tracking-wider text-ink-soft mb-1">
                    Note (optional)
                  </label>
                  <textarea
                    placeholder="Any notes about this cutting…"
                    value={form.note}
                    onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                    rows={2}
                    className="w-full px-3 py-2 rounded-xl border border-rule bg-paper text-ink text-[14px]
                      placeholder:text-ink-muted outline-none focus:border-accent resize-none"
                  />
                </div>

                {error && <p className="text-danger text-[13px]">{error}</p>}

                <div className="flex gap-2">
                  <div className="flex-1">
                    <HairlineButton
                      icon="check"
                      onClick={handleAdd}
                      disabled={submitting}
                      fullWidth
                    >
                      {submitting ? 'Saving…' : 'Save cutting'}
                    </HairlineButton>
                  </div>
                  <div className="flex-1">
                    <HairlineButton
                      variant="outline"
                      onClick={() => { setAdding(false); setForm(EMPTY_FORM); setError(null) }}
                      fullWidth
                    >
                      Cancel
                    </HairlineButton>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            !dbMissing && (
              <div
                className="mt-3 p-4 rounded-[14px] border"
                style={{ background: '#B9C9A840', borderColor: '#4C6A4830' }}
              >
                <div className="font-serif italic text-[17px] text-ink mb-1.5">
                  Sharing a cutting?
                </div>
                <p className="text-[13px] text-ink-soft leading-relaxed">
                  Record it here — who got it, when, and how it&apos;s doing. It becomes part of
                  {plant ? ` ${plant.nickname}` : " this plant"}&apos;s permanent history.
                </p>
                <div className="mt-3">
                  <HairlineButton
                    icon="scissors"
                    fullWidth
                    onClick={() => setAdding(true)}
                  >
                    Log a cutting
                  </HairlineButton>
                </div>
              </div>
            )
          )}
        </div>
      )}

      {/* Privacy note */}
      <div className="mt-8 px-5">
        <div className="font-mono text-[9px] tracking-[1.6px] uppercase text-ink-muted text-center">
          Private to your collection · no public discovery
        </div>
      </div>
    </div>
  )
}

// ── PropagationCard component ──────────────────────────────────────────────

function PropagationCard({
  prop,
  onStatusChange,
}: {
  prop: Propagation
  onStatusChange: (s: PropStatus) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const meta = STATUS_META[prop.status]

  return (
    <div className="p-3.5 bg-card border border-rule rounded-[14px]">
      <div className="flex items-start gap-3">
        {/* Placeholder avatar (no photo for recipients) */}
        <div
          className="w-12 h-16 rounded-[8px] flex-shrink-0 flex items-center justify-center"
          style={{ background: '#D9D0BD' }}
        >
          <Icon name="scissors" size={18} className="text-ink-muted" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <div
              className="font-mono text-[9px] tracking-[1.4px] uppercase"
              style={{ color: meta.color }}
            >
              Cutting · {meta.label}
            </div>
          </div>
          <div className="font-serif italic text-[17px] text-ink leading-tight mt-0.5">
            {prop.recipient_name ?? 'Unnamed recipient'}
          </div>
          <div className="text-[11px] text-ink-muted mt-1">
            Taken {formatDate(prop.taken_on)}
          </div>
          {prop.note && (
            <div className="font-serif italic text-[13px] text-ink-soft mt-1.5 leading-snug">
              &quot;{prop.note}&quot;
            </div>
          )}
        </div>
        <button
          onClick={() => setExpanded(e => !e)}
          className="w-7 h-7 flex items-center justify-center"
          aria-label="Toggle status options"
        >
          <Icon name="chev-down" size={14} className="text-ink-muted" />
        </button>
      </div>

      {/* Expandable status picker */}
      {expanded && (
        <div className="mt-3 pt-3 border-t border-rule flex flex-wrap gap-1.5">
          <div className="font-mono text-[9px] tracking-wider uppercase text-ink-muted w-full mb-1">
            Update status
          </div>
          {STATUS_OPTIONS.map(s => (
            <button
              key={s}
              onClick={() => { onStatusChange(s); setExpanded(false) }}
              className="px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors"
              style={{
                background: prop.status === s ? STATUS_META[s].color : 'transparent',
                color: prop.status === s ? '#F4EFE6' : STATUS_META[s].color,
                borderColor: STATUS_META[s].color + '60',
              }}
            >
              {STATUS_META[s].label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
