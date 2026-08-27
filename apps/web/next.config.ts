import type { NextConfig } from 'next';
const nextConfig: NextConfig = {
  // Keep production builds away from the live development cache. Running
  // `next build` while `next dev` is open can otherwise invalidate its chunks.
  distDir: process.env.NODE_ENV === 'production' ? '.next-build' : '.next',
  transpilePackages: ['@nocturne/types', '@nocturne/ui'],
};
export default nextConfig;
