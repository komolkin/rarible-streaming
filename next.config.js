const webpack = require('webpack')

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: ['gateway.pinata.cloud', 'supabase.co', 'thumbnailer.livepeer.studio', 'playback.livepeer.com'],
  },
  webpack: (config, { isServer }) => {
    // Ignore React Native modules when building for web
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        '@react-native-async-storage/async-storage': false,
      }
      // Use IgnorePlugin to completely ignore React Native modules
      config.plugins.push(
        new webpack.IgnorePlugin({
          resourceRegExp: /^@react-native-async-storage\/async-storage$/,
        })
      )
    }
    return config
  },
}

module.exports = nextConfig

