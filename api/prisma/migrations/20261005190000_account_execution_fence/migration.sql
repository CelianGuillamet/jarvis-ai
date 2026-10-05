ALTER TABLE "User" ADD COLUMN "executionEpoch" BIGINT NOT NULL DEFAULT 0;

-- Updating the owner row is intentional: a mere shared lock would not invalidate
-- an older repeatable-read snapshot attempting to disable the same account.
CREATE FUNCTION guard_account_execution() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  must_claim BOOLEAN;
  claimed_owner TEXT;
BEGIN
  IF TG_TABLE_NAME = 'Command' THEN
    IF TG_OP = 'INSERT' THEN
      must_claim := true;
    ELSE
      must_claim := NEW."state" = 'executing' AND OLD."state" <> 'executing';
    END IF;
  ELSIF TG_TABLE_NAME = 'InboxReplyOperation' THEN
    IF TG_OP = 'INSERT' THEN
      must_claim := true;
    ELSE
      must_claim := NEW."sendState" = 'sending' AND OLD."sendState" <> 'sending';
    END IF;
  ELSE
    RAISE EXCEPTION 'Unsupported account execution guard';
  END IF;
  IF must_claim THEN
    UPDATE "User" SET "executionEpoch" = "executionEpoch" + 1
      WHERE "id" = NEW."ownerId" AND NOT "disabled"
      RETURNING "id" INTO claimed_owner;
    IF claimed_owner IS NULL THEN
      RAISE EXCEPTION 'Account cannot start an operation' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "Command_account_execution" BEFORE INSERT OR UPDATE ON "Command"
FOR EACH ROW EXECUTE FUNCTION guard_account_execution();
CREATE TRIGGER "InboxReplyOperation_account_execution" BEFORE INSERT OR UPDATE ON "InboxReplyOperation"
FOR EACH ROW EXECUTE FUNCTION guard_account_execution();

-- This is the erasure preflight, not a restriction on administrative revocation.
-- Disabling access must remain possible even when an operation needs reconciliation.
CREATE FUNCTION prepare_account_erasure(account_owner TEXT) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  locked_owner TEXT;
BEGIN
  SELECT "id" INTO locked_owner FROM "User" WHERE "id" = account_owner FOR UPDATE;
  IF locked_owner IS NULL THEN
    RAISE EXCEPTION 'Account unavailable' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (SELECT 1 FROM "Command" WHERE "ownerId" = account_owner AND "state" IN ('executing', 'unknown'))
    OR EXISTS (SELECT 1 FROM "InboxReplyOperation" WHERE "ownerId" = account_owner
      AND ("sendState" IN ('sending', 'unknown') OR ("sendState" = 'sent' AND NOT "localComplete"))) THEN
    RAISE EXCEPTION 'Account has an unresolved operation' USING ERRCODE = '23514';
  END IF;
  UPDATE "User" SET "disabled" = true WHERE "id" = account_owner;
END;
$$;
