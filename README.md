# VerityGrid
## Enterprise Data Trust, Intelligence & Reliability Platform

**VerityGrid turns fragmented data operations into a measurable, governed reliability workflow.** It brings data discovery, profiling, quality validation, lineage, freshness objectives, incidents, approvals and audit evidence into one multi-tenant workspace.

The product is designed around a practical enterprise question: *Can teams trust this data, understand its dependencies, detect when it becomes unreliable, and prove how they responded?*

> **Project status — active engineering build:** Core catalog, quality, lineage, governance and reliability capabilities are implemented, including tenant-safe asset/source pagination. The reproducible npm workspace lockfile is committed and CI uses `npm ci`. Main-branch CI passed on Node.js 22, 24 and 26; CodeQL passed. Production deployment, verified dashboard screenshots and deployment-specific operational controls remain outstanding. This repository must not be represented as independently audited or production-certified.

---

## 1. Product capabilities

### Data discovery and catalog
- Organization-scoped data-source registry and data-asset catalog.
- CSV and JSON import with bounded payload, row and column limits.
- Automatic schema and profiling metadata discovery.
- Asset ownership and data-classification metadata.
- Tenant-scoped catalog search and access controls.
- Stable cursor-based asset pagination (1–100 records per page) with workspace/filter-bound cursor validation.
- Filterable, cursor-paginated source discovery with workspace-bound cursors and bounded source detail previews.
- Keyboard-first command palette (`Ctrl/Cmd + K`) for fast navigation across workspace modules.
- PostgreSQL source registration is currently metadata-only; live external database introspection is a planned connector capability.

### Data quality and lineage
- Versioned quality rules with active-version management.
- Deterministic checks for row counts, column existence, nullability, null rates and uniqueness.
- Persisted quality runs, pass/fail/skip counts and quality scores.
- Background validation using Redis and BullMQ.
- Retry policies, idempotent job keys and dead-letter retention.
- Tenant-scoped lineage graph, cycle prevention and bounded downstream impact analysis.
- **Versioned data contract registry** with immutable schema baselines, named ownership and draft/active/retired lifecycle.
- Backward-compatible and strict schema compatibility evaluation with persisted results for removed fields, type changes, nullability broadening and additive fields.
- Imported raw CSV/JSON rows are not retained; validation uses persisted profiling aggregates and schema evidence.

### Reliability intelligence
- Freshness objectives and health states: healthy, at risk, breached, unknown and unconfigured.
- Scheduled, tenant-scoped SLA evaluation.
- Incident creation, escalation, recovery and recurrence handling.
- Daily freshness snapshots and 7–90 day historical trend analytics.
- Evidence-linked operational insights generated from persisted platform records and deterministic rules—not fabricated metrics or a generative-AI claim.
- Bounded CSV exports with spreadsheet-formula injection mitigation.

### Governance and operational response
- Tenant-scoped incident lifecycle, severity and event history.
- Governance policies and approval requests.
- Independent administrator approval for consequential actions; no self-approval.
- Approval-gated classification changes with stale-state checks and audit history.
- Append-only audit event records for key operational decisions.
- Configurable HTTPS webhook alerts with Bearer authentication, bounded timeouts, idempotency keys and retryable BullMQ delivery.
- Operations Center visibility for incidents, jobs, dead letters and notification delivery; administrator retry controls.

### Enterprise engineering foundations
- Multi-tenant organization membership and role-based access control.
- Opaque, database-backed sessions with secure cookie settings, rotation and revocation.
- Password hashing, Redis-backed distributed API rate limiting with a separate stricter authentication namespace, request validation, Helmet, explicit CORS and origin checks.
- Server-generated request IDs and privacy-conscious structured HTTP logs.
- Liveness and PostgreSQL readiness endpoints.
- GitHub Actions CI, CodeQL security analysis, Dependabot update automation and pull-request review checklist.
- PostgreSQL custom-format backup and guarded restore utilities with SHA-256 verification.

