-- Any country, any currency: each business has an ISO country, an ISO 4217 currency and money is stored in minor units.
ALTER TABLE "businesses" ADD COLUMN "country" TEXT NOT NULL DEFAULT 'NG';
ALTER TABLE "businesses" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'NGN';
ALTER TABLE "businesses" ALTER COLUMN "city" SET DEFAULT '';

-- "kobo" was Nigeria-specific; the amounts are unchanged, only the column names are generic now.
ALTER TABLE "products" RENAME COLUMN "price_kobo" TO "price_minor";
ALTER TABLE "delivery_zones" RENAME COLUMN "fee_kobo" TO "fee_minor";
ALTER TABLE "customers" RENAME COLUMN "total_spent_kobo" TO "total_spent_minor";
ALTER TABLE "orders" RENAME COLUMN "subtotal_kobo" TO "subtotal_minor";
ALTER TABLE "orders" RENAME COLUMN "delivery_fee_kobo" TO "delivery_fee_minor";
ALTER TABLE "orders" RENAME COLUMN "discount_kobo" TO "discount_minor";
ALTER TABLE "orders" RENAME COLUMN "total_kobo" TO "total_minor";
ALTER TABLE "payments" RENAME COLUMN "amount_kobo" TO "amount_minor";
ALTER TABLE "broadcasts" RENAME COLUMN "cost_estimate_kobo" TO "cost_estimate_minor";

-- Existing orders keep their line items; only the JSON key names change.
UPDATE "orders" SET "items" = COALESCE((
  SELECT jsonb_agg((elem - 'unit_price_kobo' - 'line_total_kobo') || jsonb_strip_nulls(jsonb_build_object(
    'unit_price_minor', elem->'unit_price_kobo', 'line_total_minor', elem->'line_total_kobo')))
  FROM jsonb_array_elements("items") AS elem
), '[]'::jsonb)
WHERE jsonb_typeof("items") = 'array' AND jsonb_array_length("items") > 0;
