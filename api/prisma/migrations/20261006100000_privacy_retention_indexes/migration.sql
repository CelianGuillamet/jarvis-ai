CREATE INDEX "JarvisLog_retention_idx" ON "JarvisLog" ("createdAt", "id");
CREATE INDEX "ConversationTurn_retention_idx" ON "ConversationTurn" ("updatedAt", "id") WHERE "state" IN ('completed', 'failed');
CREATE INDEX "Session_expiry_idx" ON "Session" ("expiresAt", "id");
CREATE INDEX "Verification_expiry_idx" ON "Verification" ("expiresAt", "id");
CREATE INDEX "PendingAction_expiry_idx" ON "PendingAction" ("expiresAt", "id");
CREATE INDEX "GoogleOAuthState_expiry_idx" ON "GoogleOAuthState" ("expiresAt", "digest");
CREATE INDEX "AccountErasureJob_credential_expiry_idx" ON "AccountErasureJob" ("receiptExpiresAt", "id") WHERE "encryptedTokens" IS NOT NULL;

CREATE INDEX "JarvisLog_raw_content_idx" ON "JarvisLog" ("createdAt", "id") WHERE "userText" <> '' OR "modelRaw" <> '' OR "toolArgs" IS NOT NULL OR "result" IS NOT NULL;
