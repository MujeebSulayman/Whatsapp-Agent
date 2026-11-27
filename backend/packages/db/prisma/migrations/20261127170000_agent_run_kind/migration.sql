-- AI work that is not a customer chat (setup help, assistant preview) is recorded too, so it counts toward the spend cap.
ALTER TABLE "agent_runs" ALTER COLUMN "conversation_id" DROP NOT NULL;
ALTER TABLE "agent_runs" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'chat';
