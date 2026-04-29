CREATE TABLE "JarvisHumanProfile" (
    "sessionId" TEXT NOT NULL,
    "speechMode" TEXT NOT NULL,
    "verbosity" TEXT NOT NULL,
    "preferredName" TEXT,
    "turnCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JarvisHumanProfile_pkey" PRIMARY KEY ("sessionId")
);
