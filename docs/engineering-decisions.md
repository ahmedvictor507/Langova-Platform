# Engineering decisions

Problems I hit building Langova and how I solved them.

## A rate limiter attackers can't reset
The first limiter was in-memory. On serverless, every instance has its own counters, so an attacker who lands on a different instance gets a fresh budget. That is fine for blunting accidental hammering but not for a login throttle. I added a Postgres-backed variant that increments in a single atomic `INSERT ... ON CONFLICT DO UPDATE ... RETURNING`, because read-then-write lets two concurrent requests both see the same count. It fails open and falls back to the in-memory limiter, so a database blip degrades to per-instance limiting instead of taking login down. See [samples/rateLimit.ts](../samples/rateLimit.ts).

## Webhooks that silently never arrived
A video-provider webhook was rejecting every genuine delivery. My first verifier hashed the body alone with the secret as a plain string. The provider decodes the secret from base-64, signs `timestamp.rawBody` and sends a base-64 digest. The verification probe at registration time is unsigned, so it also failed and the webhook could never be created. The fix follows the provider's spec exactly, compares in constant time and treats the probe as a named case. See [samples/dailyWebhook.ts](../samples/dailyWebhook.ts).

## Sessions that survive a password reset
Sessions are JWTs with a 30-day life and no server-side store, so resetting a password didn't evict the person already signed in, who is often the reason for the reset. Each user has a `sessionVersion` stamped into the token. A reset bumps it, and the auth callback refuses any token that doesn't match.

## Business rules shared by client and server
Pricing, cancellation and scoring rules are pure functions with no server-only imports. The booking screen shows exactly the figures the server will apply, and the student's, teacher's and platform's numbers are derived in one place so they can't disagree. A side benefit is that they unit-test with an injectable clock.

## Stale third-party ids
A stored Stripe id isn't proof the object still exists. Mode switches, rotated keys and dashboard cancellations leave dead ids behind. Errors are classified by shape (duck-typed, not `instanceof`) so a missing resource is handled and recreated instead of becoming a permanent 502 on a button the student can't avoid.

## Edge-safe role gating
Middleware runs on the Edge with only the JWT, so it can't query the database. It does a cheap first pass on roles, and the layouts, which can hit Postgres, make the authoritative check.

## Grading like the real exam
Each exam board has its own Writing and Speaking criteria and its own raw-to-band scaling. One generic rubric would grade a TOEFL answer against IELTS's criteria, which isn't what a real examiner does.

## Shipping safely
`tsc`, lint and tests can all pass while `next build` fails, and a failed build means the host keeps serving the old deploy without any visible error. A production build is part of the definition of done.

## Bilingual interface
English and Arabic, including right-to-left layout. The middleware resolves the language from the URL and the saved choice and passes it to server components as a request header, so layouts never re-derive it and disagree.
