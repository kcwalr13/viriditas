// components/Icon.tsx
// Single-stroke SVG icons. Every icon in the app comes through here —
// replacing the emoji set from the old design.
//
// Usage: <Icon name="drop" size={16} className="text-accent" />

import type { SVGProps } from 'react'

export type IconName =
  | 'leaf' | 'drop' | 'sun' | 'scissors' | 'mist' | 'bug' | 'move'
  | 'camera' | 'plus' | 'check' | 'chev' | 'chev-down' | 'back'
  | 'search' | 'home' | 'book' | 'cog' | 'calendar' | 'edit' | 'trash'
  | 'dots' | 'sparkle' | 'flame' | 'arrow-up' | 'arrow-right'
  | 'thermometer' | 'humidity' | 'soil' | 'warning' | 'room' | 'pot'
  | 'clock' | 'heart' | 'close' | 'filter' | 'grid' | 'list'

// Each entry is the inner <path>/<circle>/… elements of a 24x24 viewBox.
const ICONS: Record<IconName, React.ReactNode> = {
  leaf:       <><path d="M4 20C4 12 10 4 20 4C20 14 14 20 4 20Z"/><path d="M4 20L13 11"/></>,
  drop:       <><path d="M12 3C12 3 5 11 5 15.5C5 19.09 8.13 22 12 22C15.87 22 19 19.09 19 15.5C19 11 12 3 12 3Z"/><path d="M9 16C9 17.66 10.34 19 12 19"/></>,
  sun:        <><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></>,
  scissors:   <><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4L8.12 15.88M14.47 14.48L20 20M8.12 8.12L12 12"/></>,
  mist:       <><path d="M4 8h16M6 12h14M4 16h12M8 20h8"/></>,
  bug:        <><ellipse cx="12" cy="13" rx="5" ry="6"/><path d="M12 7V3M9 5l-3-2M15 5l3-2M7 13H3M7 17l-3 2M7 9L4 7M17 13h4M17 17l3 2M17 9l3-2"/></>,
  move:       <><path d="M12 2v20M2 12h20M5 8l-3 4 3 4M19 8l3 4-3 4M8 5l4-3 4 3M8 19l4 3 4-3"/></>,
  camera:     <><path d="M3 8h3l2-2h8l2 2h3v12H3z"/><circle cx="12" cy="14" r="4"/></>,
  plus:       <><path d="M12 5v14M5 12h14"/></>,
  check:      <><path d="M5 12l5 5 10-11"/></>,
  chev:       <><path d="M9 6l6 6-6 6"/></>,
  'chev-down':<><path d="M6 9l6 6 6-6"/></>,
  back:       <><path d="M15 6l-6 6 6 6"/></>,
  search:     <><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.5-4.5"/></>,
  home:       <><path d="M3 12l9-9 9 9v9h-6v-6h-6v6H3z"/></>,
  book:       <><path d="M4 4h7a3 3 0 013 3v13a2 2 0 00-2-2H4zM20 4h-7a3 3 0 00-3 3v13a2 2 0 012-2h8z"/></>,
  cog:        <><circle cx="12" cy="12" r="3"/><path d="M19 12l2-1-1-2-2 1-1-1V7l-2-1-1 2h-2l-1-2-2 1v2l-1 1-2-1-1 2 2 1v2l-2 1 1 2 2-1 1 1v2l2 1 1-2h2l1 2 2-1v-2l1-1 2 1 1-2-2-1v-2z"/></>,
  calendar:   <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></>,
  edit:       <><path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4"/></>,
  trash:      <><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/></>,
  dots:       <><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></>,
  sparkle:    <><path d="M12 2l2 7 7 2-7 2-2 7-2-7-7-2 7-2zM19 4l.8 2.2L22 7l-2.2.8L19 10l-.8-2.2L16 7l2.2-.8z"/></>,
  flame:      <><path d="M12 2s4 4 4 9a4 4 0 01-8 0c0-2 1-3 1-5 0 0 3 1 3-4z"/><path d="M12 22a6 6 0 006-6c0-1.5-1-3-2-4"/></>,
  'arrow-up': <><path d="M12 19V5M5 12l7-7 7 7"/></>,
  'arrow-right':<><path d="M5 12h14M12 5l7 7-7 7"/></>,
  thermometer:<><path d="M14 14.76V5a2 2 0 10-4 0v9.76a4 4 0 104 0z"/></>,
  humidity:   <><path d="M12 3l5 8a5 5 0 11-10 0z"/><path d="M8 14a3 3 0 004 2 3 3 0 004-2"/></>,
  soil:       <><path d="M3 14c2-2 4 2 6 0s4-2 6 0 4 2 6 0v6H3z"/></>,
  warning:    <><path d="M12 3l10 18H2z"/><path d="M12 10v4M12 17v.5"/></>,
  room:       <><path d="M3 21V9l9-6 9 6v12"/><path d="M9 21v-6h6v6"/></>,
  pot:        <><path d="M5 10h14l-1 10H6zM3 10h18v-3H3z"/><path d="M10 7c0-3 0-5 2-5M14 7c0-3 0-5 0-6"/></>,
  clock:      <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  heart:      <><path d="M12 21s-8-5-8-12a5 5 0 018-4 5 5 0 018 4c0 7-8 12-8 12z"/></>,
  close:      <><path d="M6 6l12 12M18 6L6 18"/></>,
  filter:     <><path d="M3 5h18M6 12h12M10 19h4"/></>,
  grid:       <><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></>,
  list:       <><path d="M8 6h13M8 12h13M8 18h13"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/></>,
}

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name' | 'stroke'> {
  name: IconName
  size?: number
  stroke?: number
}

export function Icon({ name, size = 20, stroke = 1.6, className, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...rest}
    >
      {ICONS[name]}
    </svg>
  )
}
