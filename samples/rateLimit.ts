import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { logError } from '@/lib/logger';

// In-memory fixed-window rate limiter. This protects a single long-running
// server instance (a container/VM, or `next dev`) with zero external
// dependencies. NOTE: on multi-instance / serverless deployments the counters
// are per-instance — for that, swap the store below for Upstash Ratelimit
// (Redis) keeping the same rateLimit() signature.

type Bucket = { count: number; resetAt: number };
const store = new Map<string, Bucket>();

// Occasionally evict expired buckets so the map can't grow unbounded.
function prune(now: number) {
  if (store.size < 5000) return;
  for (const [key, bucket] of Array.from(store.entries())) {
    if (bucket.resetAt < now) store.delete(key);
  }
}

export type RateLimitResult = { ok: boolean; remaining: number; resetAt: number };

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const bucket = store.get(key);

  if (!bucket || bucket.resetAt <= now) {
    prune(now);
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, resetAt: now + windowMs };
  }

  if (bucket.count >= limit) {
    return { ok: false, remaining: 0, resetAt: bucket.resetAt };
  }

  bucket.count += 1;
  return { ok: true, remaining: limit - bucket.count, resetAt: bucket.resetAt };
}

// Check whether a key is currently over its limit WITHOUT counting this call.
// Use for attempt-based throttles where only *failures* should consume budget:
// peek before doing the work, then call rateLimit() to record a failure.
export function isRateLimited(key: string, limit: number): boolean {
  const bucket = store.get(key);
  if (!bucket || bucket.resetAt <= Date.now()) return false;
  return bucket.count >= limit;
}

// Best-effort client IP from proxy headers; falls back to a constant so a
// missing header still shares one bucket rather than bypassing the limit.
export function clientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return req.headers.get('x-real-ip') || 'unknown';
}

// Convenience: enforce a limit and return a 429 response if exceeded, else null.
export function enforceRateLimit(req: Request, name: string, limit: number, windowMs: number): NextResponse | null {
  const result = rateLimit(`${name}:${clientIp(req)}`, limit, windowMs);
  if (result.ok) return null;
  return tooManyRequests(result);
}

function tooManyRequests(result: RateLimitResult): NextResponse {
  const retryAfter = Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000));
  return NextResponse.json(
    { error: 'Too many requests. Please slow down and try again shortly.' },
    { status: 429, headers: { 'Retry-After': String(retryAfter) } }
  );
}

// ── Shared (cross-instance) limiting ─────────────────────────────────────
//
// The in-memory limiter above counts per serverless instance, so the real
// ceiling is roughly (limit x concurrent instances). That is tolerable for
// throttles that only exist to blunt accidental hammering, and NOT tolerable
// for the ones that are a security control — a brute-force login throttle an
// attacker can reset by landing on a different instance is barely a throttle.
//
// These variants keep one counter in Postgres so every instance shares it.
// They are async, which is why they sit alongside rather than replacing the
// synchronous API; use them for anything guarding credentials or money.

/**
 * Count one hit against a shared window.
 *
 * The increment is a single atomic statement, not read-then-write: two
 * concurrent requests doing SELECT-then-UPDATE would both see the same count
 * and both be allowed, which is exactly the burst a limiter exists to stop.
 * The RETURNING clause hands back the post-increment value so the decision is
 * made on what was actually written.
 *
 * Fails OPEN. A limiter that 500s the login page when the database hiccups
 * turns a minor outage into a total one; the in-memory limiter still applies
 * underneath, so a failure here degrades to per-instance limiting rather than
 * to none at all.
 */
export async function rateLimitShared(
  key: string,
  limit: number,
  windowMs: number
): Promise<RateLimitResult> {
  const now = new Date();
  const resetAt = new Date(now.getTime() + windowMs);

  try {
    const rows = await prisma.$queryRaw<{ count: number; resetAt: Date }[]>`
      INSERT INTO "RateLimitCounter" ("key", "count", "resetAt", "updatedAt")
      VALUES (${key}, 1, ${resetAt}, ${now})
      ON CONFLICT ("key") DO UPDATE SET
        -- An expired window restarts at 1 instead of carrying its old count.
        "count"   = CASE WHEN "RateLimitCounter"."resetAt" <= ${now}
                         THEN 1
                         ELSE "RateLimitCounter"."count" + 1 END,
        "resetAt" = CASE WHEN "RateLimitCounter"."resetAt" <= ${now}
                         THEN ${resetAt}
                         ELSE "RateLimitCounter"."resetAt" END,
        "updatedAt" = ${now}
      RETURNING "count", "resetAt"
    `;

    const row = rows[0];
    if (!row) return { ok: true, remaining: limit - 1, resetAt: resetAt.getTime() };

    const count = Number(row.count);
    const windowEnd = new Date(row.resetAt).getTime();
    return {
      ok: count <= limit,
      remaining: Math.max(0, limit - count),
      resetAt: windowEnd,
    };
  } catch (err) {
    logError('Shared rate limiter unavailable, falling back to per-instance', err, { detail: key });
    return rateLimit(key, limit, windowMs);
  }
}

/** Peek at a shared window without counting this call — see isRateLimited. */
export async function isRateLimitedShared(key: string, limit: number): Promise<boolean> {
  try {
    const row = await prisma.rateLimitCounter.findUnique({
      where: { key },
      select: { count: true, resetAt: true },
    });
    if (!row || row.resetAt <= new Date()) return false;
    return row.count >= limit;
  } catch (err) {
    logError('Shared rate limiter unavailable, falling back to per-instance', err, { detail: key });
    return isRateLimited(key, limit);
  }
}

/** enforceRateLimit, backed by the shared counter. */
export async function enforceRateLimitShared(
  req: Request,
  name: string,
  limit: number,
  windowMs: number
): Promise<NextResponse | null> {
  const result = await rateLimitShared(`${name}:${clientIp(req)}`, limit, windowMs);
  return result.ok ? null : tooManyRequests(result);
}

/**
 * Drop windows that ended a while ago. Nothing depends on this for
 * correctness — an expired row is already treated as empty — it just stops
 * the table growing forever. Called from the existing refill cron.
 */
export async function pruneRateLimitCounters(): Promise<number> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const { count } = await prisma.rateLimitCounter.deleteMany({
    where: { resetAt: { lt: cutoff } },
  });
  return count;
}
