# Data Quality and Lineage

## Quality endpoints

All endpoints require an authenticated session, an active organization membership and the `x-organization-id` header. Rule creation and execution require OWNER, ADMIN, DATA_STEWARD or DATA_ENGINEER. Read endpoints are available to workspace members.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/quality/assets/:assetId/rules` | List all rule versions |
| POST | `/api/quality/assets/:assetId/rules` | Create a new version of a named rule |
| POST | `/api/quality/assets/:assetId/runs` | Execute active rules and persist results |
| GET | `/api/quality/assets/:assetId/runs` | Read latest 20 execution records |
| POST | `/api/quality/lineage` | Create an upstream → downstream dependency |
| GET | `/api/quality/assets/:assetId/lineage` | Read immediate lineage and downstream impact |

## Rule types

- `MIN_ROW_COUNT`: requires `params.minimum`.
- `COLUMN_EXISTS`: requires `params.column`.
- `NOT_NULL`: requires `params.column`.
- `MAX_NULL_PERCENT`: requires `params.column` and `params.maxPercent` (0–100).
- `UNIQUE`: requires `params.column`; compares distinct and non-null counts from import-time aggregates.

Example:

```json
{
  "name": "Order ID uniqueness",
  "ruleType": "UNIQUE",
  "params": { "column": "order_id" }
}
```

Creating a rule with an existing name deactivates its previous active version and increments the version number. Historical rule versions and quality runs remain stored. A run's score is passed checks divided by evaluated (passed + failed) checks. Skipped checks are excluded; a run with no evaluated checks has a null score.

## Data limitations

For CSV/JSON imports, the catalog stores schema plus aggregate per-column counts (null, non-null and distinct) and does not persist raw imported rows. The current deterministic engine can evaluate row count, schema presence, null counts/rates and uniqueness from these aggregates. It cannot evaluate arbitrary expressions, value ranges, referential integrity, freshness or live PostgreSQL contents yet. Those checks must not be interpreted as passed; unsupported or unavailable statistics are marked SKIPPED.

## Lineage and impact

An edge records an upstream dataset and a downstream dataset. Both must belong to the active organization. Self-links and cycles are rejected. Impact analysis traverses downstream edges and returns up to 500 impacted assets; the graph query reads at most 5,000 edges per request. This is a manually maintained metadata graph, not automatic SQL query lineage.

## Operational notes

Database schema changes require generating and applying a Prisma migration before using these endpoints. Integration tests are authored but have not yet been executed in this repository environment.
