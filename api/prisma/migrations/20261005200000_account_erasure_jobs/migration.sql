CREATE TABLE "AccountErasureJob" (
  "id" TEXT PRIMARY KEY,
  "ownerId" TEXT NOT NULL UNIQUE,
  "receiptDigest" TEXT NOT NULL UNIQUE CHECK ("receiptDigest" ~ '^[a-f0-9]{64}$'),
  "state" TEXT NOT NULL DEFAULT 'queued' CHECK ("state" IN ('queued', 'purging', 'local_deleted', 'completed', 'blocked')),
  "revocationStatus" TEXT NOT NULL DEFAULT 'pending' CHECK ("revocationStatus" IN ('pending', 'complete', 'manual_required')),
  "encryptedTokens" TEXT CHECK ("encryptedTokens" IS NULL OR "encryptedTokens" ~ '^v1\.[A-Za-z0-9_-]{1,40}\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]+$'),
  "attempts" INTEGER NOT NULL DEFAULT 0 CHECK ("attempts" >= 0),
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "claimToken" TEXT,
  "claimedUntil" TIMESTAMP(3),
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "localDeletedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "receiptExpiresAt" TIMESTAMP(3) NOT NULL,
  "retainedUntil" TIMESTAMP(3) NOT NULL,
  "blockerCode" TEXT,
  CHECK (("claimToken" IS NULL) = ("claimedUntil" IS NULL)),
  CHECK ("receiptExpiresAt" > "requestedAt" AND "retainedUntil" >= "receiptExpiresAt"),
  CHECK ("state" NOT IN ('local_deleted', 'completed') OR "localDeletedAt" IS NOT NULL),
  CHECK ("state" <> 'completed' OR ("completedAt" IS NOT NULL AND "encryptedTokens" IS NULL AND "revocationStatus" <> 'pending'))
);
CREATE INDEX "AccountErasureJob_state_nextAttemptAt_claimedUntil_idx" ON "AccountErasureJob" ("state", "nextAttemptAt", "claimedUntil");
CREATE INDEX "AccountErasureJob_retainedUntil_idx" ON "AccountErasureJob" ("retainedUntil");
