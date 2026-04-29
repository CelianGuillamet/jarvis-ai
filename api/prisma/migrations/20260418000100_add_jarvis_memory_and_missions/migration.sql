CREATE TABLE "JarvisMemoryFact" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "layer" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.7,
    "source" TEXT NOT NULL DEFAULT 'user',
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JarvisMemoryFact_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "JarvisSessionSummary" (
    "sessionId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "highlightsJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JarvisSessionSummary_pkey" PRIMARY KEY ("sessionId")
);

CREATE TABLE "JarvisMission" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "objectiveKey" TEXT NOT NULL,
    "horizon" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "summary" TEXT NOT NULL,
    "nextStep" TEXT,
    "planText" TEXT NOT NULL,
    "keySignalsJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JarvisMission_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "JarvisMemoryFact_sessionId_layer_key_key"
ON "JarvisMemoryFact"("sessionId", "layer", "key");

CREATE INDEX "JarvisMemoryFact_sessionId_layer_updatedAt_idx"
ON "JarvisMemoryFact"("sessionId", "layer", "updatedAt");

CREATE INDEX "JarvisMission_sessionId_status_updatedAt_idx"
ON "JarvisMission"("sessionId", "status", "updatedAt");

CREATE INDEX "JarvisMission_sessionId_objectiveKey_status_idx"
ON "JarvisMission"("sessionId", "objectiveKey", "status");
