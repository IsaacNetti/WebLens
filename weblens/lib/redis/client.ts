import { Redis } from '@upstash/redis';

// Upstash Redis is the shared persistence layer between the Vercel app and the
// Render worker. Using one tiny client module keeps the rest of the code simple.
export const redis = Redis.fromEnv();

export const SCAN_TTL_SECONDS = 60 * 60 * 24;
