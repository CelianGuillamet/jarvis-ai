ALTER TABLE "Command" ADD COLUMN "response" JSONB;
ALTER TABLE "Command" ADD CONSTRAINT "Command_response_shape" CHECK ("response" IS NULL OR ("state" = 'completed' AND jsonb_typeof("response") = 'object' AND "response" ? 'text' AND jsonb_typeof("response"->'text') = 'string'));
CREATE FUNCTION protect_command_response() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."response" IS DISTINCT FROM OLD."response" AND NOT (OLD."response" IS NULL AND OLD."state" = 'executing' AND NEW."state" = 'completed') THEN
    RAISE EXCEPTION 'Command response is immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "Command_response_immutable" BEFORE UPDATE ON "Command" FOR EACH ROW EXECUTE FUNCTION protect_command_response();

-- A lock wait must not freeze the approval deadline at transaction start.
CREATE OR REPLACE FUNCTION enforce_command_transition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW."createdAt" := clock_timestamp();
    IF NEW."state" <> 'proposed' OR NEW."revision" <> 0 OR NEW."approvedAt" IS NOT NULL OR NEW."approvedDigest" IS NOT NULL OR NEW."outcomeCode" IS NOT NULL OR NEW."expiresAt" <= clock_timestamp() THEN
      RAISE EXCEPTION 'Invalid initial command';
    END IF;
  ELSE
    IF ROW(NEW."id",NEW."ownerId",NEW."conversationId",NEW."requestId",NEW."toolName",NEW."toolVersion",NEW."arguments",NEW."targets",NEW."digest",NEW."expiresAt",NEW."createdAt") IS DISTINCT FROM ROW(OLD."id",OLD."ownerId",OLD."conversationId",OLD."requestId",OLD."toolName",OLD."toolVersion",OLD."arguments",OLD."targets",OLD."digest",OLD."expiresAt",OLD."createdAt") THEN
      RAISE EXCEPTION 'Command envelope is immutable';
    END IF;
    IF NEW."revision" <> OLD."revision" + 1 THEN RAISE EXCEPTION 'Invalid command revision'; END IF;
    IF OLD."approvedAt" IS NOT NULL AND ROW(NEW."approvedAt",NEW."approvedDigest") IS DISTINCT FROM ROW(OLD."approvedAt",OLD."approvedDigest") THEN RAISE EXCEPTION 'Approval is immutable'; END IF;
    IF OLD."approvedAt" IS NULL AND NEW."approvedAt" IS NOT NULL AND NOT (OLD."state" = 'waiting' AND NEW."state" = 'waiting' AND NEW."expiresAt" > clock_timestamp()) THEN RAISE EXCEPTION 'Invalid approval'; END IF;
    IF NOT (
      (OLD."state" = 'proposed' AND NEW."state" IN ('waiting','cancelled','expired')) OR
      (OLD."state" = 'waiting' AND NEW."state" IN ('executing','cancelled','expired')) OR
      (OLD."state" = 'waiting' AND NEW."state" = 'waiting' AND OLD."approvedAt" IS NULL AND NEW."approvedAt" IS NOT NULL) OR
      (OLD."state" = 'executing' AND NEW."state" IN ('completed','failed','unknown')) OR
      (OLD."state" = 'unknown' AND NEW."state" IN ('completed','failed'))
    ) THEN RAISE EXCEPTION 'Invalid command transition'; END IF;
    IF NEW."state" IN ('waiting','executing') AND NEW."expiresAt" <= clock_timestamp() THEN RAISE EXCEPTION 'Command expired'; END IF;
    IF NEW."state" = 'expired' AND NEW."expiresAt" > clock_timestamp() THEN RAISE EXCEPTION 'Command not expired'; END IF;
  END IF;
  NEW."updatedAt" := clock_timestamp();
  RETURN NEW;
END;
$$;
