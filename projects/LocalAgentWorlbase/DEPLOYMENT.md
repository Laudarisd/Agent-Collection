# Deployment

LocalAgentWorlbase is a Next.js server application with PostgreSQL-backed competitive-intelligence features. Cloud AI traffic uses server-side route handlers. Local Ollama/llama.cpp traffic is browser-direct by design.

## Node deployment

With a local or external PostgreSQL service:

```bash
npm install
npm run build
npm start
```

Set at minimum:

```text
DATABASE_URL=postgresql://...
```

Optional variables:

```text
DATABASE_POOL_MAX=10
DATABASE_SSL=false
CRAWLER_MAX_PAGES=30
CRAWLER_DELAY_MS=200
MONITOR_INTERVAL_HOURS=6
MONITOR_BATCH_SIZE=1
CRON_SECRET=<long-random-secret>
NEXT_PUBLIC_APP_NAME=LocalAgentWorlbase
```

If the managed PostgreSQL provider requires TLS, set `DATABASE_SSL=true` only when the provider supplies a certificate chain trusted by the Node.js runtime. Do not disable certificate verification in application code merely to make a connection work.

## Scheduled competitor monitoring

Set `CRON_SECRET` and configure a trusted scheduler to call `GET /api/jobs/monitor` with `Authorization: Bearer <CRON_SECRET>`. Call the endpoint more frequently than the desired monitoring interval; the application itself selects only competitors whose latest crawl is due. `MONITOR_INTERVAL_HOURS` defaults to 6 and `MONITOR_BATCH_SIZE` defaults to 1.

The route is intentionally protected and returns `503` when `CRON_SECRET` is not configured. Do not put the cron secret in browser JavaScript or a public URL query parameter.

## Local-model access after deployment

A browser opened on a deployed site still needs permission to contact the user's local runtime. Configure the runtime's allowed origins for the deployed site. Modern browser mixed-content/private-network policies can block HTTPS pages from calling an insecure local HTTP endpoint. For organization deployment, prefer a trusted local HTTPS gateway or deploy the web application and local runtime within the same controlled private environment.

Do not expose a local model server directly to the public internet.

## Public multi-user launch requirements

The provided release targets private/personal professional use. Before a public multi-user launch, add and verify:

- account authentication, session protection, and per-workspace authorization;
- encrypted server-side cloud API-key storage instead of browser persistence;
- rate limits and request/body quotas for AI and crawler endpoints;
- outbound network/egress controls for the crawler in addition to application-level SSRF checks;
- CSRF strategy appropriate to the chosen authentication mechanism;
- Content Security Policy and deployment-specific security headers;
- centralized audit/observability that never records API keys and avoids raw prompts unless required;
- database backup, retention, migration, and restore procedures;
- organization-specific privacy, terms, and data-retention policies.

## CI

`.github/workflows/ci.yml` installs dependencies and runs:

```text
npm run typecheck
npm run lint
npm run build
```

Require a green CI build before deploying a release tag.