---

## 2. Technology stack

| Layer | Technology | Responsibility |
|---|---|---|
| Web | React 18, TypeScript, Vite | Workspace UI and operational dashboards |
| API | Node.js 22.11+, Express, TypeScript | Authenticated domain APIs |
| Data | PostgreSQL 16, Prisma 6 | Durable system of record and schema migrations |
| Jobs | Redis 7, BullMQ, ioredis | Background execution, retries and scheduling |
| Validation | Zod | Request and payload validation |
| Security | bcryptjs, Helmet, CORS, express-rate-limit | Identity and API security controls |
| Testing | Vitest, Supertest | API integration and frontend component regression coverage |
| Engineering automation | GitHub Actions, CodeQL, Dependabot | Quality gates and dependency/security review |
| Local infrastructure | Docker Compose | PostgreSQL and Redis development services |

The application is a modular monolith with separately runnable web, API and worker processes. This keeps the domain cohesive while allowing background workloads to scale independently.

---

## 3. Architecture

```text
veritygrid/
├── apps/
│   ├── web/                 React + TypeScript + Vite
│   └── api/                 Express API + Prisma + BullMQ workers
├── docs/                    Architecture, security and runbooks
├── scripts/                 PostgreSQL backup and restore utilities
├── .github/
│   ├── workflows/            CI and CodeQL
│   └── dependabot.yml        Dependency update automation
├── docker-compose.yml        Local PostgreSQL and Redis
└── README.md
```

### Runtime flow

1. A user authenticates and selects an organization workspace.
2. The API verifies membership and role before accessing tenant-owned resources.
3. Data assets and profiling evidence are stored in PostgreSQL.
4. Quality validation and freshness monitoring execute through background workers.
5. Persisted outcomes feed analytics, incidents, evidence-linked insights and lineage impact views.
6. Consequential governance actions require approval and create audit records.
7. Incident notifications are queued and delivered through an optional HTTPS webhook.

**Trust boundary:** the API is authoritative. A browser-supplied organization identifier is never sufficient proof of access.

---

## 4. Identity, roles and security

- Passwords are hashed with bcryptjs (work factor 12); plaintext passwords are not persisted.
- Authentication uses cryptographically random opaque session tokens. Only token hashes are stored.
- Session cookies are HttpOnly, SameSite=Strict and Secure in production.
- Sessions expire, can be revoked and support atomic rotation.
- Membership-verified tenant context protects organization-scoped API routes.
- OWNER and ADMIN roles are used for privileged governance operations; other workspace roles are defined in the domain model.
- All API routes except health/readiness are rate-limited to 300 requests per 15 minutes per client IP; registration and login retain a stricter 10-attempt per 15-minute limit. API and authentication limits use atomic Redis counters shared across replicas; Redis is required for non-health API requests and requests fail closed if the store is unavailable.
- Helmet, explicit CORS, request-size limits and origin checks provide API security baselines.
- Request logs deliberately omit request bodies, query strings, cookies, authorization headers and IP addresses.
- Security policy: [SECURITY.md](SECURITY.md) and [Security Baseline](docs/SECURITY.md).

These controls are an engineering baseline, not a substitute for deployment-specific threat modeling, independent penetration testing or compliance certification.

---

## 5. Reliability, health and operations

### Health endpoints

| Endpoint | Purpose | Expected behavior |
|---|---|---|
| `GET /api/health` | Liveness | Confirms the API process can answer |
| `GET /api/health/ready` | Readiness | Checks PostgreSQL connectivity; returns 503 when unavailable |

Every API response includes a server-generated `x-request-id`. Structured request-completion logs include the correlation ID, method, path, status, duration and timestamp.

Redis and worker health must be monitored independently. A successful API readiness check does not prove that background processing is healthy.

### Incident webhook configuration

Set these optional API/worker environment variables:

