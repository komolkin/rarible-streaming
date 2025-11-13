/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: ['gateway.pinata.cloud', 'supabase.co', 'thumbnailer.livepeer.studio', 'playback.livepeer.com'],
  },
  webpack: (config, { dev, isServer }) => {
    if (!dev && !isServer) {
      config.optimization.minimize = false
    }
    return config
  },
}

module.exports = nextConfig

