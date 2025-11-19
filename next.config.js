const webpack = require('webpack')

// Increase max listeners to suppress warnings in development
// This happens because Next.js Fast Refresh reloads modules without cleaning up
// signal listeners from dependencies (livepeer, postgres, drizzle-kit, etc.)
if (process.env.NODE_ENV === 'development') {
  process.setMaxListeners(20)
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: ['gateway.pinata.cloud', 'supabase.co', 'thumbnailer.livepeer.studio', 'playback.livepeer.com'],
  },
  // Disable SWC minification to use Terser with proper config
  swcMinify: false,
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production' ? {
      exclude: ['error', 'warn'],
    } : false,
  },
  webpack: (config, { isServer, dev }) => {
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
    
    // Configure Terser to handle unicode issues (if Terser is used)
    if (!dev && config.optimization && config.optimization.minimizer) {
      config.optimization.minimizer = config.optimization.minimizer.map((plugin) => {
        // Check if this is a Terser plugin by looking for terserOptions
        if (plugin && plugin.options && typeof plugin.options === 'object') {
          // Try to modify terserOptions if they exist
          if (plugin.options.terserOptions !== undefined) {
            return {
              ...plugin,
              options: {
                ...plugin.options,
                terserOptions: {
                  ...(plugin.options.terserOptions || {}),
                  output: {
                    ...(plugin.options.terserOptions?.output || {}),
                    ascii_only: true,
                  },
                  parse: {
                    ...(plugin.options.terserOptions?.parse || {}),
                    ecma: 2020,
                  },
                },
              },
            }
          }
          // Also check for compress/format options directly
          if (plugin.options.compress !== undefined || plugin.options.format !== undefined) {
            return {
              ...plugin,
              options: {
                ...plugin.options,
                format: {
                  ...(plugin.options.format || {}),
                  ascii_only: true,
                },
              },
            }
          }
        }
        return plugin
      })
    }
    
    return config
  },
}

module.exports = nextConfig

