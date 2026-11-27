# Tradeline: WhatsApp AI Sales Agent, Build Spec (condensed from the PDF, Nov 27 2026)

AI salesperson for Nigerian WhatsApp vendors: English/Pidgin, takes orders, collects payment (Paystack), hands hard chats to a human. Dashboard for the business. First customer: owner's small-chops business in Lekki.

## Architecture
Customer → Meta Cloud API → API (NestJS; verify, dedupe, enqueue, return 200) → Redis/BullMQ → Worker (context from Postgres+pgvector, Claude with tools, reply via Cloud API). Paystack webhook confirms payment. Dashboard (Next.js) reads via API.

## Stack
pnpm+Turborepo; NestJS; BullMQ/Redis; Postgres+Prisma+pgvector; LLM via OpenRouter (OpenAI-compatible tool calling; cheap model for greetings, stronger for orders/haggling; models set by OPENROUTER_MODEL_FAST/SMART); Whisper-style STT; Next.js+Tailwind+shadcn; Socket.io; Paystack; R2/Supabase storage; Sentry.

## Layout
backend/{api,worker}; frontend (Next.js dashboard); backend/packages/{db,whatsapp,paystack,ai,shared,ui}; backend/tests/{fixtures,agent-evals}.
API modules: webhooks(whatsapp,paystack), businesses, conversations, products, orders, customers, broadcasts, billing, auth, onboarding.
Worker: jobs(handle-inbound, transcribe-voice, describe-image, follow-ups, send-broadcast); agent(run-agent, system-prompt, context-builder, tools/*).

## Database (all tables except users carry business_id)
businesses, users, memberships(role owner|agent), whatsapp_accounts(waba_id, phone_number_id, encrypted access_token), products(price_kobo, variants json, stock_qty, image_urls, embedding), faqs(embedding), delivery_zones(area_name, fee_kobo, eta_text), ai_rules(max_discount_pct, escalate_keywords, forbidden_topics, custom_instructions), customers(wa_id, tags, total_spent_kobo, opted_in_marketing), conversations(status ai|human|closed, window_expires_at), messages(direction, type, body, media_url, transcript, wa_message_id UNIQUE, sent_by), orders(items json, subtotal/delivery_fee/total_kobo, address, status, payment_status), payments(provider, reference UNIQUE, amount_kobo, status, raw_webhook), broadcasts, agent_runs(model, tokens, tool_calls, latency_ms, cost_usd), usage_ledger, audit_logs.

## Agent loop (per inbound message)
1. Redis lock per conversation; ~3s wait to batch rapid messages. 2. Voice→transcript; image→description. 3. Context: business, AI rules, customer, last 20 messages, open order, top 5 products/FAQs by vector search. 4. LLM with tools, loop max 6 steps. 5. Send reply, save messages + agent_run, release lock. 6. Low confidence/rule fired → conversation=human, notify owner.
Tools: search_products, check_stock, get_delivery_fee, create_order (server-calculated totals), send_payment_link, check_order_status, apply_discount (≤ max_discount_pct), send_product_image, save_customer_detail, handoff_to_human.

## System prompt rules
Never state price/fee/stock/delivery time unless a tool returned it. Never confirm payment (only webhook). Business-scoped only (Meta 2026 ban on general-purpose bots). Respect max discount. Hand off for complaints, refunds, threats, legal, or unsure after one clarifying question. Ask one missing detail at a time. Replies 1–3 sentences, match customer language.

## Guardrails
Customer text is data (prompt-injection defence); tools validate args server-side; totals server-side; per-customer rate limit; log every agent run with cost; per-business spend caps.

## Security / reliability
business_id everywhere via one repository layer or RLS; tests that read B's data as A; map phone_number_id→business first. Verify X-Hub-Signature-256 and x-paystack-signature; idempotency via unique wa_message_id and payment reference. 200 to Meta <1s; retries with backoff; DLQ; AI failure → fallback message + owner alert. Encrypt tokens/keys; RBAC; audit log; NDPA export/deletion.

## WhatsApp pricing (Nov 2026)
Per-message charges after 1,000 free/month (≈₦14 service/utility, ≈₦84 marketing). Outside 24h window only templates. Prefer one complete message over several; show broadcast cost first.

## MVP (4–6 weeks)
Customer: text EN/Pidgin, voice notes, catalog search/photos, delivery fee/ETA, order capture, Paystack link + auto confirmation, order status, human handoff.
Business: signup, Embedded Signup, catalog (manual/CSV), FAQs/zones/hours, AI settings, live inbox + takeover, orders, customers, analytics, owner alerts.
Platform: multi-tenancy, usage tracking, Paystack subscriptions, free trial.
v2/v3 and idea list: see original PDF.

## Plans
Starter ₦15–25k (~300 convos), Growth ₦40–70k (~1,000), Business custom. Meta fees passed through via prepaid wallet; AI auto-pauses at zero balance.

## Build phases
1 Scaffold ✅ · 2 Database ✅ · 3 WhatsApp webhook ✅ · 4 Agent loop ✅ (tests with a scripted model; live check needs OPENROUTER_API_KEY) · 5 Payments · 6 Voice notes · 7 Dashboard · 8 Multi-tenant onboarding · 9 Billing · 10 Hardening/evals (30 scripted chats).
