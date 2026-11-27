# Converso (WhatsApp AI sales agent)
Spec: docs/SPEC.md (this file lives in backend/). Read it before starting any task.

## Stack
pnpm + Turborepo (shared packages in packages/), TypeScript strict, NestJS (api), BullMQ worker (worker),
Next.js App Router + Tailwind + shadcn (../frontend, a standalone pnpm project), Postgres + Prisma (packages/db), Redis. LLM: OpenRouter (@wa/ai), not the Anthropic SDK.

## Rules
- Every table and query is scoped by business_id. Never write an unscoped query.
- Money is an integer count of the business currency's minor unit (cents, kobo, ...). Never floats. Use formatMoney/parseMoney from @wa/shared; never hard-code a currency symbol.
- Webhook handlers verify signatures, are idempotent, and return 200 fast; work goes to the queue.
- The AI never invents prices, stock or fees: they come from tool results only.
- Validate all inputs with zod. No `any`.
- Secrets only from env; never log tokens or full phone numbers.
- Write tests for tools, webhooks and tenant isolation. Run `pnpm test` before finishing.

## Commands
Layout: repo root has only backend/ and frontend/. Run backend commands from backend/, frontend commands from frontend/.
Env: backend/.env (copy backend/.env.example) and frontend/.env.local (copy frontend/.env.example); never put secrets in the frontend env.
pnpm infra:up | pnpm dev | pnpm test | pnpm db:migrate | pnpm lint
Agent (needs OPENROUTER_API_KEY): pnpm --filter @wa/worker chat | eval | embed:backfill
Demo login after `pnpm --filter @wa/db db:seed`: demo@lekkichops.test / demo-password-1
Product: a multi-tenant SaaS for businesses in ANY country (each has a country, currency, timezone) and of any kind: products, services (quotes and bookings) or both. Vendors sign up themselves; never assume a single business, country, currency or that stock/delivery applies.
(pnpm lives in ~/.local/bin on this machine: export PATH=~/.local/bin:$PATH)
