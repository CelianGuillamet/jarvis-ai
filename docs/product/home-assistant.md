# JAR-051 — Local Home Assistant integration

First increment, API only: no Home Assistant code, add-on or package is imported or installed. Jarvis calls the documented REST endpoints of an existing Home Assistant server (Apache-2.0, `home-assistant/core`) through a small NestJS adapter: `GET /api/`, `GET /api/states`, `POST /api/services/light/turn_on|turn_off` and `POST /api/services/scene/turn_on`. Assist, Wyoming and Jarvis AIO are not used. No Home Assistant version has been verified: only a fake server was exercised, and no real device was controlled.

## Defaults and secrets

Off by default (`HOME_ASSISTANT_ENABLED=false`). When on, each account connects its own server from Settings with a long-lived token. The token is encrypted with the same key ring as Google tokens (`GOOGLE_TOKEN_KEYS`, AAD `home-assistant:<ownerId>`), is never returned by the API or shown again, is excluded from the account export, and is deleted on disconnect. The row is in the privacy inventory, purge order and write fence.

## Network boundary

The base URL must be `http(s)://host[:80|443|8123]` with no credentials, path, query or fragment. The host must resolve only to loopback or private LAN ranges (10/8, 172.16/12, 192.168/16, 127/8, ::1, fc00::/7); link-local, metadata, CGNAT, multicast and public addresses are refused, as is a mixed DNS answer. The address is re-resolved and re-checked on every use, and the connection is pinned to the checked address. Redirects are refused, responses are limited to 512 KiB and must be JSON, requests time out after 5 s.

## Capabilities

- Read: after choosing devices in Settings, `home.list` returns the state of the selected lights, scenes, sensors and binary sensors. Nothing outside the explicit selection (max 50) is visible to the model.
- Mutate: `home.light` (on/off, optional brightness 1–100) and `home.scene` only, for selected entities, with a preview and the existing confirmation and journal. No arbitrary service, shell or domain is exposed; unknown arguments are rejected at parsing.
- A write that cannot have reached the server is journaled as failed; any other interruption is journaled as unknown and is not retried.
- Device names and states come from the network and are flattened (no control characters) and bounded before reaching the model.

## Verified

Unit tests with a fake HTTP server: address classification, malformed URLs, DNS pinning, token header, redirects not followed, oversize and non-JSON replies, timeouts (read vs write), closed port. PostgreSQL tests: disabled by default, forbidden destinations store nothing, encrypted per-owner token, discovery limited to supported domains, allow-list enforcement, cross-owner isolation, argument validation, previews, failed vs unknown journaling, token-free error messages, disconnect revocation, database limits. Web component tests for the Settings card. Endpoints are in the private-endpoint security matrix.

## Limits

- Read-then-mutate is not atomic: the entity state can change between preview and confirmation.
- Brightness is reported as a percentage of 255; colours, climate, locks, covers and media are out of scope.
- DNS rebinding between the check and the connect is closed by pinning, but a `.local` name depends on the host's mDNS resolver.
- Token rotation requires reconnecting; the Google key ring is shared, so rotating it re-encrypts both.
- Not validated against a real Home Assistant, real devices, or a real browser.
