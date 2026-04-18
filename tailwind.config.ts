import type { Config } from 'tailwindcss'

// Design tokens — Editorial Botanical palette.
// Warm bone paper, olive accents, deep forest ink — meant to feel like a
// field-guide journal rather than a generic green app. See design handoff.
const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Editorial palette (the "Editorial Botanical" direction from design)
        paper:     '#F4EFE6',       // warm bone — default app background
        'paper-alt':'#EDE6D7',      // toast — inset / status-strip background
        card:      '#FAF6EC',       // card background, subtle lift from paper
        ink:       '#1F2A24',       // deep forest — primary text
        'ink-soft':'#4E5B52',       // secondary text
        'ink-muted':'#8A9389',      // tertiary text, metadata
        rule:      '#D9D0BD',       // hairline borders and dashed rules
        accent:    '#4C6A48',       // olive — primary actions, links
        'accent-soft':'#B9C9A8',    // accent washes, chip backgrounds
        warn:      '#B4571E',       // burnt orange — "due soon", cautions
        danger:    '#9B3A2E',       // "overdue", destructive
        'warn-soft':'#F3E4CF',
        'danger-soft':'#EED8D3',

        // Keep legacy brand tokens so any not-yet-migrated code still compiles.
        // Map them to the new accent so colors stay consistent.
        brand: {
          DEFAULT: '#4C6A48',
          light:   '#5C7A52',
          lighter: '#8C9E6E',
          bg:      '#EDE6D7',
        },
      },
      fontFamily: {
        sans:  ['Inter', '-apple-system', 'system-ui', 'sans-serif'],
        serif: ['"Source Serif 4"', '"Source Serif Pro"', 'Georgia', 'serif'],
        mono:  ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        'brand':    '14px',   // default card radius
        'brand-lg': '22px',   // larger panels, hero cards
      },
    },
  },
  plugins: [],
}

export default config
