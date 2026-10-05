CREATE TABLE "InboxReplyDraft" (
  "ownerId" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "version" INTEGER NOT NULL CHECK ("version" > 0),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InboxReplyDraft_pkey" PRIMARY KEY ("ownerId", "conversationId", "messageId"),
  CONSTRAINT "InboxReplyDraft_conversationId_ownerId_fkey" FOREIGN KEY ("conversationId", "ownerId") REFERENCES "Conversation"("id", "ownerId") ON DELETE RESTRICT ON UPDATE CASCADE
);
