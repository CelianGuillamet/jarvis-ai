-- Legacy conversation tables have no ownership FK. A delayed profile flush or
-- an already-authenticated request must not recreate data after erasure begins.
CREATE FUNCTION guard_active_owner_write() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  account_owner TEXT;
  claimed_owner TEXT;
BEGIN
  CASE TG_ARGV[0]
    WHEN 'owner' THEN account_owner := NEW."ownerId";
    WHEN 'conversation' THEN
      SELECT "ownerId" INTO account_owner FROM "Conversation" WHERE "id" = NEW."sessionId";
    WHEN 'habit' THEN
      SELECT c."ownerId" INTO account_owner FROM "Habit" h
        JOIN "Conversation" c ON c."id" = h."sessionId" WHERE h."id" = NEW."habitId";
    WHEN 'integration' THEN
      SELECT "ownerId" INTO account_owner FROM "IntegrationAccount" WHERE "id" = NEW."integrationAccountId";
    ELSE RAISE EXCEPTION 'Unsupported owner write scope';
  END CASE;
  UPDATE "User" SET "executionEpoch" = "executionEpoch" + 1
    WHERE "id" = account_owner AND NOT "disabled" RETURNING "id" INTO claimed_owner;
  IF claimed_owner IS NULL THEN
    RAISE EXCEPTION 'Account cannot retain new data' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

