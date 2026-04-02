import { dirname } from 'path'
import { fileURLToPath } from 'url'
import { FlatCompat } from '@eslint/eslintrc'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const compat = new FlatCompat({
  baseDirectory: __dirname,
})

const eslintConfig = [
  // Ignore the patched ua-parser-js bundle — it's a third-party minified file
  // that we only modified to remove a single __dirname reference. ESLint
  // correctly flags unused vars in it but we can't and shouldn't rewrite it.
  { ignores: ['lib/ua-parser-edge-safe.js'] },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
]

export default eslintConfig
