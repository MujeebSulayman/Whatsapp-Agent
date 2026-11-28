-- Required setup as structured answers: how customers pay, how they receive things, returns, and the rules orders must follow.
ALTER TABLE "businesses" ADD COLUMN "pay_methods" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "businesses" ADD COLUMN "bank_name" TEXT;
ALTER TABLE "businesses" ADD COLUMN "bank_account_number" TEXT;
ALTER TABLE "businesses" ADD COLUMN "bank_account_name" TEXT;
ALTER TABLE "businesses" ADD COLUMN "fulfilment" TEXT;
ALTER TABLE "businesses" ADD COLUMN "address" TEXT;
ALTER TABLE "businesses" ADD COLUMN "return_type" TEXT;
ALTER TABLE "businesses" ADD COLUMN "return_days" INTEGER;
ALTER TABLE "businesses" ADD COLUMN "notice_hours" INTEGER;
ALTER TABLE "businesses" ADD COLUMN "cancellation_hours" INTEGER;
ALTER TABLE "businesses" ADD COLUMN "deposit_required" BOOLEAN;
ALTER TABLE "businesses" ADD COLUMN "min_order_minor" INTEGER;
