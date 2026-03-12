import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // These packages should keep their normal Node runtime behavior instead of
  // being bundled into Vercel route handlers.
  serverExternalPackages: ['playwright', '@axe-core/playwright', 'axe-core']
};

export default nextConfig;
