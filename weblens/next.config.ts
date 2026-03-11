import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Playwright ships native browser dependencies and is better treated as an
  // external server package instead of being bundled into route handlers.
  serverExternalPackages: ['playwright']
};

export default nextConfig;
