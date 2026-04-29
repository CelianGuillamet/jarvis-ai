-- CreateTable
CREATE TABLE "JarvisActionEvent" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "pendingActionId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'chat',
    "toolName" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "argsJson" TEXT,
    "planner" TEXT,
    "confidence" TEXT,
    "risk" TEXT,
    "status" TEXT NOT NULL,
    "resultPreview" TEXT,
    "errorMessage" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JarvisActionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "JarvisActionEvent_pendingActionId_key" ON "JarvisActionEvent"("pendingActionId");

-- CreateIndex
CREATE INDEX "JarvisActionEvent_sessionId_createdAt_idx" ON "JarvisActionEvent"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "JarvisActionEvent_sessionId_status_updatedAt_idx" ON "JarvisActionEvent"("sessionId", "status", "updatedAt");
