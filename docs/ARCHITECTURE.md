# Architecture

## System boundaries
VerityGrid is a modular monolith with independently runnable API and web applications plus a separately runnable BullMQ validation worker.

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
    +---- Redis (BullMQ queues, retries and dead-letter retention)
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
The repository includes authentication and tenant enforcement, data catalog and aggregate profiling, quality validation and lineage, background operations and governance, freshness/SLA evaluation, persisted-record analytics, evidence-rule recommendations and approval-gated classification changes. CSV exports neutralize spreadsheet formula prefixes and are bounded to recent rows. Runtime verification, periodic SLA scheduling, external notification delivery, live PostgreSQL source introspection and generative AI integration remain outside the verified implementation boundary.

## Operations and governance (Phase 5)
The API enqueues tenant-tagged quality jobs in Redis/BullMQ. A separate worker process executes the same supported aggregate-backed rule families, retries transient failures with exponential backoff, limits concurrency, and retains terminal failures in a dead-letter queue. API reads always filter job payloads by the authenticated workspace. Incidents carry lifecycle state and append-only event records; governance policies produce approval requests with a one-way decision transition. Audit events are created for key actions and exposed read-only to workspace administrators. Notification delivery is represented by a provider interface and remains disabled until a real provider and recipient policy are configured.

## Reliability and intelligence (Phase 6)
Data imports record an observation timestamp; they do not store source rows. Tenant-scoped freshness policies compare that timestamp with a configured age target and calculate healthy, at-risk, breached or unknown states at read time. Analytics are aggregates over persisted quality runs, incidents and freshness policies. CSV exports are bounded and contain operational metadata, not imported row content.

The operational assistant currently uses deterministic evidence rules over persisted quality runs, open incidents and freshness evaluations. Every recommendation includes evidence identifiers and supporting facts. It is intentionally labelled as rules-based rather than generative AI; no model provider, external inference or unverified claim is involved.

Consequential classification changes are represented as typed approval requests. A different workspace administrator must approve; a separate execution endpoint then checks the asset still has the originally approved classification, applies the change transactionally and records an audit event. Rejected, pending or already executed requests cannot be applied.
