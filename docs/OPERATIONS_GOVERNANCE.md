# Operations and Governance API

Phase 5 adds a separately run BullMQ worker and tenant-scoped operations APIs.

## Background quality validation

- `POST /api/operations/quality/:assetId/jobs` — enqueue a validation job. Requires a workspace writer role and a caller-provided idempotency `requestKey`.
- `GET /api/operations/jobs` — list recent jobs belonging to the selected workspace.
- `GET /api/operations/jobs/:jobId` — inspect a job after verifying its organization in the job payload.
- `GET /api/operations/dead-letters` — inspect terminal failures belonging to the workspace.

Jobs use Redis/BullMQ, four attempts by default, exponential backoff starting at two seconds, and a worker concurrency setting clamped to 1–32 (default 4). Failed jobs are retained; terminal failures are copied to a separate dead-letter queue. Database unique keys make quality-run and worker-generated incident/event/audit effects idempotent across retries. Job payloads contain IDs only; raw imported rows and secrets are never logged.

Run the worker separately from the API:

```bash
npm run worker:dev
```

Set `REDIS_URL` and optionally `QUALITY_WORKER_CONCURRENCY` in the API environment.

## Incidents

- `GET /api/operations/incidents`
- `POST /api/operations/incidents`
- `PATCH /api/operations/incidents/:incidentId`

Incident lifecycle: OPEN → ACKNOWLEDGED → RESOLVED → CLOSED. Updates require an event detail and append a history row. Assignees must be members of the selected organization; pass `assigneeId` in the incident PATCH body to assign or `null` to unassign. Lifecycle transitions are validated by the API. Quality failures create incidents automatically.

## Governance and audit

- `GET /api/operations/policies`
- `POST /api/operations/policies` — OWNER/ADMIN only.
- `POST /api/operations/policies/:policyId/approvals`
- `PATCH /api/operations/approvals/:approvalId` — OWNER/ADMIN only; requesters cannot approve their own requests.
- `GET /api/operations/audit` — OWNER/ADMIN only.

Audit events are append-only through the application API; no update/delete endpoint is exposed. Database-level immutability still requires production database permissions or triggers.

## Notifications and known limitations

A `NotificationProvider` interface is called when an incident is created. The default provider is deliberately disabled and reports no delivery; configure a real provider and recipient/consent policy before relying on notifications. This milestone does not claim email, SMS, Slack, or webhook delivery.

The worker currently executes the five existing aggregate-backed quality rule types. It does not connect to registered PostgreSQL sources or execute arbitrary SQL. Queue visibility is bounded to recent retained jobs; Redis retention and operational backup policies must be configured for production.

## Migration and verification

The migration is `20261122090000_phase5_operations_governance`. Run `npm install`, `npm run db:generate`, `npm run db:migrate`, `npm run typecheck`, `npm run build`, and `npm test` locally. This repository change was not built, tested, migrated against a live database, or deployed during implementation.