```env
INCIDENT_WEBHOOK_URL=
INCIDENT_WEBHOOK_TOKEN=
NOTIFICATION_WORKER_CONCURRENCY=4
```

- Leave the URL empty to keep outbound notifications disabled.
- Use a trusted HTTPS endpoint with a public DNS hostname.
- The optional token is sent as a Bearer credential.
- Delivery uses bounded timeouts, retries and an idempotency header.
- Webhook receivers should deduplicate events using the idempotency key.
- Live delivery is not verified until a real endpoint is configured and tested.

---

## 6. Local development

### Prerequisites
- Node.js 22.11 or newer
- npm
- Docker Engine or Docker Desktop
- PostgreSQL client utilities only if you plan to use the backup/restore scripts

### Setup

1. Clone the repository and enter its root directory.
2. Create the API environment file:

   ```bash
   cp apps/api/.env.example apps/api/.env
   ```

3. Start PostgreSQL and Redis:

   ```bash
   docker compose up -d postgres redis
   ```

4. Install workspace dependencies:

   ```bash
   npm install
   ```

5. Generate Prisma Client and apply the development migrations:

   ```bash
   npm run db:generate
   npm run db:migrate
   ```

6. Start the API and web application:

   ```bash
   npm run dev
   ```

7. In a second terminal, start the background workers:

   ```bash
   npm run worker:dev
   ```

8. Open the Vite URL shown in the terminal (default: `http://localhost:5173`), register a workspace and begin with synthetic or authorized sample data.

Default API URL: `http://localhost:4000`.

### Environment variables

| Variable | Required | Description |
|---|---:|---|
| `NODE_ENV` | No | Runtime mode; use `production` in production |
| `PORT` | No | API port; defaults to 4000 |
| `WEB_ORIGIN` | Yes for shared environments | Exact trusted web origin |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `REDIS_URL` | Yes for workers | Redis connection string |
| `QUALITY_WORKER_CONCURRENCY` | No | Quality worker concurrency |
| `FRESHNESS_SCHEDULE_INTERVAL_MS` | No | Freshness schedule interval; minimum 60 seconds |
| `INCIDENT_WEBHOOK_URL` | No | Optional trusted HTTPS alert endpoint |
| `INCIDENT_WEBHOOK_TOKEN` | No | Optional webhook Bearer token |
| `NOTIFICATION_WORKER_CONCURRENCY` | No | Notification worker concurrency, bounded by the worker |

Never commit real environment files or credentials. Replace local-only Compose credentials before using shared infrastructure.

---

## 7. Engineering quality and CI

The repository includes:
- **CI workflow:** tests Node.js 22, 24 and 26, uses `npm ci` with the committed workspace lockfile, runs a high-severity npm audit, generates Prisma Client, applies migrations against ephemeral PostgreSQL, typechecks, builds and runs API integration and frontend regression tests with PostgreSQL and Redis services. The lockfile-refresh workflow can generate and verify a lockfile PR.
- **CodeQL:** scheduled and change-triggered JavaScript/TypeScript security analysis using extended queries.
- **Dependabot:** weekly npm and GitHub Actions dependency update pull requests.
- **Pull-request template:** prompts reviewers to consider tenant isolation, data handling, migrations, job idempotency, observability and rollback.

Run checks locally:

```bash
npm run typecheck
npm run build
npm test
```

Integration tests require a migrated database and available Redis. CI results are authoritative only after the workflows have actually run; workflow configuration alone is not a passing test result.

---

## 8. Backup and recovery

A custom-format PostgreSQL backup utility creates a SHA-256 checksum and applies local file permissions and retention:

```bash
export DATABASE_URL='postgresql://...'
export BACKUP_DIR='./backups'
export BACKUP_RETENTION_DAYS=14
bash scripts/backup-postgres.sh
```

Restore is destructive to objects in the target database and requires explicit confirmation plus a checksum sidecar:

