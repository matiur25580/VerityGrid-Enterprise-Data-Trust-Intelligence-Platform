# Reliability and Intelligence API

Phase 6 adds freshness objectives, operational analytics, bounded exports, evidence-linked operational recommendations and approval-gated classification changes.

## Freshness and SLA

- `GET /api/reliability/freshness` — evaluates up to 500 tenant assets against their configured freshness policy.
- `POST /api/reliability/freshness/policies` — create or update an asset policy; requires OWNER, ADMIN, DATA_STEWARD or DATA_ENGINEER.
- `targetMinutes` must be 5–525,600; `warnAtPercent` defaults to 80 and is bounded from 10–95.
- Successful CSV/JSON imports set `DataAsset.lastObservedAt`. Manual catalog records and legacy assets remain UNKNOWN until an observation is recorded. Registering a PostgreSQL source does not establish a live connection or observation.
- States: HEALTHY, AT_RISK, BREACHED, UNKNOWN (no observation) and UNCONFIGURED (no policy).

Freshness is evaluated on read and by a BullMQ scheduled worker. The worker runs every five minutes by default (override with `FRESHNESS_SCHEDULE_INTERVAL_MS`, minimum 60 seconds), scans policies in bounded pages of 500, and creates one tenant-scoped incident per asset when it becomes at-risk or breached. State changes (including recovery to RESOLVED and later recurrence) are recorded in incident events and audit events. Repeated scheduler ticks are idempotent: unchanged states do not create duplicate incidents or events. Unknown observation timestamps do not create incidents.

The worker process (`npm run worker` or `npm run worker:dev`) must run alongside the API and requires Redis plus the configured database. The default system actor is a reserved UUID used for worker-authored audit and incident events.


## Incident notification delivery

- Configure optional `INCIDENT_WEBHOOK_URL` with a trusted HTTPS endpoint to enable outbound incident alerts. Leave it empty to keep delivery disabled. Optional `INCIDENT_WEBHOOK_TOKEN` is sent as a Bearer token; never commit real credentials.
- The webhook receives a JSON event with `event`, `eventKey`, `organizationId`, `incidentId`, `severity` and `occurredAt`. The request includes an `idempotency-key` header; receivers should deduplicate on this value.
- Webhook URLs must use HTTPS, have no embedded credentials, and use a public DNS hostname (IP literals and local hostnames are rejected). Requests time out after 8 seconds. Do not point this setting at an untrusted endpoint.
- Notification jobs are queued in BullMQ with six exponential-backoff attempts. Failed jobs are retained for up to 30 days (with a 10,000-job cap) for investigation; the worker logs job identifiers and bounded error codes, never webhook tokens or response bodies. Delivery is at-least-once: webhook receivers should honor the idempotency key.
- The Operations Center exposes tenant-scoped delivery status at `GET /api/operations/notification-deliveries`; OWNER/ADMIN can retry a failed job with `POST /api/operations/notification-deliveries/:jobId/retry`. Retry actions are audited.
- Run the worker process to deliver notifications. Without a configured webhook, incidents and audit records still work and outbound delivery remains disabled. Live delivery has not been verified until a real endpoint and credentials are configured.

## Historical trends

- `GET /api/reliability/analytics/trends?days=30` — tenant-scoped daily series for 7–90 days.
- Includes quality run counts, failed-run counts, mean scored quality, incident creation counts and high-severity incidents.
- The scheduled freshness worker upserts one `FreshnessSnapshot` per asset per UTC day; trend responses include healthy, at-risk, breached and unknown counts. Repeated worker ticks update that day's snapshot rather than growing unbounded rows.
- Snapshot history starts when the migration is applied and the worker begins running; prior dates are not fabricated or backfilled.
- The endpoint fills dates with zero activity and returns persisted-record data only.

## Analytics and exports

- `GET /api/reliability/analytics` — tenant-scoped asset/run counts, average persisted quality score, incident status counts and freshness aggregates.
- `GET /api/reliability/exports?type=quality-runs`
- `GET /api/reliability/exports?type=freshness`

Exports are CSV, limited to the latest 1,000 rows, and include identifiers, timestamps, scores and operational statuses only. Imported records and raw data are not exported. Cells beginning with spreadsheet formula prefixes (including prefixes after whitespace) are neutralized before quoting to reduce CSV formula-injection risk.

## Evidence-grounded assistant

- `GET /api/reliability/assistant/insights`

Returns deterministic recommendations derived from the latest 20 quality runs, up to 20 active incidents and up to 500 assets. Each insight references evidence IDs with supporting persisted facts. Mode is `evidence-rules-v1`; this is not a generative AI/model integration and it does not take actions.

## Human approval for classification changes

1. Create a `CLASSIFICATION_CHANGE` governance policy with `requiresApproval: true`.
2. Submit `POST /api/reliability/actions/classification` with `assetId`, `policyId`, target `classification` and a business `reason`. The action remains PENDING; no asset changes.
3. A different OWNER/ADMIN decides through `PATCH /api/operations/approvals/:approvalId`.
4. An OWNER/ADMIN invokes `POST /api/reliability/actions/:approvalId/execute`. Execution verifies approval state, tenant, action payload and the original classification, then updates the asset and writes an audit event transactionally.

Supported action: SET_CLASSIFICATION only. Stale, rejected, pending, malformed or previously executed approvals cannot be applied.

## Migration and verification

Apply migration `20261122100000_reliability_intelligence` and then `20261122130000_freshness_history` after the existing migrations. Run `npm run db:generate`, `npm run db:migrate`, `npm run typecheck`, `npm run build` and `npm test` locally. Runtime verification against PostgreSQL and Redis remains necessary.
