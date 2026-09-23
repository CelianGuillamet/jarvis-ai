# Application identity and sessions — JAR-011

Authentication is handled by Better Auth 1.7.5, with the Prisma/PostgreSQL adapter. Native dynamic imports load its ESM modules from Nest's existing module output. The handler is mounted before body parsing. All Nest controllers default to the global session guard; only health and non-sensitive login availability are public. The library's login routes validate OAuth state/PKCE and Google token signatures/claims. Application identity is the local User ID, never a conversation ID.

## Local setup

Generate a unique AUTH_SECRET using `openssl rand -base64 32` and put it in the local ignored API environment file. Configure AUTH_BASE_URL and APP_ORIGIN as exact origins. HTTP is permitted only on loopback outside production; production requires HTTPS. Missing/short secrets, partial Google credentials, wildcard/path/userinfo origins and insecure remote origins fail startup.

Run the checked-in migrations and regenerate Prisma. The identity migration adds tables; it does not assign owners to existing data. JAR-012/013 will migrate and scope domain records before any external beta. The application is not ready for multiple real users merely because login works.

Application Google sign-in uses separate AUTH_GOOGLE_CLIENT_ID/SECRET settings and `/api/auth/callback/google`. Existing GOOGLE_* settings are for Gmail/Calendar permissions; login does not authorize those integrations. With no application Google credentials, the French login screen explicitly shows that sign-in is unavailable. Do not connect real accounts without authorization; isolated tests exercise Google using generated token/JWKS fixtures and block all real transport.

Manage invitations locally after verifying DATABASE_URL:

```sh
npm run account:invite -- invite person@example.invalid
npm run account:invite -- revoke person@example.invalid
```

This operator-only script sends no email. Revocation removes existing sessions transactionally. Invitations can also expire; every private request rechecks verified account status, disabled state, invite revocation and expiration. No public endpoint can create invitations. Five invitees is a planning default, not a hard-coded authorization limit.

## Session boundary

- Signed HttpOnly, SameSite=Lax cookies; Secure on HTTPS. One-day server session expiry, one-hour refresh interval; cookie cache disabled for immediate revocation.
- Exact-origin checks reject missing/null/untrusted origins on all cookie-authenticated mutation routes, including the auth handler. This is explicit even when the library runs in test mode.
- Google subjects identify linked accounts. Automatic account linking/password login are disabled. New and returning provider identities require verified email and an active invitation; disabled users cannot create a session or access private APIs.
- Login access/refresh/ID tokens are discarded before persistence; provider permissions are separate. Browser local storage and bearer headers are not authentication mechanisms.
- French login/availability/retry/logout UI gates private views. API 401 responses return the UI to session verification. Logout reloads the app to clear mounted views and memory.
- Same-origin development proxies cover `/account`, `/api/auth` and existing private routes. Explicit CORS origins replace the prior unrestricted configuration.

## Verification

The disposable PostgreSQL suite replays all 13 migrations and exercises existing fake-provider flows through real signed application sessions. It covers anonymous/conversation-ID-only access, origin violations, tampered/expired/deleted sessions, revoked invites, disabled accounts, logout, real auth-adapter callback processing with locally signed Google/JWKS fixtures, uninvited/unverified rejection and missing-state callback rejection. Generated Google fixture keys/tokens are not real credentials. The test runner uses Node's VM-module support for Jest to load the ESM auth dependency; startup also verifies the compiled native module path.

No live Google connection or deployment is part of this ticket. Ownership migration/isolation, provider-token encryption, broader runtime quotas and release validation remain separate backlog gates.
