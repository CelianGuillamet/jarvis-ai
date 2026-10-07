-- A 'started' turn abandoned by a crash, an abort or a rejected update is now
-- redacted after one day by PrivacyRetentionService; index that scan the same
-- way as the existing completed/failed retention index.
CREATE INDEX "ConversationTurn_started_retention_idx" ON "ConversationTurn" ("updatedAt", "id") WHERE "state" = 'started';
