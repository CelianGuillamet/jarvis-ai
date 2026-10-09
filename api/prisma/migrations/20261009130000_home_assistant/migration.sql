CREATE TABLE "HomeAssistantConnection" (
    "ownerId" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "encryptedToken" TEXT NOT NULL,
    "entities" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HomeAssistantConnection_pkey" PRIMARY KEY ("ownerId"),
    CONSTRAINT "HomeAssistantConnection_url_check" CHECK (char_length("baseUrl") BETWEEN 8 AND 200),
    CONSTRAINT "HomeAssistantConnection_token_check" CHECK (char_length("encryptedToken") BETWEEN 1 AND 4000 AND "encryptedToken" LIKE 'v1.%'),
    CONSTRAINT "HomeAssistantConnection_entities_check" CHECK (jsonb_typeof("entities") = 'array' AND jsonb_array_length("entities") <= 50)
);

ALTER TABLE "HomeAssistantConnection" ADD CONSTRAINT "HomeAssistantConnection_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TRIGGER "HomeAssistantConnection_active_owner_write" BEFORE INSERT OR UPDATE ON "HomeAssistantConnection"
FOR EACH ROW EXECUTE FUNCTION guard_active_owner_write('owner');
