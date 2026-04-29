/*
  Warnings:

  - Added the required column `sessionId` to the `PendingAction` table without a default value. This is not possible if the table is not empty.

*/

-- AlterTable
ALTER TABLE "JarvisLog" ADD COLUMN "sessionId" TEXT;

-- AlterTable (add nullable first, backfill, then constrain)
ALTER TABLE "PendingAction" ADD COLUMN "sessionId" TEXT;
UPDATE "PendingAction" SET "sessionId" = 'legacy-' || id WHERE "sessionId" IS NULL;
ALTER TABLE "PendingAction" ALTER COLUMN "sessionId" SET NOT NULL;

-- CreateTable
CREATE TABLE "GoogleOAuthToken" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "accessToken" TEXT,
    "tokenType" TEXT,
    "scope" TEXT,
    "expiryDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoogleOAuthToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GoogleOAuthToken_sessionId_key" ON "GoogleOAuthToken"("sessionId");

-- CreateIndex
CREATE INDEX "JarvisLog_sessionId_idx" ON "JarvisLog"("sessionId");

-- CreateIndex
CREATE INDEX "PendingAction_sessionId_idx" ON "PendingAction"("sessionId");