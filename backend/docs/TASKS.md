# Build tasks

Legend: [x] done · [ ] to do · (later) = deliberately left out for now

## Backend
- [x] Database schema, migrations, seed (Lekki Small Chops)
- [x] WhatsApp webhook: verify, signature check, de-duplication, queue
- [x] AI worker: agent loop on OpenRouter, handoff, fallback, cost logging
- [ ] Self-serve accounts for vendors: signup creates an isolated business, login, JWT, roles (owner / agent), login rate limit
- [ ] Service basics: 14-day trial fields and usage, per-vendor AI spend cap, data export and account deletion
- [ ] Business settings: profile, hours, AI rules, AI on/off, WhatsApp connection
- [ ] Catalog: products (CRUD + CSV import), delivery zones, FAQs
- [ ] Inbox: conversations, messages, take over, hand back, send as human
- [ ] Orders: list, detail, status updates, mark paid manually
- [ ] Customers: list with order history
- [ ] Analytics: chats, orders, revenue, AI-handled %, top products
- [ ] Team: list, add agent, remove
- [ ] AI tools: check_stock, check_order_status, apply_discount, save_customer_detail, send_product_image
- [ ] Owner alert on handoff, per-business daily AI spend cap, usage tracking
- [ ] Vector search for products (embeddings via OpenRouter)
- [ ] Agent eval runner with scripted customer chats
- [ ] Tests: auth, tenant isolation on every route, roles

## Dashboard
- [ ] Design system (neutral, one accent): layout, sidebar, buttons, forms, tables, dialogs
- [ ] Login and signup, onboarding (business + connect WhatsApp)
- [ ] Inbox with live refresh, takeover and reply
- [ ] Orders, Products (with CSV import), Customers
- [ ] AI settings, Business settings (zones, FAQs, WhatsApp)
- [ ] Analytics, Team

## Left out on purpose
- (later) Paystack payments, payment links, subscriptions and wallet: test payments first
- (later) Voice notes and image understanding: need a speech-to-text / vision provider chosen
- (later) Email verification and password reset: need an email provider
- (later) Meta Embedded Signup: needs your approved Meta Tech Provider app; manual connect is built instead
