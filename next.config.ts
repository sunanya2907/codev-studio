import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Tell Next.js not to bundle Prisma
  serverExternalPackages: ['@prisma/client'],

  // --- Anti reverse-engineering -------------------------------------------
  // Never ship source maps to browsers: they hand out your original TS/TSX.
  productionBrowserSourceMaps: false,
  // Don't advertise the framework in the X-Powered-By header.
  poweredByHeader: false,
  // Strip console.* from production bundles (leaks internal names/flows).
  // Keep error/warn so ErrorReporter-style real failures stay visible.
  compiler: {
    removeConsole: { exclude: ['error', 'warn'] },
  },

  async headers() {
    return [
      {
        // Every page: hardening headers.
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // microphone is needed by the voice builder.
          { key: 'Permissions-Policy', value: 'camera=(), geolocation=(), microphone=(self)' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
        ],
      },
      {
        // Every API answer is private to the signed-in user: never let a browser or CDN keep one.
        source: '/api/:path*',
        headers: [{ key: 'Cache-Control', value: 'no-store, max-age=0' }],
      },
    ];
  },
};

export default nextConfig;
