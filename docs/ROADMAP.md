# Development Roadmap

## Phase 1 — Foundation
- [x] Monorepo with React and Express workspaces
- [x] TypeScript configuration
- [x] Local PostgreSQL and Redis Compose services
- [x] Initial Express health endpoint
- [x] Initial Prisma organization, user, membership and asset models
- [x] First responsive product shell
- [ ] Install dependencies and verify clean builds
- [ ] Add automated API and frontend test runners
- [x] Add database migrations and GitHub Actions CI workflow (execution pending)
- [ ] Add frontend automated test runner

## Phase 2 — Identity and tenant security
- [x] Organization registration and sign-in API
- [x] bcrypt password hashing and database-backed opaque sessions
- [x] Session expiry, logout revocation and atomic session rotation
- [x] Membership and role authorization middleware
- [x] Membership-verified tenant context
- [x] React sign-in and organization registration screens
- [x] Session restoration, workspace selection and sign-out UI
- [ ] Tenant-scoped repositories for all future tenant-owned resources
- [x] Add API integration coverage for registration, login, session rotation/revocation and tenant authorization (authored; execution pending)
- [ ] Run security and integration tests against a migrated local database
- [ ] Email verification and account recovery

## Phase 3 — Data catalog
- [x] Organization-scoped source registry with membership and role enforcement
- [x] CSV/JSON import with 900 KB payload, row and column limits
- [x] Dataset metadata and automatic field/type/nullability discovery
- [x] Ownership, classification and tenant-scoped catalog search
- [ ] PostgreSQL connection validation and live schema introspection
- [ ] Object-storage-backed large-file ingestion

## Phase 4 — Quality and lineage
- [x] Versioned validation rules with retained history and active-version switching
- [x] Deterministic rule execution engine (row count, column existence, null rate and uniqueness from import aggregates)
- [x] Persisted quality results, execution history and pass-rate score
- [x] Tenant-scoped dataset dependency graph with cycle prevention
- [x] Downstream impact analysis with bounded traversal

## Phase 5 — Operations and governance
- [x] Redis/BullMQ background quality validation worker with bounded concurrency
- [x] Exponential retry, organization-scoped idempotency and dead-letter retention
- [x] Tenant-scoped incident lifecycle, assignment API and event history
- [x] Governance policies and approval request/decision workflow
- [x] Append-only audit event API and configurable HTTPS webhook notification delivery foundation
- [x] Operations Center UI for incidents, approvals, queue activity and dead letters
- [x] Freshness, analytics, export, evidence-insight and approval-gated action integration scenarios authored
- [x] CSV spreadsheet-formula injection mitigation and regression coverage
- [ ] Execute full API integration suite, generate Prisma client, apply migrations and verify builds

## Phase 6 — Reliability and intelligence
- [x] Dataset observation timestamps and tenant-scoped freshness SLA policies
- [x] Live freshness evaluation with healthy, at-risk, breached, unknown and unconfigured states
- [x] Persisted-record operational analytics and bounded CSV exports
- [x] Evidence-linked deterministic operational insights (explicitly not a generative AI integration)
- [x] Human approval and audited execution for consequential classification changes
- [x] Regression coverage authored for CSV formula-injection mitigation and cross-tenant policy rejection
- [x] Scheduled tenant-scoped SLA evaluation with idempotent incident creation, recovery transitions and audit history
- [x] Notification-provider hook on freshness incident transitions (delivery remains disabled until configured)
- [x] Tenant-scoped daily quality, incident and freshness trend series (7–90 day window)
- [x] Daily freshness snapshots with a deduplicated one-row-per-asset-per-day key
- [x] Configurable HTTPS webhook notification provider with bounded timeouts and secret-safe logging
- [x] Durable BullMQ notification delivery with exponential retries and idempotency keys
- [x] Tenant-scoped notification delivery visibility and administrator retry controls
- [ ] Configure a real endpoint and verify live notification delivery

## Phase 7 — Production hardening
- [ ] Threat model and security review
- [ ] Load and failure-mode testing
- [ ] Backup and restore verification
- [x] GitHub Actions CI quality gates for PostgreSQL/Redis integration, typecheck and builds (execution pending)
- [x] CodeQL security analysis and Dependabot dependency update automation
- [ ] Deployment runbooks and environment documentation
