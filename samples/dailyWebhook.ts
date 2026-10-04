import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Verifying that a webhook really came from Daily.
 *
 * The previous implementation hashed the body alone with the secret as a plain
 * string and compared a hex digest. Daily does none of those three things, so
 * with DAILY_WEBHOOK_SECRET set, every genuine delivery was rejected with a 401
 * — and because the endpoint verification probe was rejected too, the webhook
 * could not even be registered. It failed silently in the direction that looks
 * like "Daily never sends anything".
 *
 * What Daily actually does, per its webhook docs:
 *   • the secret is BASE-64; decode it before using it as the HMAC key
 *   • the signed string is `${timestamp}.${rawBody}` — the timestamp arrives in
 *     X-Webhook-Timestamp and is part of the signature, not decoration
 *   • the digest is BASE-64, sent in X-Webhook-Signature
 *
 * Raw body, not re-serialised JSON: any difference in key order or whitespace
 * changes the hash.
 */
export function dailySignature(secret: string, timestamp: string, rawBody: string): string {
  return createHmac('sha256', Buffer.from(secret, 'base64'))
    .update(`${timestamp}.${rawBody}`)
    .digest('base64');
}

export function isValidDailySignature(
  secret: string,
  timestamp: string | null,
  signature: string | null,
  rawBody: string
): boolean {
  if (!timestamp || !signature) return false;
  const expected = dailySignature(secret, timestamp, rawBody);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  // Length is checked first because timingSafeEqual throws on a mismatch
  // rather than returning false. Length is not secret.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Daily POSTs `{"test":"test"}` when a webhook is created and refuses to
 * register the endpoint unless it answers 200 quickly.
 *
 * It is unsigned, which is the whole reason this is a named check rather than
 * an afterthought: the signature branch has to let it through, or the webhook
 * can never be created in the first place. It carries no data, so answering it
 * discloses nothing.
 */
export function isVerificationProbe(parsed: unknown): boolean {
  return (
    typeof parsed === 'object' &&
    parsed !== null &&
    (parsed as Record<string, unknown>).test === 'test' &&
    !('type' in (parsed as Record<string, unknown>))
  );
}

/** Seconds between two Daily epoch-second timestamps, floored at zero. */
export function presenceSeconds(joinedAt: Date, leftAt: Date): number {
  return Math.max(0, Math.round((leftAt.getTime() - joinedAt.getTime()) / 1000));
}

/** Daily sends Unix epoch SECONDS; `new Date(n)` would read them as milliseconds. */
export function fromEpochSeconds(value: unknown): Date | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Date(n * 1000);
}

/**
 * The role we stamped onto the meeting token, read back off the event.
 *
 * Daily echoes `user_data` verbatim, so it may be a JSON string, an object, or
 * absent entirely on a room joined before this shipped. Never throws — a
 * malformed value means "unknown role", not a failed webhook.
 */
export function roleFromUserData(userData: unknown): string | null {
  try {
    const parsed = typeof userData === 'string' ? JSON.parse(userData) : userData;
    const role = (parsed as { role?: unknown } | null)?.role;
    return typeof role === 'string' ? role : null;
  } catch {
    return null;
  }
}
