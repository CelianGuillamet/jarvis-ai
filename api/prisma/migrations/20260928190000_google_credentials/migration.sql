-- Seal existing credentials with the local maintenance command first. Fail
-- atomically rather than deleting or adopting ambiguous legacy credentials.
BEGIN;
ALTER TABLE "GoogleOAuthToken" ADD COLUMN "generation" TEXT NOT NULL DEFAULT gen_random_uuid()::text;
ALTER TABLE "GoogleOAuthToken" ADD CONSTRAINT "GoogleOAuthToken_encrypted_refresh"
  CHECK ("refreshToken" ~ '^v1\.[A-Za-z0-9_-]{1,40}\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]+$');
ALTER TABLE "GoogleOAuthToken" ADD CONSTRAINT "GoogleOAuthToken_encrypted_access"
  CHECK ("accessToken" IS NULL OR "accessToken" ~ '^v1\.[A-Za-z0-9_-]{1,40}\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]+$');
CREATE UNIQUE INDEX "IntegrationAccount_ownerId_provider_key" ON "IntegrationAccount"("ownerId", "provider");
CREATE TABLE "GoogleOAuthState" (
  "digest" TEXT NOT NULL PRIMARY KEY,
  "ownerId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "authSessionId" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "verifier" TEXT NOT NULL,
  "nonce" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "GoogleOAuthState_expiresAt_idx" ON "GoogleOAuthState"("expiresAt");
CREATE INDEX "GoogleOAuthState_ownerId_idx" ON "GoogleOAuthState"("ownerId");
COMMIT;
