-- Owner choice: try once to keep a customer who says no (default), or let them go politely.
ALTER TABLE "ai_rules" ADD COLUMN "keep_customers" BOOLEAN NOT NULL DEFAULT true;
