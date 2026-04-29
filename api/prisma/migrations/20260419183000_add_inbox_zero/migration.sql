-- CreateTable
CREATE TABLE "InboxZeroSession" (
    "sessionId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "step" TEXT NOT NULL DEFAULT 'urgent',
    "query" TEXT NOT NULL DEFAULT 'in:inbox is:unread',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scannedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InboxZeroSession_pkey" PRIMARY KEY ("sessionId")
);

-- CreateTable
CREATE TABLE "InboxZeroItem" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "from" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "snippet" TEXT NOT NULL,
    "labelsJson" TEXT NOT NULL DEFAULT '[]',
    "gmailCategory" TEXT,
    "unread" BOOLEAN NOT NULL,
    "category" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "reason" TEXT,
    "suggestedJson" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "lastActionAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InboxZeroItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InboxZeroAction" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "messageId" TEXT,
    "actionType" TEXT NOT NULL,
    "payloadJson" TEXT,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InboxZeroAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InboxZeroSession_status_updatedAt_idx" ON "InboxZeroSession"("status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "InboxZeroItem_sessionId_messageId_key" ON "InboxZeroItem"("sessionId", "messageId");

-- CreateIndex
CREATE INDEX "InboxZeroItem_sessionId_category_status_updatedAt_idx" ON "InboxZeroItem"("sessionId", "category", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "InboxZeroAction_sessionId_createdAt_idx" ON "InboxZeroAction"("sessionId", "createdAt");

-- AddForeignKey
ALTER TABLE "InboxZeroItem" ADD CONSTRAINT "InboxZeroItem_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "InboxZeroSession"("sessionId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboxZeroAction" ADD CONSTRAINT "InboxZeroAction_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "InboxZeroSession"("sessionId") ON DELETE CASCADE ON UPDATE CASCADE;

