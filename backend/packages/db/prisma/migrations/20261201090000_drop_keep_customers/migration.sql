-- "Try once to keep a customer who says no" is now always on, so it is no longer a setting.
ALTER TABLE "ai_rules" DROP COLUMN "keep_customers";
