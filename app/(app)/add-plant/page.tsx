'use client'
// app/(app)/add-plant/page.tsx
// Form for registering a new plant.
// All fields except nickname are optional.
import { createClient } from '@/lib/supabase/client'
import { formatDate } from '@/lib/utils'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

export default function AddPlantPage() {
  const [nickname, setNickname]         = useState('')
  const [species, setSpecies]           = useState('')
  const [location, setLocation]         = useState('')
  const [acquiredDate, setAcquiredDate] = useState('')
  const [notes, setNotes]               = useState('')
  const [error, setError]               = useState<string | null>(null)
  const [loading, setLoading]           = useState(false)
  const router = useRouter()
  const supabase = createClient()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!nickname.trim()) return

    setError(null)
    setLoading(true)

    const { data: { user } } = await supabase.auth.getUser()

    const { data: plant, error } = await supabase
      .from('plants')
      .insert({
        nickname: nickname.trim(),
        species:  species.trim()  || null,
        location: location.trim() || null,
        acquired_date: acquiredDate || null,
        notes:    notes.trim()    || null,
        user_id:  user!.id,
      })
      .select()
      .single()

    setLoading(false)

    if (error) {
      setError('Could not add plant. Please try again.')
    } else {
      // Navigate directly to the new plant's detail page
      router.push(`/plant/${plant.id}`)
    }
  }

  return (
    <div className="px-4 pt-6 pb-8">
      {/* Back link */}
      <Link href="/" className="text-brand text-sm font-medium mb-4 inline-block">
        ← My Plants
      </Link>

      <h1 className="text-2xl font-bold text-gray-900 mb-6">Add a Plant</h1>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Nickname — required */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Nickname <span className="text-brand">*</span>
          </label>
          <input
            type="text"
            required
            value={nickname}
            onChange={e => setNickname(e.target.value)}
            placeholder="e.g. Big Fern, Corner Phil"
            className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
          />
        </div>

        {/* Species */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Species <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <input
            type="text"
            value={species}
            onChange={e => setSpecies(e.target.value)}
            placeholder="e.g. Monstera deliciosa"
            className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
          />
        </div>

        {/* Location */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Location <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <input
            type="text"
            value={location}
            onChange={e => setLocation(e.target.value)}
            placeholder="e.g. Living room — east window"
            className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
          />
        </div>

        {/* Acquisition date — native browser date picker */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Date acquired <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          {/*
            Using a relative wrapper so the styled display and the transparent
            <input type="date"> overlay each other. On desktop the native date
            picker opens; on mobile the device's calendar sheet appears.
          */}
          <div className="relative">
            <div className="flex items-center justify-between w-full px-4 py-3 border border-gray-200 rounded-xl text-sm pointer-events-none">
              <span className={acquiredDate ? 'text-gray-900' : 'text-gray-400'}>
                {acquiredDate ? formatDate(acquiredDate) : 'Tap to select a date'}
              </span>
              <span>📅</span>
            </div>
            <input
              type="date"
              value={acquiredDate}
              onChange={e => setAcquiredDate(e.target.value)}
              className="absolute inset-0 opacity-0 cursor-pointer w-full"
            />
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Notes <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Anything else you want to remember…"
            rows={3}
            className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent resize-none"
          />
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
        )}

        <button
          type="submit"
          disabled={loading || !nickname.trim()}
          className="w-full bg-brand text-white font-semibold py-3 px-4 rounded-xl hover:bg-brand-light transition-colors disabled:opacity-60"
        >
          {loading ? 'Adding…' : 'Add Plant'}
        </button>
      </form>
    </div>
  )
}
