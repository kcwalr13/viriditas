import type { NextConfig } from 'next'

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
    // Two complementary fixes:
    // 1. DefinePlugin: replace the __dirname identifier with "" at compile time
    //    using Next.js's own webpack instance (options.webpack, not require('webpack')).
    // 2. node.__dirname: tell webpack to mock __dirname as '/' in the bundle,
    //    which serves as a fallback if DefinePlugin doesn't cover a specific occurrence.
    if (options.nextRuntime === 'edge') {
      config.plugins = config.plugins ?? []
      config.plugins.push(
        new options.webpack.DefinePlugin({
          __dirname: JSON.stringify(''),
        })
      )
      // Belt-and-suspenders: webpack's built-in node mock for __dirname
      config.node = {
        ...config.node,
        __dirname: true,
      }
    }
    return config
  },
}

export default nextConfig
