-- Deterministic product controls are distinct from model-routed chat commands.
ALTER TABLE "Command" DROP CONSTRAINT "Command_source_valid";
ALTER TABLE "Command" ADD CONSTRAINT "Command_source_valid"
  CHECK ("source" IN ('confirmation', 'chat', 'inbox', 'direct'));
