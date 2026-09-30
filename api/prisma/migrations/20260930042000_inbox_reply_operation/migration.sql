CREATE TABLE "InboxReplyOperation" (
  "id" TEXT PRIMARY KEY,
  "ownerId" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "digest" TEXT NOT NULL,
  "intent" JSONB NOT NULL,
  "sendState" TEXT NOT NULL DEFAULT 'pending',
  "providerMessageId" TEXT,
  "providerThreadId" TEXT,
  "labelsComplete" BOOLEAN NOT NULL DEFAULT false,
  "localComplete" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InboxReplyOperation_owner_fkey" FOREIGN KEY ("conversationId", "ownerId") REFERENCES "Conversation"("id", "ownerId") ON DELETE RESTRICT,
  CONSTRAINT "InboxReplyOperation_state_valid" CHECK ("sendState" IN ('pending', 'sending', 'sent', 'unknown')),
  CONSTRAINT "InboxReplyOperation_receipt_valid" CHECK (("sendState" = 'sent') = ("providerMessageId" IS NOT NULL) AND ("providerMessageId" IS NULL OR length(trim("providerMessageId")) > 0)),
  CONSTRAINT "InboxReplyOperation_order_valid" CHECK ((NOT "labelsComplete" OR "sendState" = 'sent') AND (NOT "localComplete" OR "labelsComplete"))
);
CREATE UNIQUE INDEX "InboxReplyOperation_ownerId_requestId_key" ON "InboxReplyOperation"("ownerId", "requestId");
CREATE FUNCTION protect_inbox_reply_operation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."id" IS DISTINCT FROM OLD."id" OR NEW."ownerId" IS DISTINCT FROM OLD."ownerId"
    OR NEW."conversationId" IS DISTINCT FROM OLD."conversationId" OR NEW."requestId" IS DISTINCT FROM OLD."requestId"
    OR NEW."digest" IS DISTINCT FROM OLD."digest" OR NEW."intent" IS DISTINCT FROM OLD."intent" THEN
    RAISE EXCEPTION 'Inbox reply intent is immutable';
  END IF;
  IF NEW."sendState" <> OLD."sendState" AND NOT (
    (OLD."sendState" = 'pending' AND NEW."sendState" = 'sending') OR
    (OLD."sendState" = 'sending' AND NEW."sendState" IN ('sent', 'unknown'))
  ) THEN RAISE EXCEPTION 'Invalid inbox send transition'; END IF;
  IF OLD."sendState" = 'sent' AND (NEW."providerMessageId" IS DISTINCT FROM OLD."providerMessageId" OR NEW."providerThreadId" IS DISTINCT FROM OLD."providerThreadId") THEN
    RAISE EXCEPTION 'Inbox send receipt is immutable';
  END IF;
  IF (OLD."labelsComplete" AND NOT NEW."labelsComplete") OR (OLD."localComplete" AND NOT NEW."localComplete") THEN
    RAISE EXCEPTION 'Completed inbox steps cannot be reset';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "InboxReplyOperation_protect" BEFORE UPDATE ON "InboxReplyOperation" FOR EACH ROW EXECUTE FUNCTION protect_inbox_reply_operation();
