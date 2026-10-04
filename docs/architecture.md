# Architecture overview

```
Browser ──► Next.js (Vercel)
            ├─ App Router pages: student dashboard, teacher area, admin, public site
            ├─ Route handlers (/api/*): bookings, exams, billing, groups, messages ...
            └─ Cron routes: reminders, settlement, cleanup
                 │
                 ├─► PostgreSQL (Prisma, packages/db)
                 ├─► Stripe        (checkout, subscriptions, webhooks)
                 ├─► Groq          (exam generation, writing/speaking grading)
                 ├─► Daily         (video rooms, presence webhooks)
                 └─► SMTP          (transactional email)
```

## Repository layout (private)

```
apps/frontend     Next.js app: pages, components, API routes, domain logic in src/lib
packages/db       Prisma schema, migrations, seed and maintenance scripts
```

## Design notes

- **Domain logic in plain modules.** Pricing, cancellation, scoring and scheduling rules are pure functions in `src/lib`, free of server-only imports. That keeps them unit-testable and lets the client preview exactly what the server will do.
- **Exam pipeline.** Papers are built from a blueprint per exam type, drawn from a pool, and graded in two paths: deterministic scoring for objective sections and an LLM queue for Writing and Speaking, with rubrics specific to each exam board.
- **Payments.** Stripe webhooks are the source of truth. Fulfilment is idempotent so a retried webhook can't grant credit twice.
- **Roles.** Students, teachers and admins share one user model with role-gated routes enforced in middleware and again in handlers.
- **Groups.** Demand from student requests feeds a formation queue; groups get chat, polls and schedule-change flows.
- **Quality gates.** Typecheck, lint, Vitest and `next build` must all pass before a deploy.
