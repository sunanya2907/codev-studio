import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Tell Next.js not to bundle Prisma
  serverExternalPackages: ['@prisma/client'],
  // Every API answer is private to the signed-in user: never let a browser or CDN keep one.
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [{ key: 'Cache-Control', value: 'no-store, max-age=0' }],
      },
    ];
  },
};

export default nextConfig;