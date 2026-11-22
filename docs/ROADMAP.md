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
- [ ] Add database migration and CI workflow

## Phase 2 — Identity and tenant security
- [ ] Organization registration and sign-in
- [ ] Secure password hashing and session rotation
- [ ] Membership and role authorization
- [ ] Tenant-scoped service/repository patterns
- [ ] Security and integration tests

## Phase 3 — Data catalog
- [ ] Organization-scoped source registry
- [ ] CSV/JSON import with size and type limits
- [ ] Dataset and schema metadata
- [ ] Ownership, classification and search

## Phase 4 — Quality and lineage
- [ ] Versioned validation rules
- [ ] Deterministic rule execution engine
- [ ] Persisted quality results and score calculation
- [ ] Dataset dependency graph
- [ ] Impact analysis

## Phase 5 — Operations and governance
- [ ] Background ingestion and validation workers
- [ ] Retry, idempotency and dead-letter handling
- [ ] Incident lifecycle and notifications
- [ ] Governance policies and approvals
- [ ] Append-only audit events

## Phase 6 — Reliability and intelligence
- [ ] Freshness and SLA monitoring
- [ ] Operational analytics and exports
- [ ] Evidence-grounded AI assistance
- [ ] Human approval for consequential actions

## Phase 7 — Production hardening
- [ ] Threat model and security review
- [ ] Load and failure-mode testing
- [ ] Backup and restore verification
- [ ] CI quality gates and dependency scanning
- [ ] Deployment runbooks and environment documentation
