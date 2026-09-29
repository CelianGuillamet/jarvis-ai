-- Preserve the original identity even after integration disconnect; legacy rows require a fresh scan.
ALTER TABLE "InboxZeroItem" ADD COLUMN "googleAccountId" TEXT;
ALTER TABLE "InboxZeroItem" ADD COLUMN "googleAccountSubject" TEXT;
ALTER TABLE "InboxZeroItem" ADD CONSTRAINT "InboxZeroItem_account_binding_pair"
  CHECK (("googleAccountId" IS NULL) = ("googleAccountSubject" IS NULL));
