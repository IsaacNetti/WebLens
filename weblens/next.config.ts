import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Playwright and the axe Playwright integration are better treated as
  // external server packages instead of being bundled into route handlers.
  // That helps keep the official runtime behavior intact.
  serverExternalPackages: ['playwright', '@axe-core/playwright', 'axe-core']
};

export default nextConfig;