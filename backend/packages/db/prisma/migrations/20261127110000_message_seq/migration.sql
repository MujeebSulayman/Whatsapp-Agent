-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "seq" SERIAL NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "messages_seq_key" ON "messages"("seq");
