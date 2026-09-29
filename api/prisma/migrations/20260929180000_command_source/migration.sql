ALTER TABLE "Command" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'confirmation';
ALTER TABLE "Command" ADD CONSTRAINT "Command_source_valid" CHECK ("source" IN ('confirmation', 'chat', 'inbox'));
CREATE FUNCTION protect_command_source() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."source" IS DISTINCT FROM OLD."source" THEN
    RAISE EXCEPTION 'Command source is immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "Command_source_immutable" BEFORE UPDATE ON "Command" FOR EACH ROW EXECUTE FUNCTION protect_command_source();
