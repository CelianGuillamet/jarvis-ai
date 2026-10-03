CREATE UNIQUE INDEX "Command_id_ownerId_conversationId_key" ON "Command"("id", "ownerId", "conversationId");

CREATE TABLE "ConversationTurn" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "inputText" TEXT NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'started',
  "response" JSONB,
  "commandId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ConversationTurn_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ConversationTurn_kind_check" CHECK ("kind" IN ('chat', 'confirm')),
  CONSTRAINT "ConversationTurn_state_check" CHECK ("state" IN ('started', 'completed', 'failed')),
  CONSTRAINT "ConversationTurn_response_check" CHECK (("state" = 'completed') = ("response" IS NOT NULL)),
  CONSTRAINT "ConversationTurn_conversation_owner_fkey" FOREIGN KEY ("conversationId", "ownerId") REFERENCES "Conversation"("id", "ownerId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ConversationTurn_command_owner_fkey" FOREIGN KEY ("commandId", "ownerId", "conversationId") REFERENCES "Command"("id", "ownerId", "conversationId") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "ConversationTurn_ownerId_conversationId_createdAt_id_idx" ON "ConversationTurn"("ownerId", "conversationId", "createdAt", "id");
CREATE INDEX "ConversationTurn_command_history_idx" ON "ConversationTurn"("ownerId", "conversationId", "commandId", "createdAt", "id");
