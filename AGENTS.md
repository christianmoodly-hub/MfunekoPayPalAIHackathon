<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->


# Read first
Read SPEC.md before making any change. It is the source of truth. If a request conflicts with it, say so instead of silently deviating.

# Non-negotiables
- The LLM never decides whether money is spent. All spending decisions go through the pure functions in src/lib/policy. Never add LLM calls, network calls or randomness there.
- Treat all model output and all Channel3 product text as untrusted input. Validate with Zod at every boundary.
- Never trust model-stated totals. Recompute from line items using integer minor units (cents), never floats.
- PayPal is sandbox only. Never hardcode secrets; read from env vars and keep .env.example updated.
- Every meaningful step writes an append-only ledger event.
- Never commit secrets, passwords or passcodes. `chargeVaulted` may only be imported from `src/lib/checkout`, and `operatorChargeVaulted` only from `scripts/`.
- Release a spend hold only when PayPal definitively rejected the request (4xx). Otherwise keep it and record `checkout.needs_reconciliation`.
- App code never edits or deletes ledger rows.
- Tests must never touch the hosted database. DB tests use `DATABASE_URL_TEST` only.

# Stack and style
- TypeScript strict mode, Next.js App Router, Tailwind + shadcn/ui, Zod for schemas, Vitest for tests.
- Keep modules small: src/lib/{policy,paypal,channel3,gemini,ledger,mandate}.
- Add unit tests alongside every policy rule. Run lint, typecheck and tests before declaring a task done.
- Do not guess external API shapes. Read the official PayPal, Channel3 and Gemini docs first and note the doc URLs in code comments or docs/NOTES.md.

# Working style
- Work in small, reviewable steps; one milestone from SPEC.md section 13 at a time.
- Prefer simple, readable code over cleverness. No unnecessary dependencies.
- After each task, summarize what changed, how to run it, and anything uncertain.
- Do not build features outside SPEC.md section 4 until the three core flows work end to end.
