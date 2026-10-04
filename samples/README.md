# Code samples

Small, self-contained files taken from the private Langova codebase. They contain no business rules or credentials.

| File | What it shows |
|---|---|
| [rateLimit.ts](rateLimit.ts) | Two-tier rate limiting: a fast in-memory limiter, plus a Postgres-backed one using a single atomic upsert so concurrent requests can't both slip through. It fails open and falls back to per-instance limiting. |
| [dailyWebhook.ts](dailyWebhook.ts) | HMAC webhook verification done to the provider's real spec (base-64 key, signed timestamp, constant-time compare), and why the unsigned probe request must be let through. |
| [apiHandler.ts](apiHandler.ts) | A generic wrapper that logs unhandled errors with context and returns one consistent 500 envelope. |
| [schema-excerpt.prisma](schema-excerpt.prisma) | A trimmed slice of the data model, showing session invalidation, timezone and email-preference decisions. |

These files import project modules (`@/lib/db`, `@/lib/logger`) that are not included, so they are for reading, not running.
