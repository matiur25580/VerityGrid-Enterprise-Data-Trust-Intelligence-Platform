# Reliability and Intelligence API

Phase 6 adds freshness objectives, operational analytics, bounded exports, evidence-linked operational recommendations and approval-gated classification changes.

## Freshness and SLA

- `GET /api/reliability/freshness` — evaluates up to 500 tenant assets against their configured freshness policy.
- `POST /api/reliability/freshness/policies` — create or update an asset policy; requires OWNER, ADMIN, DATA_STEWARD or DATA_ENGINEER.
- `targetMinutes` must be 5–525,600; `warnAtPercent` defaults to 80 and is bounded from 10–95.
- Successful CSV/JSON imports set `DataAsset.lastObservedAt`. Manual catalog records and legacy assets remain UNKNOWN until an observation is recorded. Registering a PostgreSQL source does not establish a live connection or observation.
- States: HEALTHY, AT_RISK, BREACHED, UNKNOWN (no observation) and UNCONFIGURED (no policy).

Freshness is evaluated on read. This milestone does not run a periodic scheduler or send breach notifications; those are future work.

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

Apply migration `20261122100000_reliability_intelligence` after the existing migrations. Run `npm run db:generate`, `npm run db:migrate`, `npm run typecheck`, `npm run build` and `npm test` locally. Runtime verification against PostgreSQL and Redis remains necessary.
