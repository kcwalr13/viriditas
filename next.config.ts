import type { NextConfig } from 'next'
import path from 'path'

const nextConfig: NextConfig = {
  // Allow images from Supabase Storage to be displayed via next/image
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  webpack(config, options: any) {
    // The ncc-compiled ua-parser-js bundled inside next/server contains this line
    // at module load time:
    //   if(typeof __nccwpck_require__!=="undefined")__nccwpck_require__.ab=__dirname+"/";
    // __dirname is not defined in Edge Runtime (where middleware runs), causing
    // MIDDLEWARE_INVOCATION_FAILED on every request.
    //
    // Fix: for Edge Runtime builds, swap out the ncc-compiled ua-parser-js module
    // entirely with a local patched copy (lib/ua-parser-edge-safe.js) that has
    // the __dirname reference removed. This uses webpack resolve.alias, which
    // operates at the module resolution level and is more reliable than
    // DefinePlugin (which does text substitution but can miss ncc-compiled code
    // that webpack treats as a single opaque chunk).
    if (options.nextRuntime === 'edge') {
      // NormalModuleReplacementPlugin intercepts AFTER webpack resolves the module
      // to its absolute path on disk — unlike resolve.alias (which matches against
      // the raw import string). This is necessary because Next.js imports ua-parser-js
      // via a relative path from inside its own package, so we can only match by
      // the resolved filesystem path.
      config.plugins = config.plugins ?? []
      config.plugins.push(
        // user-agent.js inside Next.js does:
        //   require("next/dist/compiled/ua-parser-js")  ← no /ua-parser.js suffix
        // NormalModuleReplacementPlugin matches against the REQUEST string
        // (before resolution), so we must match the package path, not the file.
        new options.webpack.NormalModuleReplacementPlugin(
          /next\/dist\/compiled\/ua-parser-js/,
          path.resolve('./lib/ua-parser-edge-safe.js')
        )
      )
    }
    return config
  },
}

export default nextConfig
