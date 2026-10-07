CREATE TABLE "PersonalFact" (
    "ownerId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PersonalFact_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PersonalFact_text_check" CHECK (char_length("text") BETWEEN 1 AND 280),
    CONSTRAINT "PersonalFact_origin_check" CHECK ("origin" IN ('chat', 'settings'))
);

CREATE INDEX "PersonalFact_ownerId_updatedAt_idx" ON "PersonalFact"("ownerId", "updatedAt");

ALTER TABLE "PersonalFact" ADD CONSTRAINT "PersonalFact_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TRIGGER "PersonalFact_active_owner_write" BEFORE INSERT OR UPDATE ON "PersonalFact"
FOR EACH ROW EXECUTE FUNCTION guard_active_owner_write('owner');
