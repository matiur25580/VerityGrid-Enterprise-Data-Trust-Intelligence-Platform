# Security Baseline

This document distinguishes controls implemented in the current Phase 2 API from controls still required before production use. It is not a certification or a claim that the product is production-ready.

## Implemented in Phase 2
- Passwords are hashed with bcryptjs (work factor 12); input is capped at 72 UTF-8 bytes to respect bcrypt's input limit; plaintext passwords are never persisted.
- Authentication uses cryptographically random opaque session tokens. Only SHA-256 token hashes are stored in PostgreSQL.
- Session cookies are HttpOnly, SameSite=Strict, path-scoped and Secure in production.
- Sessions expire after seven days, can be revoked on logout, and can be atomically rotated through the session-rotation endpoint.
- Registration creates the initial organization, OWNER membership and user in one database transaction.
- Tenant access is resolved by matching the authenticated user ID with an organization membership. A client-supplied organization ID is never trusted without that membership check.
- Organization roles are checked by API middleware for privileged routes.
- All `/api` routes except health/readiness are protected by a 300-request-per-15-minute baseline limiter; registration and login retain a stricter 10-attempt-per-15-minute limiter.
- API rate limiting uses an atomic Redis counter with a 15-minute expiry, shared across API instances that use the same Redis deployment and key namespace. Redis is a runtime dependency for non-health API routes; if the store is unavailable, requests fail closed through the API error path rather than silently bypassing limits. Configure REDIS_URL with a private, authenticated Redis endpoint and monitor its availability. The limiter key is derived from Express request IP; configure trusted proxy handling deliberately for the deployment topology.
- Request bodies are size-limited; Helmet and an explicit CORS origin are configured.
- Login performs a bcrypt comparison against a cached dummy hash when an account does not exist, reducing account-enumeration signals from the missing-user password path.
- Each request receives a server-generated correlation ID and structured completion log that omits query strings, bodies, credentials, cookies and IP addresses.
- Liveness and PostgreSQL readiness probes are exposed separately; readiness returns 503 when PostgreSQL is unavailable.
- GitHub Actions CI, CodeQL security analysis, Dependabot updates and a coordinated vulnerability reporting policy are configured.
- Mutating requests with an Origin header are checked against the configured web origin.

## Required before production
- Execute automated security, API integration and browser tests, including cross-tenant denial cases, against a migrated test database.
- Add email verification, password reset, account recovery and administrative session revocation.
- Add append-only audit events for authentication and privileged actions.
- Configure HTTPS, trusted proxy behavior and a deployment-specific web/API origin strategy; the current app does not configure proxy trust automatically.
- Add scheduled cleanup of expired session records and monitoring for authentication anomalies.
- Configure managed log retention, alerting, distributed tracing and worker/queue monitoring for each deployment.
- Review password policy and consider Argon2id with an operationally maintained implementation.
- Add a documented CSRF strategy for the final deployment topology. SameSite cookies and origin validation are defense-in-depth, not a substitute for a complete threat review.
- Add centralized tenant-scoped repositories for every tenant-owned resource before those resource APIs are introduced.

## Local-only credentials
The credentials in the Compose file and environment example are intentionally local-development defaults. Replace them before any shared or deployed environment. Do not expose the local database or Redis ports to the public internet.

## Data handling
Use synthetic or explicitly authorized sample datasets for development. Data import must enforce file-size limits, supported formats, safe parsing, and tenant ownership. Production connector access requires explicit user authorization and narrowly scoped credentials.

Never log passwords, raw session tokens, sensitive records or connection strings. Keep production secrets in a managed secret store and use least-privilege database, worker and integration credentials.
