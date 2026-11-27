-- AlterTable
ALTER TABLE "users" ADD COLUMN "password_hash" TEXT;

-- AlterTable
ALTER TABLE "businesses" ADD COLUMN "trial_ends_at" TIMESTAMP(3),
ADD COLUMN "ai_daily_cap_usd" DECIMAL(10,2) NOT NULL DEFAULT 5,
ADD COLUMN "deleted_at" TIMESTAMP(3);
