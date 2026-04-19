// components/PlantPhoto.tsx
// Warm blocky plant photo placeholder — deterministic from a key so the same
// plant always gets the same hue. Used when a plant has no cover photo yet.

const PALETTES: [string, string][] = [
  ['#6B7F5A', '#3F4F3A'],
  ['#8C9E6E', '#4E5D3F'],
  ['#A69A72', '#6B5F3C'],
  ['#7A8F6B', '#394938'],
  ['#B3A67A', '#7A6D46'],
  ['#5C7358', '#2F3C2E'],
  ['#9AA979', '#5F6B42'],
  ['#C4A97A', '#816A3B'],
  ['#8B7F58', '#3F3A27'],
  ['#6E8A6C', '#364937'],
]

function hash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

export function paletteFor(key: string): [string, string] {
  return PALETTES[hash(key || '') % PALETTES.length]
}

interface PlantPhotoProps {
  name: string
  label?: string
  species?: string
  showLabel?: boolean
  className?: string
}

export function PlantPhoto({ name, label, species, showLabel = true, className = '' }: PlantPhotoProps) {
  const [top, bot] = paletteFor(name)
  return (
    <div
      className={`relative w-full h-full overflow-hidden ${className}`}
      style={{ background: `linear-gradient(155deg, ${top} 0%, ${bot} 100%)` }}
    >
      {/* Diagonal pinstripe texture */}
      <div
        className="absolute inset-0"
        style={{
          background: 'repeating-linear-gradient(155deg, transparent 0 18px, rgba(255,255,255,0.04) 18px 19px)',
        }}
      />
      {/* Soft corner vignette */}
      <div
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(120% 80% at 30% 20%, rgba(255,255,255,0.12), transparent 60%)',
        }}
      />
      {showLabel && (
        <div className="absolute bottom-2.5 left-3 right-3 font-mono text-[9px] tracking-[1px] uppercase leading-snug" style={{ color: 'rgba(255,255,255,0.78)' }}>
          {label || 'plant photo'}
          {species && <div className="opacity-60">{species}</div>}
        </div>
      )}
    </div>
  )
}