```bash
export DATABASE_URL='postgresql://...'
export BACKUP_FILE='./backups/veritygrid-YYYYMMDDTHHMMSSZ.dump'
export CONFIRM_RESTORE=YES
bash scripts/restore-postgres.sh
```

Use an isolated database for restore rehearsals. The scripts do not encrypt or upload backups. Production operators must configure encrypted off-site storage, key management, access control, retention, and recurring restore drills.

Full runbook: [Production Readiness and Operations](docs/PRODUCTION_READINESS.md).

---

## 9. Dashboard screenshot gallery

The gallery is a single-column sequence of genuine application captures at a consistent 1440 × 1000 viewport. To publish it after your manual deployment, configure the repository Actions secrets `DEMO_EMAIL` and `DEMO_PASSWORD` with a dedicated synthetic demo account, then run **Actions → Capture dashboard showcase → Run workflow** and provide the deployed demo URL. The workflow installs Playwright, captures the live app, verifies all twelve PNGs and commits them to `main`. Never use production credentials or customer data.

### 1. Executive command center

![Executive command center — data estate, trust posture and operational priorities.](docs/screenshots/01-executive-overview.svg)

Executive command center — data estate, trust posture and operational priorities.

### 2. Data catalog and discovery

![Data catalog and discovery — inventory, ownership and classification.](docs/screenshots/02-data-catalog.svg)

Data catalog and discovery — inventory, ownership and classification.

### 3. Data contract registry

![Data contract registry — versioned schema expectations and compatibility evidence.](docs/screenshots/03-data-contracts.svg)

Data contract registry — versioned schema expectations and compatibility evidence.

### 4. Lineage and impact analysis

![Lineage and impact analysis — upstream/downstream dependencies and blast radius.](docs/screenshots/04-data-lineage.svg)

Lineage and impact analysis — upstream/downstream dependencies and blast radius.

### 5. Quality center

![Quality center — validation rules and persisted quality evidence.](docs/screenshots/05-quality-center.svg)

Quality center — validation rules and persisted quality evidence.

### 6. Incident response

![Incident response — severity, ownership, lifecycle and event history.](docs/screenshots/06-incident-response.svg)

Incident response — severity, ownership, lifecycle and event history.

### 7. Governance approvals

![Governance approvals — policy controls and independent decisions.](docs/screenshots/07-governance-approvals.svg)

Governance approvals — policy controls and independent decisions.

### 8. Notification delivery

![Notification delivery — webhook state, retry controls and delivery evidence.](docs/screenshots/08-notification-deliveries.svg)

Notification delivery — webhook state, retry controls and delivery evidence.

### 9. Reliability overview

![Reliability overview — freshness, quality and service reliability signals.](docs/screenshots/09-reliability-overview.svg)

Reliability overview — freshness, quality and service reliability signals.

### 10. Reliability trends

![Reliability trends — historical quality, incident and freshness patterns.](docs/screenshots/10-reliability-trends.svg)

Reliability trends — historical quality, incident and freshness patterns.

### 11. Freshness and SLA monitor

![Freshness and SLA monitor — objectives and healthy, at-risk and breached states.](docs/screenshots/11-freshness-sla.svg)

Freshness and SLA monitor — objectives and healthy, at-risk and breached states.

### 12. Evidence-grounded insights

![Evidence-grounded insights — traceable recommendations grounded in persisted evidence.](docs/screenshots/12-evidence-insights.svg)

Evidence-grounded insights — traceable recommendations grounded in persisted evidence.

## 10. Enterprise roadmap: next high-value capabilities

The current product foundation is intentionally evidence-first. The next differentiators should deepen governance and operational trust without overstating integrations:

