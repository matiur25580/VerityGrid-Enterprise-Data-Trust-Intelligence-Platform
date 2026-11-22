# Data Catalog

## Scope

Phase 3 introduces an organization-scoped source registry and dataset catalog. Every catalog endpoint requires an authenticated session and a valid `x-organization-id` membership. The server derives the tenant from verified membership; request payloads cannot choose an organization.

## Endpoints

All routes are under `/api/catalog`.

| Method | Path | Purpose |
|---|---|---|
| GET | `/sources` | List sources in the active organization |
| POST | `/sources` | Register a PostgreSQL, CSV or JSON source |
| GET | `/assets?q=&classification=&sourceId=` | Search and filter catalog assets (maximum 100 results) |
| POST | `/assets` | Create dataset metadata and schema |
| POST | `/assets/import` | Import CSV/JSON text and discover schema |

Source and asset creation/import requires OWNER, ADMIN, DATA_STEWARD or DATA_ENGINEER. Read access is available to any active organization member.

## CSV/JSON import contract

Send JSON with:

```json
{
  "name": "orders",
  "format": "CSV",
  "content": "order_id,total\n1001,42.50",
  "ownerName": "Data Operations",
  "classification": "INTERNAL"
}
```

For JSON, `content` must be a non-empty array of objects. Imports are limited to 900 KB of text, 10,000 records and 500 fields. CSV requires unique, non-empty headers and consistent row widths. The API infers basic NUMBER, BOOLEAN, DATETIME and STRING types and records nullable fields. A small sample of up to five rows is stored as metadata to support future preview features.

The current import endpoint accepts file contents as a JSON request field; the web UI reads a selected local CSV/JSON file and submits its text. Large-file streaming, object storage, malware scanning, advanced CSV dialects and background ingestion are not part of this milestone.

## Security and data handling

- All database reads and writes include the verified organization ID.
- A source ID supplied during dataset creation/import is checked against the current organization.
- Connection credentials are deliberately not accepted or stored by this source registry. PostgreSQL sources are metadata registrations only until a later connection-validation milestone.
- Classification is metadata, not an enforcement boundary or compliance certification.
- Imported samples may contain sensitive business data. Use synthetic/non-sensitive sample files until retention, masking and data-at-rest controls are reviewed.
