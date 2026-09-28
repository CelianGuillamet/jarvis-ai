# Legacy ownership migration — JAR-012

The four original local domain tables (Todo, Note, ShoppingItem, CalendarEvent) contain no reliable owner signal. Do not assign them to the first account, the most recent login or a browser-supplied conversation ID. This change adds nullable owner foreign keys with owner/query indexes, plus distinct owned Conversation and IntegrationAccount identities. Authentication Session and login Account keep their existing meaning. Existing Google tokens gain an optional integration relation; no token or conversation mapping is inferred. JAR-013 scopes retained application data and caches; JAR-014 binds Google authorization to integration accounts.

JAR-012 introduced the **expand and rehearsal** stage. JAR-013 now supplies scoped writers and the non-null contract; see [owned data boundary](owned-data-boundary.md) for the cutover and its limits. Do not run the backfill against a live writer. Nullable expansion alone is not tenant isolation. No real local database is migrated by these tickets.

## Maintenance procedure

1. Stop application/background writers and keep them stopped until the ownership-aware version and contract are ready. Confirm the local PostgreSQL target. Take a full database backup with `pg_dump --format=custom` into a private directory, and rehearse `pg_restore` into a separate disposable database. Backups contain private data and tokens; never commit or publish them. Preserve the previous application revision and migration history.
2. Apply the checked-in expansion using the normal migration workflow. It is additive: all existing values and row counts remain unchanged. Regenerate Prisma.
3. Run `npm run ownership -- inventory` from api. It emits table, row ID and a SHA-256 snapshot fingerprint for every unowned domain row, without row content. Review original records locally using the protected backup/database. A fingerprint binds approval to that exact snapshot, including timestamps; edited rows require a fresh inventory and approval.
4. Prepare a version-1 JSON manifest. Record the actual operator in approvedBy, a new batchId and an explicit reason for each confirmed row-to-User mapping. Owners must already be verified, enabled User records. Do not invent an owner for ambiguous data. An empty mappings array deliberately quarantines all unowned rows.
5. With the reviewed manifest and maintenance window confirmed, run `npm run ownership -- apply /absolute/path/approved-manifest.json --maintenance-confirmed`. The CLI refuses non-loopback PostgreSQL. It never creates users, sends emails or infers identity. Keep manifests private; example IDs below are synthetic.
6. Verify inventory is empty and assigned + quarantined equals the pre-migration unowned count. Existing already-owned records are untouched. Inspect the batch evidence. Repeat the same batch/manifest safely after an uncertain process outcome: it returns the saved counts without applying again. A reused ID with different content or a restored batch is rejected.
7. Apply the JAR-013 conversation and ownership contract migrations with the scoped application version. The contract snapshots and quarantines any remaining ownerless rows in the four domain tables before enforcing non-null ownership. Historical session-scoped records stay in their existing tables but are not adopted by new browser aliases; they remain inaccessible through the new conversation boundary. Verify two-user isolation before ending maintenance. Do not fabricate mappings for Google integrations; reconnect using the signed-in account in JAR-014. External beta still requires the remaining identity/integration gates.

```json
{
  "version": 1,
  "batchId": "local-reviewed-batch-001",
  "approvedBy": "actual operator identity",
  "mappings": [
    {
      "table": "Todo",
      "id": "exact-existing-record-id",
      "ownerId": "exact-verified-user-id",
      "sha256": "replace with the 64-character fingerprint from inventory",
      "reason": "record-specific evidence reviewed by the operator"
    }
  ]
}
```

## Quarantine and recovery

One transaction locks the affected tables against concurrent writes, validates every mapping before mutations, and saves the exact JSONB originals for **all** processed rows in LegacyOwnershipRecord. Assigned rows receive the approved owner. Ambiguous rows are removed from live domain tables and retained only in the operator-only snapshot store; no application endpoint exposes it. Batch metadata preserves the manifest, digest and counts. Any failed mapping, write or count check rolls the whole operation back.

During the expansion window, `npm run ownership -- restore <batchId> --maintenance-confirmed` restores the exact original domain snapshots transactionally and records restoredAt. It refuses to overwrite any post-migration edit, owner change, deletion or reused quarantine ID; failure leaves all tables unchanged. Repeat restoration is a no-op. Snapshot evidence remains for audit. Restored rows are unowned again: keep the app stopped and do not treat this as a tenant-safe runtime state.

After the non-null contract, or if unrelated writes occurred, use the rehearsed full backup restoration procedure in a separate database and inspect it before switching the local connection. The snapshot command is intentionally not a blind force-restore. Do not drop audit tables, delete private data or alter approved mappings just to make recovery pass. Quarantine retention/export/deletion policy is handled in JAR-039 before external release.

## Automated evidence

`npm run test:integration` provisions only an isolated, loopback PostgreSQL container. The ownership rehearsal creates separate schemas, replays all pre-expansion migrations, inserts explicit two-owner/ambiguous legacy fixtures, applies the actual expansion SQL and checks:

- fresh schema foreign keys, owner indexes and separate conversation/integration identity;
- exact counts: four assigned and four quarantined; no unowned domain records remain;
- all original values survive an apply/restore round trip, including Unicode and timestamps;
- idempotent apply/restore and rejection of a changed or restored batch;
- missing owner, duplicate/invalid mapping and stale fingerprint rejection;
- rollback after a forced mid-transaction failure and atomic refusal to restore over newer edits.

The existing HTTP/session/provider fixture suite still runs after this rehearsal. No private dataset, real account or live provider is involved. Synthetic approval is test evidence only, not approval to assign any real legacy row.
