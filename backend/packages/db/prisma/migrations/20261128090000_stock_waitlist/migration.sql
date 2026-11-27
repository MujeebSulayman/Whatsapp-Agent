-- Sold-out handling: owner-written restock note, optional pre-orders, and a waitlist of customers to tell when stock returns.
ALTER TABLE "products" ADD COLUMN "restock_note" TEXT;
ALTER TABLE "products" ADD COLUMN "allow_preorder" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "waitlist_entries" (
  "id" TEXT NOT NULL,
  "business_id" TEXT NOT NULL,
  "product_id" TEXT NOT NULL,
  "variant" TEXT,
  "customer_id" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'waiting',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "notified_at" TIMESTAMP(3),
  CONSTRAINT "waitlist_entries_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "waitlist_entries_business_id_product_id_status_idx" ON "waitlist_entries"("business_id", "product_id", "status");
-- One waiting entry per customer per product+variant (repeat requests are no-ops).
CREATE UNIQUE INDEX "waitlist_entries_one_waiting" ON "waitlist_entries"("customer_id", "product_id", COALESCE("variant", '')) WHERE "status" = 'waiting';
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
