# WhatsApp AI Sales Agent
Spec: backend/docs/SPEC.md. Read it before starting any task.

## Stack
pnpm + Turborepo (shared packages in backend/packages), TypeScript strict, NestJS (backend/api), BullMQ worker (backend/worker),
Next.js App Router + Tailwind + shadcn (frontend), Postgres + Prisma (packages/db), Redis.

## Rules
- Every table and query is scoped by business_id. Never write an unscoped query.
- Money is integer kobo. Never floats.
- Webhook handlers verify signatures, are idempotent, and return 200 fast; work goes to the queue.
- The AI never invents prices, stock or fees: they come from tool results only.
- Validate all inputs with zod. No `any`.
- Secrets only from env; never log tokens or full phone numbers.
- Write tests for tools, webhooks and tenant isolation. Run `pnpm test` before finishing.

## Commands
pnpm infra:up | pnpm dev | pnpm test | pnpm db:migrate | pnpm lint
(pnpm lives in ~/.local/bin on this machine: export PATH=~/.local/bin:$PATH)
