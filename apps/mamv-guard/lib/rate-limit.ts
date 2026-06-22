import { NextRequest } from 'next/server';
import { config } from './config';
const buckets = new Map<string, { count: number; resetAt: number }>();
export function assertRateLimit(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
  const now = Date.now();
  const bucket = buckets.get(ip) ?? { count: 0, resetAt: now + 60_000 };
  if (now > bucket.resetAt) { bucket.count = 0; bucket.resetAt = now + 60_000; }
  bucket.count += 1; buckets.set(ip, bucket);
  if (bucket.count > config.rateLimitPerMinute) throw Object.assign(new Error('Rate limit exceeded'), { status: 429 });
}
