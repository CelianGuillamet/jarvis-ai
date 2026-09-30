CREATE TABLE "CommandCompensation" (
  "commandId" TEXT PRIMARY KEY REFERENCES "Command"("id") ON DELETE RESTRICT,
  "label" TEXT NOT NULL,
  "changes" JSONB NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE FUNCTION protect_command_compensation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."commandId" IS DISTINCT FROM OLD."commandId"
    OR NEW."label" IS DISTINCT FROM OLD."label"
    OR NEW."changes" IS DISTINCT FROM OLD."changes"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
    OR (OLD."consumedAt" IS NOT NULL AND NEW."consumedAt" IS DISTINCT FROM OLD."consumedAt") THEN
    RAISE EXCEPTION 'Command compensation is immutable and cannot be replayed';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "CommandCompensation_protect" BEFORE UPDATE ON "CommandCompensation"
FOR EACH ROW EXECUTE FUNCTION protect_command_compensation();
