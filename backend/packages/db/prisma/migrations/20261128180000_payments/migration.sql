-- Online payments: each business gets a Paystack subaccount (its bank account) and payment links are recorded on the payment row.
ALTER TABLE "businesses" ADD COLUMN "paystack_subaccount_code" TEXT;
ALTER TABLE "businesses" ADD COLUMN "payout_bank_name" TEXT;
ALTER TABLE "businesses" ADD COLUMN "payout_account_name" TEXT;
ALTER TABLE "businesses" ADD COLUMN "payout_account_last4" TEXT;
ALTER TABLE "payments" ADD COLUMN "checkout_url" TEXT;
ALTER TABLE "payments" ADD COLUMN "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