1. **Data contracts and schema drift** — versioned producer/consumer contracts, compatibility checks, schema-change diffs, approval gates and drift incidents.
2. **Policy-as-code governance** — reusable classification, retention and quality policies with simulation/preview before enforcement.
3. **OpenTelemetry observability** — trace correlation across API and workers, queue latency, job outcomes and service-level indicators.
4. **Connector framework** — credential-isolated, least-privilege connectors with dry-run validation, incremental sync checkpoints and connector health.
5. **Evidence export and audit packs** — signed manifest, immutable event references and exportable control evidence for assurance workflows.
6. **Operational SLOs** — configurable service objectives, error-budget burn alerts and explicit freshness/quality objective ownership.

These are roadmap candidates, not claims of shipped functionality. Each should be delivered with tenant-isolation tests, migration coverage, authorization checks, audit events and documented failure behavior.

---

## 11. Current product boundaries

The following are intentionally explicit so that product claims remain evidence-based:

- PostgreSQL source records are catalog metadata; live connector validation and schema introspection are not yet implemented.
- CSV/JSON import stores discovered schema and profiling aggregates, not raw imported records.
- Reliability insights are deterministic and evidence-linked; a generative AI assistant is not claimed.
- Freshness history begins when the migration is applied and the worker records snapshots; prior history is not reconstructed.
- External notification delivery remains disabled until an operator configures a real endpoint.
- The backup scripts create local dumps and checksums; encryption, off-site replication and scheduled restore verification are operator responsibilities.
- Formal SLOs, RTO/RPO, production load testing, independent security review and compliance certification have not been completed.

---

## 12. Roadmap

- [x] Multi-tenant identity and workspace access
- [x] Catalog, profiling, quality validation and lineage
- [ ] Versioned data contract registry and schema compatibility evaluation (merged in PR #16; PR CI and CodeQL passed)
- [x] Incident lifecycle, governance approvals and audit records
- [x] Freshness SLAs, historical trends and evidence-linked insights
- [x] Retryable webhook notification foundation and Operations Center visibility
- [x] CI, CodeQL, Dependabot, request correlation and readiness probe foundations
- [x] PostgreSQL backup/restore scripts and operational runbook
- [x] Keyboard-first command palette for workspace navigation
- [x] Commit a reproducible workspace dependency lockfile and use `npm ci` in CI
- [x] Pass main-branch CI on Node.js 22, 24 and 26; pass CodeQL security analysis
- [ ] Complete threat model, penetration testing and load/failure testing
- [ ] Add encrypted off-site backups and scheduled restore rehearsals
- [ ] Add managed observability, alerting and explicit SLO/RTO/RPO targets
- [ ] Capture and publish 12 verified dashboard screenshots
- [ ] Implement live PostgreSQL connectors and large-file object-storage ingestion

---

## 13. Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Development Roadmap](docs/ROADMAP.md)
- [Security Baseline](docs/SECURITY.md)
- [Production Readiness and Operations](docs/PRODUCTION_READINESS.md)
- [Frontend Resilience](docs/FRONTEND_RESILIENCE.md)
- [Reproducible Dependency Installation](docs/DEPENDENCY_LOCKFILE.md)
- [Authentication API](docs/API_AUTHENTICATION.md)
- [Data Catalog API](docs/DATA_CATALOG.md)
- [Data Contract Registry and Schema Compatibility](docs/DATA_CONTRACTS.md)
- [Quality and Lineage API](docs/QUALITY_LINEAGE.md)
- [Operations and Governance API](docs/OPERATIONS_GOVERNANCE.md)
- [Reliability and Intelligence](docs/RELIABILITY_INTELLIGENCE.md)
- [Dashboard screenshot capture checklist](docs/screenshots/README.md)

---

## 14. Project scope

VerityGrid is an engineering portfolio project demonstrating modern data-platform architecture and operational design. It is not a certified compliance product, a managed data observability service, or a substitute for specialist legal, privacy or security advice.

**Deployment is intentionally separate from repository implementation.** Review environment configuration, migration compatibility, security posture, backup strategy and release checks before deploying to any shared environment.
