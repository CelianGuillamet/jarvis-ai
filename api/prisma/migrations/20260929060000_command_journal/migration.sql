CREATE UNIQUE INDEX "Conversation_id_ownerId_key" ON "Conversation"("id", "ownerId");
CREATE TABLE "Command" (
  "id" TEXT PRIMARY KEY,
  "ownerId" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "requestId" TEXT NOT NULL CHECK (length("requestId") BETWEEN 1 AND 128),
  "toolName" TEXT NOT NULL CHECK (length("toolName") BETWEEN 1 AND 128),
  "toolVersion" TEXT NOT NULL CHECK (length("toolVersion") BETWEEN 1 AND 64),
  "arguments" JSONB NOT NULL CHECK (jsonb_typeof("arguments") = 'object'),
  "targets" JSONB NOT NULL CHECK (jsonb_typeof("targets") = 'array'),
  "digest" TEXT NOT NULL CHECK ("digest" ~ '^[a-f0-9]{64}$'),
  "state" TEXT NOT NULL DEFAULT 'proposed' CHECK ("state" IN ('proposed','waiting','executing','completed','failed','cancelled','expired','unknown')),
  "revision" INTEGER NOT NULL DEFAULT 0 CHECK ("revision" >= 0),
  "approvedDigest" TEXT,
  "approvedAt" TIMESTAMP(3),
  "outcomeCode" TEXT CHECK ("outcomeCode" ~ '^[A-Z][A-Z0-9_]{0,63}$'),
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Command_conversationId_ownerId_fkey" FOREIGN KEY ("conversationId", "ownerId") REFERENCES "Conversation"("id", "ownerId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CHECK (("approvedAt" IS NULL AND "approvedDigest" IS NULL) OR ("approvedAt" IS NOT NULL AND "approvedDigest" IS NOT NULL AND "approvedDigest" = "digest")),
  CHECK ("state" NOT IN ('executing','completed','failed','unknown') OR "approvedAt" IS NOT NULL),
  CHECK (("state" IN ('completed','failed','unknown') AND "outcomeCode" IS NOT NULL) OR ("state" NOT IN ('completed','failed','unknown') AND "outcomeCode" IS NULL))
);
CREATE UNIQUE INDEX "Command_ownerId_requestId_key" ON "Command"("ownerId", "requestId");
CREATE INDEX "Command_ownerId_createdAt_idx" ON "Command"("ownerId", "createdAt");
CREATE INDEX "Command_state_expiresAt_idx" ON "Command"("state", "expiresAt");
CREATE TABLE "CommandTransition" (
  "commandId" TEXT NOT NULL REFERENCES "Command"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "revision" INTEGER NOT NULL,
  "fromState" TEXT,
  "toState" TEXT NOT NULL,
  "approvedDigest" TEXT,
  "outcomeCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("commandId", "revision")
);

CREATE FUNCTION enforce_command_transition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."state" <> 'proposed' OR NEW."revision" <> 0 OR NEW."approvedAt" IS NOT NULL OR NEW."approvedDigest" IS NOT NULL OR NEW."outcomeCode" IS NOT NULL OR NEW."expiresAt" <= CURRENT_TIMESTAMP THEN
      RAISE EXCEPTION 'Invalid initial command';
    END IF;
  ELSE
    IF ROW(NEW."id",NEW."ownerId",NEW."conversationId",NEW."requestId",NEW."toolName",NEW."toolVersion",NEW."arguments",NEW."targets",NEW."digest",NEW."expiresAt",NEW."createdAt") IS DISTINCT FROM ROW(OLD."id",OLD."ownerId",OLD."conversationId",OLD."requestId",OLD."toolName",OLD."toolVersion",OLD."arguments",OLD."targets",OLD."digest",OLD."expiresAt",OLD."createdAt") THEN
      RAISE EXCEPTION 'Command envelope is immutable';
    END IF;
    IF NEW."revision" <> OLD."revision" + 1 THEN RAISE EXCEPTION 'Invalid command revision'; END IF;
    IF OLD."approvedAt" IS NOT NULL AND ROW(NEW."approvedAt",NEW."approvedDigest") IS DISTINCT FROM ROW(OLD."approvedAt",OLD."approvedDigest") THEN RAISE EXCEPTION 'Approval is immutable'; END IF;
    IF OLD."approvedAt" IS NULL AND NEW."approvedAt" IS NOT NULL AND NOT (OLD."state" = 'waiting' AND NEW."state" = 'waiting' AND NEW."expiresAt" > CURRENT_TIMESTAMP) THEN RAISE EXCEPTION 'Invalid approval'; END IF;
    IF NOT (
      (OLD."state" = 'proposed' AND NEW."state" IN ('waiting','cancelled','expired')) OR
      (OLD."state" = 'waiting' AND NEW."state" IN ('executing','cancelled','expired')) OR
      (OLD."state" = 'waiting' AND NEW."state" = 'waiting' AND OLD."approvedAt" IS NULL AND NEW."approvedAt" IS NOT NULL) OR
      (OLD."state" = 'executing' AND NEW."state" IN ('completed','failed','unknown')) OR
      (OLD."state" = 'unknown' AND NEW."state" IN ('completed','failed'))
    ) THEN RAISE EXCEPTION 'Invalid command transition'; END IF;
    IF NEW."state" IN ('waiting','executing') AND NEW."expiresAt" <= CURRENT_TIMESTAMP THEN RAISE EXCEPTION 'Command expired'; END IF;
    IF NEW."state" = 'expired' AND NEW."expiresAt" > CURRENT_TIMESTAMP THEN RAISE EXCEPTION 'Command not expired'; END IF;
  END IF;
  NEW."updatedAt" := CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "Command_guard" BEFORE INSERT OR UPDATE ON "Command" FOR EACH ROW EXECUTE FUNCTION enforce_command_transition();

CREATE FUNCTION record_command_transition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO "CommandTransition" ("commandId","revision","fromState","toState","approvedDigest","outcomeCode")
  VALUES (NEW."id",NEW."revision",CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD."state" END,NEW."state",NEW."approvedDigest",NEW."outcomeCode");
  RETURN NEW;
END;
$$;
CREATE TRIGGER "Command_history" AFTER INSERT OR UPDATE ON "Command" FOR EACH ROW EXECUTE FUNCTION record_command_transition();

CREATE FUNCTION protect_command_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Command history is append-only';
END;
$$;
CREATE TRIGGER "CommandTransition_immutable" BEFORE UPDATE OR DELETE ON "CommandTransition" FOR EACH ROW EXECUTE FUNCTION protect_command_history();
