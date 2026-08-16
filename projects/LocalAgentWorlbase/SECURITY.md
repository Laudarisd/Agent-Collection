# Security

## Provider credentials

Cloud API keys are sent to this application's server-side cloud-model routes and forwarded only to the selected provider for the active model request/model-discovery request. They are not embedded into rendered HTML or `NEXT_PUBLIC_*` environment variables.

The default browser persistence is `sessionStorage`; **Remember on this device** uses `localStorage`. This is acceptable only for a trusted personal device. A multi-user production system should replace it with encrypted server-side secret storage tied to authenticated accounts and workspace authorization.

## Local runtimes

Ollama and llama.cpp requests are browser-direct to the configured local runtime URL. This allows a deployed web server to work with a model running on the user's own computer.

Keep local runtimes bound to loopback by default. If LAN access is intentional, use runtime authentication where supported, narrow allowed origins, and enforce network controls. Never expose an unauthenticated local inference server directly to the public internet.

## Crawler / SSRF controls

The competitor website crawler accepts only HTTP/HTTPS targets. Before requests it resolves hostnames and refuses localhost, embedded credentials, private IP ranges, link-local addresses, and other common non-routable ranges. Redirect targets are validated before being followed and crawling remains on the configured competitor origin.

These checks substantially reduce accidental/server-side request-forgery exposure but are not a complete substitute for infrastructure controls. DNS can change between application validation and the underlying socket connection. For a public multi-tenant deployment, also place the crawler in a network environment whose egress policy blocks internal metadata, private RFC1918 ranges, service-control networks, and other sensitive destinations at the network layer.

The crawler also uses body-size limits, request timeouts, redirect limits, same-origin discovery, and bounded page counts. It reads robots.txt and applies crawl-delay up to the built-in maximum.

## Database

Do not publish the PostgreSQL port publicly. Use a dedicated database role, a strong password, network isolation, backups, and TLS where appropriate. The application's schema is created idempotently at runtime, so production operators should still adopt an explicit migration/release procedure before evolving the schema across versions.

## Attachments and conversation data

Conversation history and attachments are stored in browser IndexedDB. Attachments are sent only when they are part of a message submitted to the selected provider/runtime. Client limits prevent unbounded browser storage/request payloads, but public deployments should add server-side quotas as well.

## Production checklist

- HTTPS everywhere outside localhost.
- Authentication and authorization before exposing intelligence APIs to other users.
- Encrypted server-side secret vault for multi-user API keys.
- Rate limiting for cloud AI, model discovery, crawler, and mutation endpoints.
- Network-level crawler egress restrictions.
- CSP and deployment-specific security headers.
- Database backup/restore verification.
- Log metadata rather than secrets/raw prompts unless explicitly required.
- Dependency and local-runtime patching policy.
- Review each external model provider's retention/privacy configuration for your organization.
