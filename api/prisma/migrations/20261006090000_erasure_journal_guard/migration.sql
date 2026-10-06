-- Keep history immutable except for a live, owner-scoped erasure lease.
-- The setting is transaction-local; knowing an arbitrary UUID grants no access.
CREATE OR REPLACE FUNCTION protect_command_history() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  erasure_owner TEXT;
  lease_until TIMESTAMP(3);
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT j."ownerId", j."claimedUntil" INTO erasure_owner, lease_until
      FROM "AccountErasureJob" j
      JOIN "Command" c ON c."ownerId" = j."ownerId" AND c."id" = OLD."commandId"
      JOIN "User" u ON u."id" = j."ownerId" AND u."disabled"
      WHERE j."claimToken" = current_setting('jarvis.erasure_claim', true)
        AND j."claimedUntil" > clock_timestamp()
        AND j."state" IN ('queued', 'purging')
        AND NOT EXISTS (SELECT 1 FROM "Command" unresolved
          WHERE unresolved."ownerId" = j."ownerId" AND unresolved."state" IN ('executing', 'unknown'))
        AND NOT EXISTS (SELECT 1 FROM "InboxReplyOperation" pending
          WHERE pending."ownerId" = j."ownerId" AND (pending."sendState" IN ('sending', 'unknown')
            OR (pending."sendState" = 'sent' AND NOT pending."localComplete")))
      FOR UPDATE OF j;
    IF erasure_owner IS NOT NULL AND lease_until > clock_timestamp() THEN RETURN OLD; END IF;
  END IF;
  RAISE EXCEPTION 'Command history is append-only' USING ERRCODE = '23514';
END;
$$;
