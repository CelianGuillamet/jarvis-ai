-- CreateTable
CREATE TABLE "JarvisKnowledgeEntry" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "tags" TEXT NOT NULL DEFAULT '[]',
    "category" TEXT NOT NULL DEFAULT 'general',
    "useCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JarvisKnowledgeEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JarvisTimeInsight" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "metricName" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'minutes',
    "period" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JarvisTimeInsight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JarvisDelegation" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "taskDescription" TEXT NOT NULL,
    "delegateTo" TEXT NOT NULL,
    "reason" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "dueDate" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "resolutionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JarvisDelegation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JarvisKnowledgeEntry_sessionId_category_updatedAt_idx" ON "JarvisKnowledgeEntry"("sessionId", "category", "updatedAt");

-- CreateIndex
CREATE INDEX "JarvisKnowledgeEntry_sessionId_useCount_idx" ON "JarvisKnowledgeEntry"("sessionId", "useCount");

-- CreateIndex
CREATE INDEX "JarvisTimeInsight_sessionId_metricName_periodStart_idx" ON "JarvisTimeInsight"("sessionId", "metricName", "periodStart");

-- CreateIndex
CREATE INDEX "JarvisTimeInsight_sessionId_period_idx" ON "JarvisTimeInsight"("sessionId", "period");

-- CreateIndex
CREATE INDEX "JarvisDelegation_sessionId_status_createdAt_idx" ON "JarvisDelegation"("sessionId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "JarvisDelegation_sessionId_delegateTo_idx" ON "JarvisDelegation"("sessionId", "delegateTo");
