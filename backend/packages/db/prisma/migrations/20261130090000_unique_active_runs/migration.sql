-- A customer can have only one active run of a playbook, even when two messages arrive at the same instant.
-- Tidy any existing duplicates first (keep the newest active run, close the rest).
UPDATE "playbook_runs" SET "status" = 'completed', "completed_at" = now()
WHERE "status" = 'active' AND "id" NOT IN (
  SELECT DISTINCT ON ("customer_id", "playbook_id") "id" FROM "playbook_runs" WHERE "status" = 'active' ORDER BY "customer_id", "playbook_id", "created_at" DESC
);
CREATE UNIQUE INDEX "playbook_runs_one_active" ON "playbook_runs"("customer_id", "playbook_id") WHERE "status" = 'active';
