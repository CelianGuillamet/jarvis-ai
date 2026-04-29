-- CreateTable
CREATE TABLE "JarvisGoal" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "targetDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'active',
    "parentGoalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JarvisGoal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JarvisTaskDependency" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "sourceTaskId" TEXT NOT NULL,
    "targetTaskId" TEXT NOT NULL,
    "dependencyType" TEXT NOT NULL DEFAULT 'blocks',
    "estimatedDays" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JarvisTaskDependency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JarvisResourceAllocation" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceName" TEXT NOT NULL,
    "allocatedHours" DOUBLE PRECISION NOT NULL,
    "usedHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "allocationDate" TIMESTAMP(3) NOT NULL,
    "expiryDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JarvisResourceAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JarvisPredictiveMetric" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "metricType" TEXT NOT NULL,
    "historicalData" TEXT NOT NULL,
    "forecast" TEXT NOT NULL,
    "accuracy" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "forecastedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JarvisPredictiveMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JarvisSchedulingSuggestion" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "taskId" TEXT,
    "suggestedTime" TIMESTAMP(3) NOT NULL,
    "rationale" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "applied" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JarvisSchedulingSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JarvisContextualHelp" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "context" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "relevanceScore" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "viewedCount" INTEGER NOT NULL DEFAULT 0,
    "helpful" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JarvisContextualHelp_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JarvisGoal_sessionId_status_updatedAt_idx" ON "JarvisGoal"("sessionId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "JarvisGoal_sessionId_parentGoalId_idx" ON "JarvisGoal"("sessionId", "parentGoalId");

-- CreateIndex
CREATE INDEX "JarvisTaskDependency_sessionId_sourceTaskId_idx" ON "JarvisTaskDependency"("sessionId", "sourceTaskId");

-- CreateIndex
CREATE INDEX "JarvisTaskDependency_sessionId_targetTaskId_idx" ON "JarvisTaskDependency"("sessionId", "targetTaskId");

-- CreateIndex
CREATE UNIQUE INDEX "JarvisTaskDependency_sessionId_sourceTaskId_targetTaskId_key" ON "JarvisTaskDependency"("sessionId", "sourceTaskId", "targetTaskId");

-- CreateIndex
CREATE INDEX "JarvisResourceAllocation_sessionId_resourceType_allocationD_idx" ON "JarvisResourceAllocation"("sessionId", "resourceType", "allocationDate");

-- CreateIndex
CREATE INDEX "JarvisPredictiveMetric_sessionId_metricType_forecastedAt_idx" ON "JarvisPredictiveMetric"("sessionId", "metricType", "forecastedAt");

-- CreateIndex
CREATE INDEX "JarvisSchedulingSuggestion_sessionId_suggestedTime_idx" ON "JarvisSchedulingSuggestion"("sessionId", "suggestedTime");

-- CreateIndex
CREATE INDEX "JarvisSchedulingSuggestion_sessionId_applied_idx" ON "JarvisSchedulingSuggestion"("sessionId", "applied");

-- CreateIndex
CREATE INDEX "JarvisContextualHelp_sessionId_context_createdAt_idx" ON "JarvisContextualHelp"("sessionId", "context", "createdAt");

-- CreateIndex
CREATE INDEX "JarvisContextualHelp_sessionId_viewedCount_idx" ON "JarvisContextualHelp"("sessionId", "viewedCount");

-- RenameIndex
ALTER INDEX "JarvisWorkflowMemory_sessionId_triggerToolName_followUpPromptK_" RENAME TO "JarvisWorkflowMemory_sessionId_triggerToolName_followUpProm_key";
