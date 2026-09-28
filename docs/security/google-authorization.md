# Google integration authorization — JAR-014

Application login remains separate from Gmail/Calendar consent. The integration
start endpoint uses the verified account and authentication-session ID, resolves
the owned conversation, and requests OpenID identity plus the existing integration
scopes with PKCE S256 and a nonce. The callback verifies the Google ID token's
signature, issuer, audience and expiry through the Google library, checks its nonce,
and binds the verified subject to the initiating account. No browser owner or
provider-subject parameter is accepted.

## Durable state and account credentials

Only a SHA-256 digest of the random 256-bit state is stored. State expires after ten
minutes; the PKCE verifier is encrypted. A conditional database update claims it
once across processes, preserving expected restarts. Both owner and login-session
IDs must match. Claimed state remains until credential persistence commits, so
disconnect invalidates callbacks already exchanging a code. Expired state is
removed when a new authorization starts.

One Google integration per owner is supported. A Google subject cannot be shared
between application owners. Reconnect to the same subject retains an existing
refresh token when Google omits a new one. Replacing a subject requires disconnect
first. Credentials are shared across that owner's conversations; legacy browser
session keys cannot select a credential. Metadata responses contain scopes and
connection flags only, never tokens.

Refresh/access tokens use randomized AES-256-GCM envelopes with a version, key ID,
nonce and authentication tag. Associated data binds each value to its credential
ID and token field. Copying ciphertext to another row or field fails decryption.
Refresh events write encrypted values against the credential's generation; an old
client cannot overwrite a reconnect or recreate a deleted credential. Reconnect
changes the generation. No raw provider exception is logged by authorization or
refresh persistence.

## Local key management

No hosted KMS or purchase is required for the current local scope. Set
`GOOGLE_TOKEN_KEYS` to a JSON object mapping stable IDs to independent random
32-byte base64 keys, and `GOOGLE_TOKEN_ACTIVE_KEY` to the write key's ID. Generate
keys with a cryptographically secure generator, for example
`node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64'))"`
in a private local terminal. Do not reuse AUTH_SECRET or a Google client secret.

Store the ring outside version control in a protected local environment file
(owner read/write only) or the local secret manager. Keep an encrypted offline
backup separately from database backups. Never paste keys into tickets, logs,
screenshots or browser storage. Missing/invalid keys prevent token operations;
application features that do not use Google remain available. Losing every copy
of an old key makes its ciphertext unrecoverable: reconnect instead of guessing.

For rotation, stop writers, take and test a protected full database backup, add a
new random key while retaining old keys, and select it as active. Run the sealing
command below; it decrypts existing envelopes and re-encrypts with the active key
inside one transaction, verifying plaintext equality before each write. Retain old
keys until old backups and in-flight authorization state have expired or been
retired according to policy. Then remove old keys and restart. No scheduled rotation
or remote key service has been configured by this ticket.

## Legacy migration and rollback

Before applying migration `20260928190000_google_credentials` to an existing local
database, stop all writers and take/test a full backup. With the key ring configured,
run from api:

```sh
npm run google:tokens -- seal --maintenance-confirmed
npm run db:migrate
```

The sealing command accepts only loopback PostgreSQL/public schema, locks the token
table, encrypts plaintext or rotates existing ciphertext atomically, and prints only
a record count. It preserves IDs, metadata, timestamps and any existing integration
relation. It never invents an owner. Unbound legacy tokens remain encrypted but
inaccessible to runtime account lookup; reconnect explicitly. The migration refuses
plaintext rows instead of destroying them. Fresh empty databases migrate directly.

Do not start an older application against encrypted token columns. For rollback,
restore the protected full pre-cutover backup into a separate database and use its
matching application version. Preserve the keys needed for encrypted backups.
Retention of legacy tokens and backups remains JAR-039. No real local database was
migrated during development.

## Disconnect and provider revocation

`POST /auth/google/disconnect` requires a signed-in session and trusted mutation
origin. It deletes the owner's local credentials and pending authorization states
before attempting Google's revocation endpoint. It is idempotent and does not affect
application login or another user. If Google is unavailable, or a decryption key is
lost, local access stays removed and `revocationPending: true` tells the client to
direct the user to remove the grant in their Google account permissions. This is
not a claim that remote revocation succeeded. Account-centered UI is JAR-029.

## Verification

Automated fixtures cover encrypted storage/tampering/record binding/key rotation,
durable state restart/expiry/session mismatch/concurrent replay, account separation,
subject ownership, reconnect without a new refresh token, stale refreshes, revoke
and late callback rejection. Migration rehearsals cover legacy preservation,
plaintext rejection and rollback when a required key is unavailable. Transport is
fake or disabled; no real account was used.

Before external beta, use a dedicated invited test account and synthetic mail/events:
verify consent/scopes, restart the API before completing consent, retry the callback,
switch application accounts before callback, reconnect, exercise token refresh, and
disconnect. Confirm permission removal at Google and denied subsequent API access.
Record dates, versions, granted scopes and redacted outcomes, never tokens. These
live checks remain unperformed and belong in the combined identity/launch evidence
(JAR-016/JAR-038/JAR-042); no deployment or live provider calls are authorized here.
