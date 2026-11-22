# VerityGrid
## Enterprise Data Trust, Intelligence & Reliability Platform

VerityGrid is a PERN-stack platform for discovering, validating, monitoring, and governing enterprise data assets. It is designed around a practical data-reliability lifecycle: register a source, catalog its assets, define quality expectations, execute checks, investigate incidents, and preserve an auditable record of decisions.

> **Status:** Foundation, identity/tenant-security API, React authentication experience and Phase 3 data catalog plus Phase 4 quality/lineage implementation are committed. Dependency installation, database migration generation/application, builds and automated tests have not yet been run; do not treat this as deployment-ready.

## Product principles
- **Evidence over decoration:** metrics must come from persisted records and executed checks, never hardcoded claims.
- **Tenant isolation by design:** organization scope is derived from authenticated server context.
- **Human-governed automation:** recommendations and remediation actions require explicit authorization.
- **Operational resilience:** long-running ingestion and validation belong in background workers.
- **Traceability:** important state changes produce attributable audit events.

## Technology
- React + TypeScript + Vite
- Node.js + Express + TypeScript
- PostgreSQL + Prisma
- Redis + BullMQ (planned worker infrastructure)
- Docker Compose for local dependencies
- Vitest, Supertest and Playwright (planned test layers; not yet configured)

## Repository layout
```text
apps/
  api/       Express API and Prisma schema
  web/       React application
packages/
  shared/    Shared contracts and validation (future)
infra/       Local infrastructure and deployment assets
docs/        Architecture and engineering decisions
```

## Local development
Prerequisites: Node.js 20+, npm 10+, Docker Engine/Desktop.

1. Copy environment templates:
   `cp apps/api/.env.example apps/api/.env`
2. Start PostgreSQL and Redis:
   `docker compose up -d postgres redis`
3. Install dependencies:
   `npm install`
4. Generate Prisma Client:
   `npm run db:generate`
5. Apply the development schema:
   `npm run db:migrate`
6. Start both applications:
   `npm run dev`
7. Run API integration tests (requires the migrated local database):
   `npm test`

The API defaults to `http://localhost:4000`; the web application defaults to `http://localhost:5173`.

## Engineering documentation
- [Architecture](docs/ARCHITECTURE.md)
- [Development roadmap](docs/ROADMAP.md)
- [Security baseline](docs/SECURITY.md)
- [Authentication API](docs/API_AUTHENTICATION.md)\n- [Data Catalog API](docs/DATA_CATALOG.md)\n- [Quality & Lineage API](docs/QUALITY_LINEAGE.md)

## Scope note
VerityGrid is an engineering portfolio project, not a certified compliance product or a substitute for specialist legal, privacy, or security advice. Production use requires environment-specific security review, operational configuration, load testing, backups, and deployment verification.
