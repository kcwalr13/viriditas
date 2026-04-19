// components/ui.tsx
// Shared UI primitives — StatusPip, Chip, BigTitle, SectionLabel,
// HairlineButton. These are the editorial building blocks used across every screen.
import type { ReactNode } from 'react'
import type { WateringStatus } from '@/lib/utils'
import { Icon, type IconName } from './Icon'

// ─── StatusPip ──────────────────────────────────────────────────────────
// A small dot + optional label for watering status (overdue / due-soon / good).
export function StatusPip({ status, withLabel = false }: { status: WateringStatus | 'unset'; withLabel?: boolean }) {
  const { color, label } =
    status === 'overdue'  ? { color: 'text-danger',   label: 'Overdue'  } :
    status === 'due-soon' ? { color: 'text-warn',     label: 'Due soon' } :
    status === 'good'     ? { color: 'text-accent',   label: 'Good'     } :
                            { color: 'text-ink-muted', label: '—'       }

  const dotBg =
    status === 'overdue'  ? 'bg-danger shadow-[0_0_0_3px_rgba(155,58,46,0.13)]' :
    status === 'due-soon' ? 'bg-warn   shadow-[0_0_0_3px_rgba(180,87,30,0.13)]' :
    status === 'good'     ? 'bg-accent shadow-[0_0_0_3px_rgba(76,106,72,0.13)]' :
                            'bg-ink-muted'

  return (
    <span className={`inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.075em] uppercase ${color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dotBg}`} />
      {withLabel && label}
    </span>
  )
}

// ─── Chip ───────────────────────────────────────────────────────────────
export function Chip({
  children, tone = 'neutral', active = false, onClick,
}: {
  children: ReactNode
  tone?: 'neutral' | 'accent' | 'warn' | 'danger'
  active?: boolean
  onClick?: () => void
}) {
  const toneClass = active
    ? 'bg-ink text-paper border-ink'
    : tone === 'accent' ? 'bg-accent-soft text-accent border-rule'
    : tone === 'warn'   ? 'bg-warn-soft   text-warn   border-rule'
    : tone === 'danger' ? 'bg-danger-soft text-danger border-rule'
    :                     'bg-card        text-ink    border-rule'
  return (
    <button
      type="button"
      onClick={onClick}
      className={`whitespace-nowrap px-3 py-1.5 rounded-full border text-xs font-medium tracking-[-0.01em] ${toneClass} ${onClick ? 'cursor-pointer' : 'cursor-default'}`}
    >
      {children}
    </button>
  )
}

// ─── BigTitle ───────────────────────────────────────────────────────────
// Editorial serif headline. Pass `italic` to set a full italic, or mix
// italic inline by passing JSX children.
export function BigTitle({
  children, italic = false, className = '',
}: { children: ReactNode; italic?: boolean; className?: string }) {
  return (
    <h1
      className={`font-serif font-normal text-[34px] leading-[1.04] tracking-[-0.02em] text-ink ${italic ? 'italic' : ''} ${className}`}
      style={{ textWrap: 'pretty' as React.CSSProperties['textWrap'] }}
    >
      {children}
    </h1>
  )
}

// ─── SectionLabel ───────────────────────────────────────────────────────
// Field-guide section label: "§ 01  TITLE" with optional right-side action.
export function SectionLabel({
  number, title, action, onAction,
}: { number?: string; title: string; action?: string; onAction?: () => void }) {
  return (
    <div className="flex items-baseline justify-between px-5 mt-5 mb-2.5">
      <div className="flex items-baseline gap-2.5">
        {number && (
          <span className="font-mono text-[10px] text-ink-muted tracking-[0.12em]">{number}</span>
        )}
        <div className="font-sans text-[11px] uppercase tracking-[0.17em] text-ink-soft font-semibold">
          {title}
        </div>
      </div>
      {action && (
        <button onClick={onAction} className="font-sans text-xs text-accent font-medium">
          {action}
        </button>
      )}
    </div>
  )
}

// ─── HairlineButton ─────────────────────────────────────────────────────
// Primary / secondary CTA. Pill-shaped, with optional leading icon.
export function HairlineButton({
  children, onClick, variant = 'solid', icon, fullWidth = false, disabled = false, type = 'button',
}: {
  children: ReactNode
  onClick?: () => void
  variant?: 'solid' | 'outline'
  icon?: IconName
  fullWidth?: boolean
  disabled?: boolean
  type?: 'button' | 'submit'
}) {
  const base = 'inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 font-sans font-medium text-sm tracking-[-0.01em] transition-opacity'
  const style = variant === 'solid'
    ? 'bg-ink text-paper hover:opacity-90'
    : 'bg-transparent text-ink border border-rule'
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${style} ${fullWidth ? 'w-full' : ''} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      {icon && <Icon name={icon} size={16} stroke={1.8} />}
      {children}
    </button>
  )
}

