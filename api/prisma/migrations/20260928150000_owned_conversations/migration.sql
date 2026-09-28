ALTER TABLE "Conversation" ADD COLUMN "clientKey" TEXT;
UPDATE "Conversation" SET "clientKey" = "id";
ALTER TABLE "Conversation" ALTER COLUMN "clientKey" SET NOT NULL;
CREATE UNIQUE INDEX "Conversation_ownerId_clientKey_key" ON "Conversation"("ownerId", "clientKey");
