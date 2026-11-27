-- Playbooks: the owner's own step-by-step ways of handling customers, and each customer's progress through one.
CREATE TABLE "playbooks" (
  "id" TEXT NOT NULL,
  "business_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "when_to_use" TEXT NOT NULL,
  "steps" JSONB NOT NULL,
  "finish" TEXT NOT NULL DEFAULT 'handoff',
  "finish_message" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "playbooks_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "playbooks_business_id_active_idx" ON "playbooks"("business_id", "active");
ALTER TABLE "playbooks" ADD CONSTRAINT "playbooks_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "playbook_runs" (
  "id" TEXT NOT NULL,
  "business_id" TEXT NOT NULL,
  "playbook_id" TEXT NOT NULL,
  "customer_id" TEXT NOT NULL,
  "conversation_id" TEXT,
  "answers" JSONB NOT NULL DEFAULT '{}',
  "status" TEXT NOT NULL DEFAULT 'active',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMP(3),
  CONSTRAINT "playbook_runs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "playbook_runs_business_id_status_created_at_idx" ON "playbook_runs"("business_id", "status", "created_at");
CREATE INDEX "playbook_runs_customer_id_playbook_id_status_idx" ON "playbook_runs"("customer_id", "playbook_id", "status");
ALTER TABLE "playbook_runs" ADD CONSTRAINT "playbook_runs_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "playbook_runs" ADD CONSTRAINT "playbook_runs_playbook_id_fkey" FOREIGN KEY ("playbook_id") REFERENCES "playbooks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "playbook_runs" ADD CONSTRAINT "playbook_runs_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
