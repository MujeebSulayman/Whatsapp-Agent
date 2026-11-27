-- Businesses can sell products, services (quotes and bookings), or both.
CREATE TYPE "BusinessKind" AS ENUM ('goods', 'services', 'both');
ALTER TABLE "businesses" ADD COLUMN "kind" "BusinessKind" NOT NULL DEFAULT 'goods';
-- Services and made-to-order items are not limited by stock.
ALTER TABLE "products" ADD COLUMN "track_stock" BOOLEAN NOT NULL DEFAULT true;