-- Only reviewed data tables; receipts/journal transitions remain writable after
-- administrative revocation. DELETE is permitted for the erasure transaction.
CREATE TRIGGER "Todo_active_owner_write" BEFORE INSERT OR UPDATE ON "Todo"
FOR EACH ROW EXECUTE FUNCTION guard_active_owner_write('owner');
CREATE TRIGGER "CalendarEvent_active_owner_write" BEFORE INSERT OR UPDATE ON "CalendarEvent"
FOR EACH ROW EXECUTE FUNCTION guard_active_owner_write('owner');
CREATE TRIGGER "Note_active_owner_write" BEFORE INSERT OR UPDATE ON "Note"
FOR EACH ROW EXECUTE FUNCTION guard_active_owner_write('owner');
CREATE TRIGGER "ShoppingItem_active_owner_write" BEFORE INSERT OR UPDATE ON "ShoppingItem"
FOR EACH ROW EXECUTE FUNCTION guard_active_owner_write('owner');
CREATE TRIGGER "PendingAction_active_owner_write" BEFORE INSERT OR UPDATE ON "PendingAction"
FOR EACH ROW EXECUTE FUNCTION guard_active_owner_write('conversation');
CREATE TRIGGER "JarvisLog_active_owner_write" BEFORE INSERT OR UPDATE ON "JarvisLog"
FOR EACH ROW EXECUTE FUNCTION guard_active_owner_write('conversation');
CREATE TRIGGER "GoogleOAuthToken_active_owner_write" BEFORE INSERT OR UPDATE ON "GoogleOAuthToken"
FOR EACH ROW EXECUTE FUNCTION guard_active_owner_write('integration');
CREATE TRIGGER "JarvisHumanProfile_active_owner_write" BEFORE INSERT OR UPDATE ON "JarvisHumanProfile"
FOR EACH ROW EXECUTE FUNCTION guard_active_owner_write('conversation');
CREATE TRIGGER "JarvisMemoryFact_active_owner_write" BEFORE INSERT OR UPDATE ON "JarvisMemoryFact"
FOR EACH ROW EXECUTE FUNCTION guard_active_owner_write('conversation');
CREATE TRIGGER "JarvisSessionSummary_active_owner_write" BEFORE INSERT OR UPDATE ON "JarvisSessionSummary"
FOR EACH ROW EXECUTE FUNCTION guard_active_owner_write('conversation');
CREATE TRIGGER "JarvisMission_active_owner_write" BEFORE INSERT OR UPDATE ON "JarvisMission"
FOR EACH ROW EXECUTE FUNCTION guard_active_owner_write('conversation');
CREATE TRIGGER "JarvisActionEvent_active_owner_write" BEFORE INSERT OR UPDATE ON "JarvisActionEvent"
FOR EACH ROW EXECUTE FUNCTION guard_active_owner_write('conversation');
CREATE TRIGGER "JarvisWorkflowMemory_active_owner_write" BEFORE INSERT OR UPDATE ON "JarvisWorkflowMemory"
FOR EACH ROW EXECUTE FUNCTION guard_active_owner_write('conversation');
CREATE TRIGGER "JarvisGoal_active_owner_write" BEFORE INSERT OR UPDATE ON "JarvisGoal"
FOR EACH ROW EXECUTE FUNCTION guard_active_owner_write('conversation');
CREATE TRIGGER "JarvisTaskDependency_active_owner_write" BEFORE INSERT OR UPDATE ON "JarvisTaskDependency"
FOR EACH ROW EXECUTE FUNCTION guard_active_owner_write('conversation');
CREATE TRIGGER "JarvisResourceAllocation_active_owner_write" BEFORE INSERT OR UPDATE ON "JarvisResourceAllocation"
FOR EACH ROW EXECUTE FUNCTION guard_active_owner_write('conversation');
CREATE TRIGGER "JarvisPredictiveMetric_active_owner_write" BEFORE INSERT OR UPDATE ON "JarvisPredictiveMetric"
FOR EACH ROW EXECUTE FUNCTION guard_active_owner_write('conversation');
CREATE TRIGGER "JarvisSchedulingSuggestion_active_owner_write" BEFORE INSERT OR UPDATE ON "JarvisSchedulingSuggestion"
FOR EACH ROW EXECUTE FUNCTION guard_active_owner_write('conversation');
CREATE TRIGGER "JarvisContextualHelp_active_owner_write" BEFORE INSERT OR UPDATE ON "JarvisContextualHelp"
FOR EACH ROW EXECUTE FUNCTION guard_active_owner_write('conversation');
CREATE TRIGGER "JarvisKnowledgeEntry_active_owner_write" BEFORE INSERT OR UPDATE ON "JarvisKnowledgeEntry"
FOR EACH ROW EXECUTE FUNCTION guard_active_owner_write('conversation');
CREATE TRIGGER "JarvisTimeInsight_active_owner_write" BEFORE INSERT OR UPDATE ON "JarvisTimeInsight"
FOR EACH ROW EXECUTE FUNCTION guard_active_owner_write('conversation');
CREATE TRIGGER "JarvisDelegation_active_owner_write" BEFORE INSERT OR UPDATE ON "JarvisDelegation"
FOR EACH ROW EXECUTE FUNCTION guard_active_owner_write('conversation');
CREATE TRIGGER "Reminder_active_owner_write" BEFORE INSERT OR UPDATE ON "Reminder"
FOR EACH ROW EXECUTE FUNCTION guard_active_owner_write('conversation');
CREATE TRIGGER "Habit_active_owner_write" BEFORE INSERT OR UPDATE ON "Habit"
FOR EACH ROW EXECUTE FUNCTION guard_active_owner_write('conversation');
CREATE TRIGGER "HabitLog_active_owner_write" BEFORE INSERT OR UPDATE ON "HabitLog"
FOR EACH ROW EXECUTE FUNCTION guard_active_owner_write('habit');
CREATE TRIGGER "Contact_active_owner_write" BEFORE INSERT OR UPDATE ON "Contact"
FOR EACH ROW EXECUTE FUNCTION guard_active_owner_write('conversation');
CREATE TRIGGER "Expense_active_owner_write" BEFORE INSERT OR UPDATE ON "Expense"
FOR EACH ROW EXECUTE FUNCTION guard_active_owner_write('conversation');
CREATE TRIGGER "Budget_active_owner_write" BEFORE INSERT OR UPDATE ON "Budget"
FOR EACH ROW EXECUTE FUNCTION guard_active_owner_write('conversation');
CREATE TRIGGER "InboxZeroSession_active_owner_write" BEFORE INSERT OR UPDATE ON "InboxZeroSession"
FOR EACH ROW EXECUTE FUNCTION guard_active_owner_write('conversation');
CREATE TRIGGER "InboxZeroItem_active_owner_write" BEFORE INSERT OR UPDATE ON "InboxZeroItem"
FOR EACH ROW EXECUTE FUNCTION guard_active_owner_write('conversation');
CREATE TRIGGER "InboxZeroAction_active_owner_write" BEFORE INSERT OR UPDATE ON "InboxZeroAction"
FOR EACH ROW EXECUTE FUNCTION guard_active_owner_write('conversation');
CREATE TRIGGER "Conversation_active_owner_write" BEFORE INSERT OR UPDATE ON "Conversation"
FOR EACH ROW EXECUTE FUNCTION guard_active_owner_write('owner');
CREATE TRIGGER "ConversationTurn_active_owner_write" BEFORE INSERT OR UPDATE ON "ConversationTurn"
FOR EACH ROW EXECUTE FUNCTION guard_active_owner_write('owner');
CREATE TRIGGER "IntegrationAccount_active_owner_write" BEFORE INSERT OR UPDATE ON "IntegrationAccount"
FOR EACH ROW EXECUTE FUNCTION guard_active_owner_write('owner');
CREATE TRIGGER "GoogleOAuthState_active_owner_write" BEFORE INSERT OR UPDATE ON "GoogleOAuthState"
FOR EACH ROW EXECUTE FUNCTION guard_active_owner_write('owner');
CREATE TRIGGER "InboxReplyDraft_active_owner_write" BEFORE INSERT OR UPDATE ON "InboxReplyDraft"
FOR EACH ROW EXECUTE FUNCTION guard_active_owner_write('owner');
