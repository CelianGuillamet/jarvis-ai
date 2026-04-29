-- CreateTable
CREATE TABLE "JarvisWorkflowMemory" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "triggerToolName" TEXT NOT NULL,
    "triggerSummary" TEXT NOT NULL,
    "followUpToolName" TEXT NOT NULL,
    "followUpPrompt" TEXT NOT NULL,
    "followUpPromptKey" TEXT NOT NULL,
    "usageCount" INTEGER NOT NULL DEFAULT 1,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JarvisWorkflowMemory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "JarvisWorkflowMemory_sessionId_triggerToolName_followUpPromptK_key" ON "JarvisWorkflowMemory"("sessionId", "triggerToolName", "followUpPromptKey");

-- CreateIndex
CREATE INDEX "JarvisWorkflowMemory_sessionId_triggerToolName_updatedAt_idx" ON "JarvisWorkflowMemory"("sessionId", "triggerToolName", "updatedAt");

-- CreateIndex
CREATE INDEX "JarvisWorkflowMemory_sessionId_usageCount_updatedAt_idx" ON "JarvisWorkflowMemory"("sessionId", "usageCount", "updatedAt");
