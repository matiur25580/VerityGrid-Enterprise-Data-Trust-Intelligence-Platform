# Data Contract Registry

The Data Contract Registry makes a dataset's expected schema explicit, versioned and reviewable. It is intended for data producers and consumers who need to detect breaking schema changes before they cause downstream failures.

## Current capability

- Create a versioned contract against a tenant-owned data asset.
- Store an immutable schema snapshot at contract creation.
- Assign an accountable contract owner and document consumer expectations.
- Select a compatibility policy:
  - **BACKWARD**: additive fields are warnings; removal, type changes and nullable broadening are breaking.
  - **STRICT**: any additive field is also breaking.
- Activate or retire contract versions.
- Evaluate an active contract against the asset's latest discovered schema.
- Persist compatibility outcomes and field-level drift evidence.
- Audit contract creation, activation/retirement and evaluation.

## API

All routes are under `/api/contracts`. Requests require an authenticated session, a verified tenant context (the selected workspace header) and a writer role for mutations.

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/assets/:assetId` | List contract versions and recent evaluations for an asset |
| POST | `/assets/:assetId` | Create a draft contract from the asset's current schema |
| PATCH | `/:contractId/status` | Activate or retire a contract |
| POST | `/:contractId/evaluate` | Evaluate the active contract against the current asset schema |

### Create a contract

```http
POST /api/contracts/assets/{assetId}
Content-Type: application/json
```

```json
{
  "name": "Customer profile contract",
  "description": "Required fields and compatibility expectations for customer profile consumers.",
  "ownerName": "Customer Data Product",
  "compatibilityMode": "BACKWARD"
}
```

The API snapshots the current `DataAsset.schema` and assigns the next version number within the organization and asset. The contract starts in `DRAFT`.

### Activate and evaluate

```http
PATCH /api/contracts/{contractId}/status
Content-Type: application/json

{ "status": "ACTIVE" }
```

Then evaluate:

```http
POST /api/contracts/{contractId}/evaluate
Content-Type: application/json

{}
```

The evaluation response contains a status (`COMPATIBLE`, `WARNING`, or `INCOMPATIBLE`) and a list of field-level drift findings.

## Compatibility semantics

| Drift | BACKWARD | STRICT |
| --- | --- | --- |
| Expected field removed | Breaking | Breaking |
| Field type changed | Breaking | Breaking |
| Non-nullable field becomes nullable | Breaking | Breaking |
| Additional field | Warning | Breaking |
| No schema drift | Compatible | Compatible |

The evaluator intentionally uses deterministic rules and records its result. It does not infer semantic equivalence between unrelated types.

## Important boundaries

- Evaluations are explicitly triggered through the API/UI; they are not yet an automatic ingestion gate.
- The contract registry currently snapshots the asset's discovered schema; live external database introspection is not included.
- Consumer registration, contract negotiation, asynchronous drift alerts and automated producer enforcement are future increments.
- The feature branch implementation must pass Prisma migration, typecheck, build, API and compatibility tests before it is considered merged or production-ready.
