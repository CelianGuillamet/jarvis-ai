# Runtime configuration and API boundaries

Startup validates database/authentication settings, optional Google credential pairing and encryption keys, provider selection, numeric limits, booleans, timezone and configured service URLs. Invalid values stop startup; validation diagnostics contain field names, never values. OpenAI requires explicit selection and an API key. Production authentication origins must be exact HTTPS origins. Local defaults use Ollama and loopback HTTP.

The shared HTTP setup runs before Better Auth and Nest routes. JSON and form bodies are limited to 64 KiB, including chunked requests; compressed bodies and unsupported media types are refused. Forms have at most 50 parameters. URLs are limited to 8 KiB. Parser errors return generic responses without submitted content. Better Auth's node adapter accepts the bounded parsed body; the integration fixture exercises this same setup.

Chat text: 8,000 characters. Replies: 20,000. Conversation identifiers: 128. Object/message identifiers: 256. Inbox search/reminder time: 500. An Inbox mutation accepts at most 20 messages; scanning retains its existing 50-message ceiling. DTO violations return 400; body overflow returns 413, URL overflow 414, unsupported body encoding/media type 415.

Verified accounts receive 120 guarded requests per minute, with a subset of 20 mutations/Google connection starts. Changing conversation identifiers does not create another allowance. Authentication endpoints have a separate 30-request/minute socket-address allowance. Refusals return 429 and Retry-After. Proxy headers cannot spoof addresses: trust proxy is disabled. A future reverse-proxy deployment must explicitly design and verify trusted proxy handling; shared NAT/proxy clients currently share the authentication allowance.

Quotas are bounded in-memory fixed windows, capped at 10,000 entries and fail closed at capacity. They reset on process restart and are **not distributed quotas or a financial spending limit**. Multiple instances require shared enforcement before launch. Provider execution budgets are tracked separately in JAR-036.

Responses disable caching, MIME sniffing, framing and referrer disclosure. Production adds HSTS and a restrictive API content policy. CORS retains the exact configured authentication/application origins. No hosted service, real provider call or deployment is needed to verify these controls.
