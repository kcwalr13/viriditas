/**
 * patch-ua-parser.js
 *
 * Patches next/dist/compiled/ua-parser-js/ua-parser.js before the Next.js build runs.
 *
 * WHY: The ncc-compiled ua-parser-js bundle inside Next.js ends with:
 *   if(typeof __nccwpck_require__!=="undefined")__nccwpck_require__.ab=__dirname+"/";
 * Edge Runtime (where middleware runs) is a stripped-down V8 isolate with no Node.js
 * globals — __dirname doesn't exist there. This causes MIDDLEWARE_INVOCATION_FAILED
 * on every request, making the entire app inaccessible.
 *
 * The fix is to replace __dirname+"/" with "/" (a harmless inert value — it's only
 * used as a path prefix for the ncc require cache, which is irrelevant in Edge Runtime).
 *
 * This script runs as part of the build command ("prebuild" phase) so the patch is
 * always in place before webpack processes the file.
 */

const fs = require('fs')
const path = require('path')

const filePath = path.join(
  __dirname,
  '..',
  'node_modules',
  'next',
  'dist',
  'compiled',
  'ua-parser-js',
  'ua-parser.js'
)

try {
  let src = fs.readFileSync(filePath, 'utf8')

  if (!src.includes('__dirname')) {
    console.log('✓ ua-parser-js: already patched (no __dirname found), skipping')
    process.exit(0)
  }

  // Replace the specific problematic line. The regex is anchored tightly so it
  // won't accidentally match anything else if Next.js updates this file.
  const before = src
  src = src.replace(
    /if\(typeof __nccwpck_require__!=="undefined"\)__nccwpck_require__\.ab=__dirname\+"\/"/g,
    'if(typeof __nccwpck_require__!=="undefined")__nccwpck_require__.ab="/"'
  )

  if (src === before) {
    console.warn('⚠ ua-parser-js: __dirname found but regex did not match — file may have changed format')
    console.warn('  Check scripts/patch-ua-parser.js if middleware errors persist')
    process.exit(0)
  }

  fs.writeFileSync(filePath, src)
  console.log('✓ ua-parser-js: patched __dirname → "/" for Edge Runtime compatibility')
} catch (err) {
  // Don't fail the build if the file doesn't exist (e.g. Next.js was updated and moved it)
  if (err.code === 'ENOENT') {
    console.warn('⚠ ua-parser-js patch: file not found at expected path, skipping')
    console.warn(' ', filePath)
  } else {
    throw err
  }
}
