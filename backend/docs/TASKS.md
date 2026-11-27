# Build tasks

Legend: [x] done and tested · [~] built, needs a live key/account to verify · [ ] not built

## Backend
- [x] Database schema, migrations, demo seed (Lekki Small Chops + demo login)
- [x] WhatsApp webhook: verify, signature check, de-duplication, queue
- [x] AI worker: agent loop on OpenRouter, handoff, fallback, cost logging
- [x] Self-serve accounts: signup creates an isolated business, login, JWT, owner/agent roles, login rate limit
- [x] Service basics: 14-day trial fields and usage, per-business daily AI spend cap, data export, account deletion
- [x] Business settings: profile, hours, AI rules, AI on/off, WhatsApp connection (encrypted token)
- [x] Catalog: products (CRUD + CSV import), delivery zones, FAQs
- [x] Inbox: conversations, messages, take over, hand back, send as human, 24-hour window rule
- [x] Orders: list, detail, status updates, mark paid manually (idempotent, adjusts stock)
- [x] Customers: list with order history, notes
- [x] Analytics: chats, orders, revenue, AI-handled %, top products
- [x] Team: list, add agent, remove (instant lock-out)
- [x] AI tools: search_products, check_stock, get_delivery_fee, create_order, check_order_status, apply_discount, send_product_image, save_customer_detail, handoff_to_human
- [x] Owner alert on handoff / AI problems (WhatsApp message to the owner's number)
- [x] Tests: auth, roles, tenant isolation on every route, tools, safeguards, currencies, services (91 tests)
- [~] Vector product search: code and database tested with synthetic vectors; needs OPENROUTER_API_KEY to embed real text
- [~] Agent evals: 15 scripted chats + runner (`pnpm --filter @wa/worker eval`); needs OPENROUTER_API_KEY
- [~] Terminal chat with the real agent (`pnpm --filter @wa/worker chat`); needs OPENROUTER_API_KEY

## Dashboard
- [x] Design system (neutral palette, one dark accent, status colours only)
- [x] Login, signup, guided setup for new vendors
- [x] Inbox: live refresh (4s), takeover, hand back, reply, customer panel
- [x] Orders (with status actions), Products (CSV import), Customers
- [x] AI assistant settings, Business settings (profile, delivery, FAQs, WhatsApp, data & privacy)
- [x] Analytics, Team

## Any country, any business
- [x] Per-business country, currency and timezone; money stored in minor units (works for 0-, 2- and 3-decimal currencies)
- [x] Signup asks for country only: currency and timezone are worked out automatically
- [x] Broad category list (home services, trades, automotive, wellness, professional, events, education, retail...) plus "type your own"
- [x] Business type (products, services, both) drives wording, stock tracking and the AI agent's booking behaviour
- [ ] Per-country WhatsApp message pricing (Meta rates differ by country) in usage tracking
- [ ] Languages: the agent replies in the customer's language; dashboard text is English only
- [ ] Appointment calendar and availability for service businesses (bookings record a preferred time for now)

## Left out on purpose
- [ ] Paystack payments, payment links, subscriptions and wallet: test payments first
- [ ] Voice notes and image understanding: need a speech-to-text / vision provider chosen
- [ ] Email verification and password reset: need an email provider
- [ ] Meta Embedded Signup: needs your approved Meta Tech Provider app; manual connect is built instead
- [ ] Push (instant) inbox updates: the inbox polls every few seconds for now
- [ ] FAQ vector search (all FAQs are included in the prompt for now)
- [ ] Broadcasts, follow-ups, delivery integrations (v2 in the spec)
