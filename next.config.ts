import type { NextConfig } from 'next'
import type { Configuration } from 'webpack'

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

  webpack(config: Configuration, { nextRuntime }: { nextRuntime?: string }) {
    // The compiled ua-parser-js bundled inside next/server uses __dirname at
    // module load time (the ncc wrapper line: __nccwpck_require__.ab = __dirname + "/").
    // __dirname does not exist in the Edge Runtime, causing MIDDLEWARE_INVOCATION_FAILED
    // on every request. Defining it as an empty string satisfies the assignment
    // without affecting any real path lookups (ua-parser-js doesn't use __dirname
    // for anything meaningful — the ncc wrapper just sets it as a base path hint).
    if (nextRuntime === 'edge') {
      config.plugins = config.plugins ?? []
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const webpack = require('webpack')
      config.plugins.push(
        new webpack.DefinePlugin({
          __dirname: JSON.stringify(''),
        })
      )
    }
    return config
  },
}

export default nextConfig
