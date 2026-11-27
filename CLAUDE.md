# WhatsApp AI Sales Agent
Spec: docs/SPEC.md. Read it before starting any task.

## Stack
pnpm + Turborepo, TypeScript strict, NestJS (apps/api), BullMQ worker (apps/worker),
Next.js App Router + Tailwind + shadcn (apps/dashboard), Postgres + Prisma (packages/db), Redis.

## Rules
- Every table and query is scoped by business_id. Never write an unscoped query.
- Money is integer kobo. Never floats.
- Webhook handlers verify signatures, are idempotent, and return 200 fast; work goes to the queue.
- The AI never invents prices, stock or fees: they come from tool results only.
- Validate all inputs with zod. No `any`.
- Secrets only from env; never log tokens or full phone numbers.
- Write tests for tools, webhooks and tenant isolation. Run `pnpm test` before finishing.

## Commands
pnpm dev | pnpm test | pnpm db:migrate | pnpm lint
(pnpm lives in ~/.local/bin on this machine: export PATH=~/.local/bin:$PATH)
