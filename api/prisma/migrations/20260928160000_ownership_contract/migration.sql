-- Maintenance cutover: mapped owners survive. Never guess ownership for remaining
-- legacy records. Preserve ambiguous rows in the existing operator-only quarantine.
BEGIN;
LOCK TABLE "Todo", "Note", "ShoppingItem", "CalendarEvent" IN ACCESS EXCLUSIVE MODE;
INSERT INTO "LegacyOwnershipBatch" (id, digest, manifest)
VALUES ('ownership-contract-20260928', 'automatic-quarantine-no-owner-inferred', '{"version":1,"policy":"quarantine all remaining unowned rows; no ownership approval inferred"}'::jsonb);
INSERT INTO "LegacyOwnershipRecord" ("batchId", "tableName", "recordId", original)
SELECT 'ownership-contract-20260928', 'Todo', id, to_jsonb(t) FROM "Todo" t WHERE "ownerId" IS NULL;
INSERT INTO "LegacyOwnershipRecord" ("batchId", "tableName", "recordId", original)
SELECT 'ownership-contract-20260928', 'Note', id, to_jsonb(t) FROM "Note" t WHERE "ownerId" IS NULL;
INSERT INTO "LegacyOwnershipRecord" ("batchId", "tableName", "recordId", original)
SELECT 'ownership-contract-20260928', 'ShoppingItem', id, to_jsonb(t) FROM "ShoppingItem" t WHERE "ownerId" IS NULL;
INSERT INTO "LegacyOwnershipRecord" ("batchId", "tableName", "recordId", original)
SELECT 'ownership-contract-20260928', 'CalendarEvent', id, to_jsonb(t) FROM "CalendarEvent" t WHERE "ownerId" IS NULL;
DELETE FROM "Todo" WHERE "ownerId" IS NULL;
DELETE FROM "Note" WHERE "ownerId" IS NULL;
DELETE FROM "ShoppingItem" WHERE "ownerId" IS NULL;
DELETE FROM "CalendarEvent" WHERE "ownerId" IS NULL;
ALTER TABLE "Todo" ALTER COLUMN "ownerId" SET NOT NULL;
ALTER TABLE "Note" ALTER COLUMN "ownerId" SET NOT NULL;
ALTER TABLE "ShoppingItem" ALTER COLUMN "ownerId" SET NOT NULL;
ALTER TABLE "CalendarEvent" ALTER COLUMN "ownerId" SET NOT NULL;
COMMIT;
