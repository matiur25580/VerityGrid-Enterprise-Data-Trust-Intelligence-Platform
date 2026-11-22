# Architecture

## System boundaries
VerityGrid starts as a modular monolith with independently runnable API and web applications. Background workers will be introduced as a separate process when ingestion and rule execution are implemented.

```text
React SPA (Vite)
    |
    | HTTPS / JSON
    v
Express API
    |-- Identity and tenant context
    |-- Catalog and connector services
    |-- Quality and lineage domains
    |-- Governance and incident domains
    |
    +---- PostgreSQL (system of record)
    |
    +---- Redis (queues/cache; worker phase)
             |
             +---- Background worker processes
```

## Architectural rules
1. The API is the trust boundary. Browser-provided organization identifiers are never sufficient authorization.
2. Every tenant-owned query must be scoped using a verified membership context.
3. PostgreSQL is the source of truth for business state.
4. Long-running ingestion and validation execute asynchronously.
5. External side effects should use idempotency keys and a transactional outbox where delivery guarantees matter.
6. AI-generated recommendations are advisory and must retain provenance.
7. Domain modules own their validation, authorization, persistence and tests.

## Initial domains
- Identity and organizations
- Data catalog
- Data ingestion
- Data quality
- Data lineage
- Governance
- Incident management
- Reliability and SLA
- Audit and integrations

## Current implementation boundary
The initial repository foundation includes the React shell, Express health endpoint, local PostgreSQL/Redis services and the first Prisma entities. Authentication, tenant enforcement, catalog workflows and all subsequent modules remain development work until implemented and tested.

## Operations and governance (Phase 5)
The API enqueues tenant-tagged quality jobs in Redis/BullMQ. A separate worker process executes the same supported aggregate-backed rule families, retries transient failures with exponential backoff, limits concurrency, and retains terminal failures in a dead-letter queue. API reads always filter job payloads by the authenticated workspace. Incidents carry lifecycle state and append-only event records; governance policies produce approval requests with a one-way decision transition. Audit events are created for key actions and exposed read-only to workspace administrators. Notification delivery is represented by a provider interface and remains disabled until a real provider and recipient policy are configured.
