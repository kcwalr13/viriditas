'use client'
// app/(app)/settings/page.tsx
// Me — profile + account actions. Accessed via the "Me" tab.
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { BigTitle, SectionLabel } from '@/components/ui'
import { Icon } from '@/components/Icon'
import { computeStreak, computeMaxStreak, relativeTime } from '@/lib/utils'
import pkg from '@/package.json'

export default function MePage() {
  const router   = useRouter()
  const supabase = createClient()

  const [email,      setEmail]      = useState<string | null>(null)
  const [signingOut, setSigningOut] = useState(false)
  const [exporting,  setExporting]  = useState(false)
  const [stats, setStats] = useState<{ plants: number; logs: number; analyses: number; streak: number; maxStreak: number } | null>(null)
  const [oldestPlant, setOldestPlant] = useState<{ nickname: string; months: number } | null>(null)
  const [topCareType, setTopCareType] = useState<string | null>(null)
  const [activeDay,   setActiveDay]   = useState<string | null>(null)
  const [lastTended,  setLastTended]  = useState<{ nickname: string; loggedAt: string } | null>(null)
  const [tendedThisWeek, setTendedThisWeek] = useState<number | null>(null)
  const [locationBreakdown, setLocationBreakdown] = useState<Array<{ location: string; count: number }> | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      setEmail(user.email ?? null)
      const oneYearAgo = new Date()
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)
      const [{ count: plants }, { count: logs }, { count: analyses }, { data: streakLogs }, { data: allPlants }, { data: careTypes }, { data: allPlantNames }, { data: lastLog }] = await Promise.all([
        supabase.from('plants').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
        supabase.from('care_logs').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
        supabase.from('analysis_results').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
        supabase.from('care_logs').select('logged_at').eq('user_id', user.id).gte('logged_at', oneYearAgo.toISOString()),
        supabase.from('plants').select('nickname, acquired_date').eq('user_id', user.id).not('acquired_date', 'is', null),
        supabase.from('care_logs').select('type, logged_at, plant_id').eq('user_id', user.id),
        supabase.from('plants').select('id, nickname, location').eq('user_id', user.id),
        supabase.from('care_logs').select('plant_id, logged_at').eq('user_id', user.id).order('logged_at', { ascending: false }).limit(1),
      ])
      const streakTimestamps = (streakLogs ?? []).map(l => l.logged_at)
      const streak = computeStreak(streakTimestamps)
      const maxStreak = computeMaxStreak(streakTimestamps)
      setStats({ plants: plants ?? 0, logs: logs ?? 0, analyses: analyses ?? 0, streak, maxStreak })
      // Most-logged care type + most-active day of week + plants tended this week
      if (careTypes && careTypes.length > 0) {
        const sevenDaysAgo = Date.now() - 7 * 86_400_000
        const thisWeekPlants = new Set(careTypes.filter(l => new Date(l.logged_at).getTime() >= sevenDaysAgo).map(l => l.plant_id))
        setTendedThisWeek(thisWeekPlants.size)
        const freq: Record<string, number> = {}
        const dayFreq: Record<number, number> = {}
        for (const { type, logged_at } of careTypes) {
          freq[type] = (freq[type] ?? 0) + 1
          const dow = new Date(logged_at).getDay()
          dayFreq[dow] = (dayFreq[dow] ?? 0) + 1
        }
        const top = Object.entries(freq).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
        setTopCareType(top)
        const topDay = Object.entries(dayFreq).sort((a, b) => b[1] - a[1])[0]
        if (topDay) {
          const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
          setActiveDay(days[Number(topDay[0])])
        }
      }
      // Most recently tended plant
      if (lastLog && lastLog.length > 0 && allPlantNames) {
        const log = lastLog[0]
        const plant = allPlantNames.find(p => p.id === log.plant_id)
        if (plant) setLastTended({ nickname: plant.nickname, loggedAt: log.logged_at })
      }
      // Location breakdown
      if (allPlantNames) {
        const locMap = new Map<string, number>()
        for (const p of allPlantNames) {
          const loc = (p as { location?: string | null }).location ?? 'Unassigned'
          locMap.set(loc, (locMap.get(loc) ?? 0) + 1)
        }
        const breakdown = Array.from(locMap.entries())
          .map(([location, count]) => ({ location, count }))
          .sort((a, b) => b.count - a.count)
        if (breakdown.some(b => b.location !== 'Unassigned')) setLocationBreakdown(breakdown)
      }
      // Find oldest plant by acquired_date
      if (allPlants && allPlants.length > 0) {
        const sorted = [...allPlants].sort((a, b) =>
          new Date(a.acquired_date!).getTime() - new Date(b.acquired_date!).getTime()
        )
        const oldest = sorted[0]
        const months = Math.floor((Date.now() - new Date(`${oldest.acquired_date}T12:00:00`).getTime()) / (86_400_000 * 30.44))
        if (months >= 1) setOldestPlant({ nickname: oldest.nickname, months })
      }
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleExport() {
    setExporting(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const [{ data: plants }, { data: logs }, { data: analyses }, { data: photos }] = await Promise.all([
        supabase.from('plants').select('*').eq('user_id', user.id),
        supabase.from('care_logs').select('*').eq('user_id', user.id),
        supabase.from('analysis_results').select('*').eq('user_id', user.id),
        supabase.from('photos').select('*').eq('user_id', user.id),
      ])
      const payload = JSON.stringify({ exportedAt: new Date().toISOString(), plants, care_logs: logs, analysis_results: analyses, photos }, null, 2)
      const blob = new Blob([payload], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `viriditas-export-${new Date().toISOString().slice(0, 10)}.json`; a.click()
      URL.revokeObjectURL(url)
    } finally {
      setExporting(false)
    }
  }

  async function handleSignOut() {
    const confirmed = window.confirm('Sign out of Viriditas?')
    if (!confirmed) return
    setSigningOut(true)
    await supabase.auth.signOut()
    router.push('/sign-in')
    router.refresh()
  }

  return (
    <div className="pb-8">
      {/* ── Header ────────────────────────────────────────────────────── */}
      <div className="px-5 pt-9 pb-2">
        <div className="font-mono text-[10px] tracking-[0.24em] uppercase text-ink-muted mb-2">
          Account
        </div>
        <BigTitle italic>Me</BigTitle>
        <p className="text-sm text-ink-soft mt-2">
          Your signed-in identity, app preferences, and a bit about Viriditas.
        </p>
      </div>

      {/* ── Identity card ─────────────────────────────────────────────── */}
      <SectionLabel number="§ 01" title="Signed in" />
      <div className="mx-5 px-4 py-3.5 bg-card border border-rule rounded-brand-lg flex items-center gap-3.5">
        <div className="w-11 h-11 rounded-full bg-accent-soft flex items-center justify-center shrink-0">
          <Icon name="heart" size={18} stroke={1.9} className="text-accent" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-mono text-[10px] tracking-[0.12em] uppercase text-ink-muted">
            Email
          </div>
          <div className="font-serif italic text-[17px] text-ink truncate">
            {email ?? 'Loading…'}
          </div>
        </div>
      </div>

      {/* ── Stats ─────────────────────────────────────────────────────── */}
      <SectionLabel number="§ 02" title="Your collection" />
      <div className="mx-5 grid grid-cols-2 gap-px bg-rule rounded-brand-lg overflow-hidden border border-rule">
        {[
          { label: 'Plants',    value: stats?.plants   ?? '—', icon: 'leaf'    as const },
          { label: 'Care logs', value: stats?.logs     ?? '—', icon: 'drop'    as const },
          { label: 'Analyses',  value: stats?.analyses ?? '—', icon: 'sparkle' as const },
          {
            label: stats?.streak ? 'Day streak' : 'Streak',
            value: stats?.streak ?? '—',
            icon: 'flame' as const,
          },
        ].map(s => (
          <div key={s.label} className="bg-card px-3 py-3.5 flex flex-col items-center gap-1">
            <Icon name={s.icon} size={16} stroke={1.9} className="text-accent" />
            <div className="font-serif italic text-[24px] text-ink leading-none">{s.value}</div>
            <div className="font-mono text-[9px] tracking-[0.12em] uppercase text-ink-muted">{s.label}</div>
          </div>
        ))}
      </div>

      {(topCareType || activeDay || lastTended) && (
        <div className="mx-5 mt-2 space-y-1">
          {(topCareType || activeDay) && (
            <p className="font-mono text-[10px] tracking-[0.1em] text-ink-muted uppercase text-center">
              {[
                topCareType ? `Most logged: ${topCareType.replace('_', ' ')}` : null,
                activeDay   ? `Most active: ${activeDay}s` : null,
              ].filter(Boolean).join(' · ')}
            </p>
          )}
          {lastTended && (
            <p className="font-mono text-[10px] tracking-[0.1em] text-ink-muted uppercase text-center">
              Last tended · {lastTended.nickname} · {relativeTime(lastTended.loggedAt)}
            </p>
          )}
          {stats && stats.maxStreak > stats.streak && (
            <p className="font-mono text-[10px] tracking-[0.1em] text-ink-muted uppercase text-center">
              Best streak ever · {stats.maxStreak} days
            </p>
          )}
          {tendedThisWeek !== null && tendedThisWeek > 0 && (
            <p className="font-mono text-[10px] tracking-[0.1em] text-ink-muted uppercase text-center">
              {tendedThisWeek} {tendedThisWeek === 1 ? 'plant' : 'plants'} tended this week
            </p>
          )}
          {stats && stats.logs > 0 && stats.plants > 0 && (
            <p className="font-mono text-[10px] tracking-[0.1em] text-ink-muted uppercase text-center">
              {Math.round(stats.logs / stats.plants)} avg logs per plant
            </p>
          )}
        </div>
      )}

      {/* ── Location breakdown ───────────────────────────────────────── */}
      {locationBreakdown && locationBreakdown.length > 1 && (
        <div className="mx-5 mt-2 px-4 py-3 bg-card border border-rule rounded-brand-lg">
          <div className="font-mono text-[9px] tracking-[0.14em] uppercase text-ink-muted mb-2">By location</div>
          <div className="flex flex-col gap-1.5">
            {locationBreakdown.map(({ location, count }) => {
              const total = locationBreakdown.reduce((s, b) => s + b.count, 0)
              const pct = Math.round((count / total) * 100)
              return (
                <div key={location} className="flex items-center gap-2">
                  <div className="flex-1 text-[12px] text-ink-soft">{location}</div>
                  <div className="w-24 h-1.5 rounded-full bg-paper-alt overflow-hidden">
                    <div className="h-full rounded-full bg-accent-soft" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="font-mono text-[10px] text-ink-muted w-5 text-right">{count}</div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Oldest plant ──────────────────────────────────────────────── */}
      {oldestPlant && (
        <>
          <SectionLabel number="§ 03" title="A moment of pride" />
          <div className="mx-5 px-4 py-3.5 bg-card border border-rule rounded-brand-lg flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-accent-soft flex items-center justify-center shrink-0">
              <Icon name="leaf" size={18} stroke={1.7} className="text-accent" />
            </div>
            <div>
              <div className="font-serif italic text-[17px] text-ink leading-tight">{oldestPlant.nickname}</div>
              <div className="text-[12px] text-ink-soft mt-0.5">
                Your oldest plant — {oldestPlant.months >= 12
                  ? `${Math.floor(oldestPlant.months / 12)}yr ${oldestPlant.months % 12}mo`
                  : `${oldestPlant.months}mo`} in your care
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Account actions ───────────────────────────────────────────── */}
      <SectionLabel number={oldestPlant ? '§ 04' : '§ 03'} title="Account" />
      <div className="mx-5 bg-card border border-rule rounded-brand-lg overflow-hidden">
        <button
          onClick={handleExport}
          disabled={exporting}
          className="w-full flex items-center justify-between px-4 py-4 text-[14px] font-medium text-ink disabled:opacity-60 border-b border-dashed border-rule"
        >
          <span>{exporting ? 'Preparing export…' : 'Export my data'}</span>
          <Icon name="chev" size={14} className="text-ink-muted" />
        </button>
        <button
          onClick={handleSignOut}
          disabled={signingOut}
          className="w-full flex items-center justify-between px-4 py-4 text-[14px] font-medium text-danger disabled:opacity-60"
        >
          <span>{signingOut ? 'Signing out…' : 'Sign out'}</span>
          <Icon name="chev" size={14} className="text-danger/70" />
        </button>
      </div>

      {/* ── About ─────────────────────────────────────────────────────── */}
      <SectionLabel number={oldestPlant ? '§ 05' : '§ 04'} title="About" />
      <div className="mx-5 bg-card border border-rule rounded-brand-lg">
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-dashed border-rule">
          <span className="font-mono text-[10px] tracking-[0.12em] uppercase text-ink-muted">App</span>
          <span className="font-serif italic text-[15px] text-ink">Viriditas</span>
        </div>
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-dashed border-rule">
          <span className="font-mono text-[10px] tracking-[0.12em] uppercase text-ink-muted">Version</span>
          <span className="font-mono text-[12px] text-ink-soft">{pkg.version}</span>
        </div>
        <div className="px-4 py-4">
          <p className="font-serif text-[14px] text-ink leading-relaxed" style={{ textWrap: 'pretty' as React.CSSProperties['textWrap'] }}>
            Viriditas is a houseplant care companion. Photograph your plants for AI
            species ID and health analysis, track care history, and pull in a
            field-guide entry for any species you grow.
          </p>
        </div>
      </div>

      <p className="mt-6 text-center font-mono text-[10px] tracking-[0.16em] uppercase text-ink-muted">
        Made with care · Volume I
      </p>
    </div>
  )
}
