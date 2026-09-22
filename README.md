# Langova

A full-stack ed-tech platform for standardized English exam prep (IELTS, TOEFL, Linguaskill) — mock exams with automated grading, results analytics, booking, and subscriptions.

**Live:** [langovaprep.com](https://langovaprep.com)

## What it does

Langova runs the full loop for exam prep: students take full-length mock exams, get automatically graded (including LLM-assisted scoring for writing and speaking sections), see section-by-section performance breakdowns, book tutor sessions, and manage subscriptions — all in one platform.

Built and shipped solo, from architecture through production deployment and billing.

## Tech Stack

- **Frontend:** Next.js, React, TypeScript, Tailwind CSS
- **Backend:** Next.js API routes, serverless functions
- **Database:** PostgreSQL
- **Payments:** Stripe (subscriptions, billing)
- **AI:** Groq — LLM-assisted grading pipeline for open-response sections
- **Deployment:** Vercel

## Key Features

- Full exam simulation across 3 exam formats
- Automated grading pipeline, including LLM scoring for subjective sections
- Student analytics dashboards
- Tutor booking system
- Subscription billing and payment handling
- Internal finance/reporting tooling (revenue, payouts)

## Notes

This is a showcase repo describing the production platform at langovaprep.com. The live codebase is private; this repo documents the architecture and stack for portfolio purposes.

## Author

Built by [Ahmed Montasser](https://www.linkedin.com/in/ahmed-montasser-a15a55215/) — AI Systems Engineer, edge autonomy & computer vision, full-stack product development.
