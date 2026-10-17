import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Tell Next.js not to bundle Prisma
  serverExternalPackages: ['@prisma/client'],
};

export default nextConfig;