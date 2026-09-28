-- Expand only: the old application still writes without owners until JAR-013.
-- Do not infer ownership from browser conversation IDs or the first User row.
ALTER TABLE "Todo" ADD COLUMN "ownerId" TEXT;
ALTER TABLE "Note" ADD COLUMN "ownerId" TEXT;
ALTER TABLE "ShoppingItem" ADD COLUMN "ownerId" TEXT;
ALTER TABLE "CalendarEvent" ADD COLUMN "ownerId" TEXT;
ALTER TABLE "Todo" ADD CONSTRAINT "Todo_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Note" ADD CONSTRAINT "Note_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ShoppingItem" ADD CONSTRAINT "ShoppingItem_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Todo_ownerId_createdAt_idx" ON "Todo"("ownerId", "createdAt");
CREATE INDEX "Note_ownerId_createdAt_idx" ON "Note"("ownerId", "createdAt");
CREATE INDEX "ShoppingItem_ownerId_createdAt_idx" ON "ShoppingItem"("ownerId", "createdAt");
CREATE INDEX "CalendarEvent_ownerId_when_idx" ON "CalendarEvent"("ownerId", "when");

CREATE TABLE "Conversation" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "ownerId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "Conversation_ownerId_createdAt_idx" ON "Conversation"("ownerId", "createdAt");
CREATE TABLE "IntegrationAccount" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "ownerId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "provider" TEXT NOT NULL,
  "providerSubject" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "IntegrationAccount_provider_providerSubject_key" ON "IntegrationAccount"("provider", "providerSubject");
CREATE INDEX "IntegrationAccount_ownerId_provider_idx" ON "IntegrationAccount"("ownerId", "provider");
ALTER TABLE "GoogleOAuthToken" ADD COLUMN "integrationAccountId" TEXT;
ALTER TABLE "GoogleOAuthToken" ADD CONSTRAINT "GoogleOAuthToken_integrationAccountId_fkey" FOREIGN KEY ("integrationAccountId") REFERENCES "IntegrationAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "GoogleOAuthToken_integrationAccountId_key" ON "GoogleOAuthToken"("integrationAccountId");

CREATE TABLE "LegacyOwnershipBatch" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "digest" TEXT NOT NULL,
  "manifest" JSONB NOT NULL,
  "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "restoredAt" TIMESTAMP(3)
);
CREATE TABLE "LegacyOwnershipRecord" (
  "batchId" TEXT NOT NULL REFERENCES "LegacyOwnershipBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "tableName" TEXT NOT NULL,
  "recordId" TEXT NOT NULL,
  "original" JSONB NOT NULL,
  "assignedOwnerId" TEXT,
  PRIMARY KEY ("batchId", "tableName", "recordId"),
  CHECK ("tableName" IN ('Todo', 'Note', 'ShoppingItem', 'CalendarEvent'))
);
