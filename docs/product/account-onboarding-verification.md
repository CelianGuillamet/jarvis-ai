# JAR-029 — Account onboarding and Settings

The signed-in account is the source of identity. Installation URLs, conversation aliases and request timeouts come from build configuration; legacy editable localStorage values are ignored. Settings exposes the invited account name/email, preferences and Google connection controls, without identity IDs or tokens.

## Acceptance evidence

1. Invitation-only sign-in explains that application login does not authorize Gmail/Calendar. AuthGate validates profile and loads owned preferences before mounting private content. New users see Settings as onboarding; Google is optional for local tasks. Completion waits for a confirmed preference write. DOM tests mount real Vue components and exercise failed persistence, successful completion, returning users and signed-out visitors.
2. HTTP, login, logout and Google authorization use the configured API base. Requests include credentials. DOM tests use distinct fake application/API origins and assert URLs and credentials; transport tests cover relative URLs and prefixed API bases. The existing server restricts credentialed CORS and mutation origins to configured trusted origins. Signed cookies remain HttpOnly and SameSite=Lax: different origins must still be same-site, or use the application-origin proxy. Arbitrary cross-site cookie hosting is not claimed or enabled.
3. Google connection and reconnection navigate to the configured API with opener isolation. Disconnect removes only the signed-in account's integration, distinguishes pending provider revocation, links to Google's authorization management, and keeps the Jarvis account. Existing isolated backend OAuth/security tests plus new DOM cases cover the local behavior. No live Google login or consent was exercised.

## Preferences and privacy

Preferences persist on User and are accessed only through authenticated-owner GET/POST account/preferences. Strict canonical request/response schemas reject invalid zones, themes and extra identity fields. Integration tests verify signed identity, persistence, anonymous denial and untrusted mutation origins; the security route inventory includes both endpoints. Storage failures remain unavailable errors rather than successful defaults.

The display timezone is applied to Inbox dates and times. Assistant action interpretation retains the existing Europe/Paris timezone; the UI states this explicitly. Theme is restored from account preferences. The migration adds default values for existing users, who complete onboarding once.

Settings explains that disconnecting Google does not delete retained data. During the private beta, help and deletion requests go to the invitation sender; no support address or self-service deletion capability is invented. Automated export/deletion remains the dedicated privacy backlog work.

## Verification scope

Local checks use disposable migrated PostgreSQL, fake provider/model transports and DOM fixtures. They establish application behavior, not deployed cookie/proxy operation, real Google consent approval, third-party revocation availability or production readiness. No deployment or paid provider call is authorized by this ticket.
