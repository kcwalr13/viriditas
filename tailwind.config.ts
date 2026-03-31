import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Brand green — used as the primary color throughout the app.
        // Use: bg-brand, text-brand, border-brand, hover:bg-brand/90, etc.
        brand: {
          DEFAULT: '#2d6a4f',
          light:   '#40916c',
          lighter: '#52b788',
          bg:      '#f0faf4',  // very light green for backgrounds
        },
      },
    },
  },
  plugins: [],
}

export default config
