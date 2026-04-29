WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "sessionId"
      ORDER BY "createdAt" DESC, "id" DESC
    ) AS rn
  FROM "PendingAction"
)
DELETE FROM "PendingAction"
WHERE "id" IN (SELECT "id" FROM ranked WHERE rn > 1);

DROP INDEX IF EXISTS "PendingAction_sessionId_idx";
CREATE UNIQUE INDEX IF NOT EXISTS "PendingAction_sessionId_key" ON "PendingAction" ("sessionId");
