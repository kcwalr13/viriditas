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
}

export default nextConfig
