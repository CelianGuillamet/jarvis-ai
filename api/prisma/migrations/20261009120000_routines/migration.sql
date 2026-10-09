CREATE TABLE "RoutineSetting" (
    "ownerId" TEXT NOT NULL,
    "routineKey" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoutineSetting_pkey" PRIMARY KEY ("ownerId", "routineKey"),
    CONSTRAINT "RoutineSetting_key_check" CHECK (char_length("routineKey") BETWEEN 1 AND 60)
);

CREATE TABLE "RoutineRun" (
    "ownerId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "routineKey" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "steps" JSONB NOT NULL,
    "result" TEXT,
    "cancelRequested" BOOLEAN NOT NULL DEFAULT false,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoutineRun_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "RoutineRun_state_check" CHECK ("state" IN ('running', 'completed', 'failed', 'suspended', 'cancelled')),
    CONSTRAINT "RoutineRun_steps_check" CHECK (jsonb_typeof("steps") = 'array' AND jsonb_array_length("steps") BETWEEN 1 AND 8),
    CONSTRAINT "RoutineRun_result_check" CHECK ("result" IS NULL OR char_length("result") <= 8000),
    CONSTRAINT "RoutineRun_key_check" CHECK (char_length("routineKey") BETWEEN 1 AND 60)
);

CREATE UNIQUE INDEX "RoutineRun_ownerId_requestId_key" ON "RoutineRun"("ownerId", "requestId");
CREATE INDEX "RoutineRun_ownerId_createdAt_idx" ON "RoutineRun"("ownerId", "createdAt");

ALTER TABLE "RoutineSetting" ADD CONSTRAINT "RoutineSetting_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RoutineRun" ADD CONSTRAINT "RoutineRun_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TRIGGER "RoutineSetting_active_owner_write" BEFORE INSERT OR UPDATE ON "RoutineSetting"
FOR EACH ROW EXECUTE FUNCTION guard_active_owner_write('owner');
CREATE TRIGGER "RoutineRun_active_owner_write" BEFORE INSERT OR UPDATE ON "RoutineRun"
FOR EACH ROW EXECUTE FUNCTION guard_active_owner_write('owner');
