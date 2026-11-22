# Production Readiness and Operations Runbook

This runbook defines the operational controls and verification steps expected before a shared or production deployment. It is an implementation guide, not evidence of a completed production certification.

## 1. Release gates

Before promoting a release:

1. Require pull-request review and passing CI.
2. Review CodeQL findings and dependency update pull requests.
3. Generate Prisma Client and apply all committed migrations to a disposable or staging database.
4. Run API integration tests, web/API typechecks and production builds.
5. Confirm environment variables are present in the target secret manager.
6. Verify API liveness and database readiness endpoints.
7. Confirm worker processes are running and Redis queue depth is stable.
8. Execute an authenticated smoke test using a non-production workspace.
9. Verify backup creation and perform a restore rehearsal into an isolated database.
10. Record release SHA, migration state, operator and rollback decision.

## 2. Health and request correlation

- `GET /api/health` is a liveness probe: it confirms that the API process can answer requests.
- `GET /api/health/ready` is a readiness probe: it checks connectivity to PostgreSQL and returns HTTP 503 when the database is unavailable.
- Each API request receives a server-generated `x-request-id` response header.
- The API emits structured completion logs containing request ID, method, path, status, duration and timestamp. Query strings, request bodies, credentials, cookies and client IP addresses are intentionally excluded.
- Correlate client-reported request IDs with API logs. Forward logs to a managed log platform with access controls and retention policies.

Redis and worker health should be monitored independently using Redis metrics and BullMQ queue state. A healthy API response does not imply that background workers are healthy. The API rate limiter also depends on Redis: set `REDIS_URL` on every API replica, alert on Redis connection errors, and test the configured Redis failover behavior before release.

## 3. PostgreSQL backup

Prerequisites: PostgreSQL client utilities compatible with the database server and access to the target database through `DATABASE_URL`.

```bash
export DATABASE_URL='postgresql://...'
export BACKUP_DIR='./backups'
export BACKUP_RETENTION_DAYS=14
bash scripts/backup-postgres.sh
```

The script:
- writes a PostgreSQL custom-format dump,
- creates a SHA-256 checksum sidecar,
- restricts local file permissions with umask 077,
- prunes old dump and checksum files according to the configured local retention window.

The script does not encrypt backups or upload them off-host. Production operators must store backups in an encrypted, access-controlled, off-site/object-storage location, enable provider-side versioning/retention, and protect encryption keys separately from the backup data. Keep backup credentials least-privileged.

## 4. Restore rehearsal

Use an isolated database, never the live production target, for a rehearsal.

```bash
export DATABASE_URL='postgresql://...'
export BACKUP_FILE='./backups/veritygrid-YYYYMMDDTHHMMSSZ.dump'
export CONFIRM_RESTORE=YES
bash scripts/restore-postgres.sh
```

The restore script requires explicit confirmation and a matching checksum sidecar. `pg_restore --clean --if-exists` is destructive to objects in the target database. Confirm the database name and host before running it. After restore:
- run Prisma migration status,
- run read-only catalog, quality and reliability smoke tests,
- verify row counts and key relationships,
- confirm the application and worker can connect,
- document achieved recovery time and recovery point.

No recovery-time objective (RTO) or recovery-point objective (RPO) is claimed until measured in repeated rehearsals.

## 5. Redis and background workers

Run the API and worker as separate supervised processes. Monitor:
- process restarts and uptime,
- Redis availability and memory,
- waiting, active, delayed and failed jobs,
- dead-letter growth,
- freshness scheduler execution lag,
- notification delivery failures and retry exhaustion.

Set alerts on sustained queue growth and repeated worker crashes. Keep Redis private, authenticated and encrypted in transit where supported. API rate limiting uses atomic Redis counters shared by replicas; Redis is a required dependency for rate-limited routes and must not be exposed publicly. Configure persistence and backups appropriate to the deployment topology; Redis queues are not the system of record for business entities.

## 6. Secrets and environment

- Use a managed secret store; never commit real credentials or copy production secrets into issue comments/logs.
- Rotate database, Redis, webhook and session-related secrets using a documented operator procedure.
- Set `NODE_ENV=production`, a strict `WEB_ORIGIN`, secure cookies and HTTPS at the edge.
- Review trusted proxy settings before enabling proxy-aware rate limiting.
- Use unique credentials per environment and least-privilege database roles.
- Keep outbound notification webhooks on trusted HTTPS endpoints and use receiver-side idempotency.

## 7. Rollback

1. Stop traffic promotion and record the affected release SHA.
2. Determine whether the release applied an additive or destructive migration.
3. Prefer a forward fix for data migrations; do not blindly roll back schema changes.
4. Restore only into a verified target after approval and backup validation.
5. Revert application code to a known-good commit if schema compatibility permits.
6. Verify health, queue processing and tenant-scoped read/write smoke tests.
7. Record the incident, data impact and follow-up actions.

## 8. Known limitations to close before production

- No automated backup upload, encryption/key management or scheduled restore rehearsal is included in this repository.
- No formal RTO/RPO has been established.
- Live notification delivery requires an operator-provided endpoint and credentials.
- PostgreSQL source entries are registry metadata; live external database introspection is not implemented.
- CSV/JSON imports retain profiling aggregates, not raw imported records.
- Freshness history requires the worker and migrations to be active; snapshots do not fabricate historical observations.
- External observability, paging, SLO dashboards and a full distributed tracing backend must be configured for the target environment.
- A full security review, load test and deployment-specific threat model remain required.
