# Authentication and Organization API

Base URL: `http://localhost:4000`

All request and response bodies use JSON. The API sets an HttpOnly `vg_session` cookie after successful registration or login. Browser clients must send credentials on cross-origin requests and use the exact configured `WEB_ORIGIN`.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/auth/register` | Create a user, organization and OWNER membership |
| POST | `/api/auth/login` | Verify credentials and issue a session |
| POST | `/api/auth/logout` | Revoke the current session and clear its cookie |
| POST | `/api/auth/sessions/rotate` | Atomically revoke the current session and issue a replacement |
| GET | `/api/auth/me` | Return the current user and active organization memberships |
| GET | `/api/organizations` | List organizations the current user belongs to |
| GET | `/api/organizations/current` | Resolve the selected organization context |
| GET | `/api/organizations/current/admin-check` | Example OWNER/ADMIN protected route |
| GET | `/api/health` | API health status |

## Register

```http
POST /api/auth/register
Content-Type: application/json

{
  "organizationName": "Northstar Analytics",
  "displayName": "Avery Morgan",
  "email": "avery@example.com",
  "password": "a-long-unique-password"
}
```

Password length must be between 12 and 128 characters. Successful registration returns HTTP 201 and sets the session cookie. User, organization and OWNER membership creation is one database transaction.

## Sign in

```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "avery@example.com",
  "password": "a-long-unique-password"
}
```

A failed email/password combination returns the same generic authentication error. Registration and login are rate-limited to 10 requests per 15 minutes per client IP.

## Authenticated organization context

First call `GET /api/auth/me` and choose one of the returned active memberships. For tenant-aware routes, send its organization ID in the `x-organization-id` header:

```http
GET /api/organizations/current
Cookie: vg_session=<browser-managed>
x-organization-id: <organization-id>
```

The API verifies that the authenticated user is a member of the requested organization and that the organization is active. The header selects a tenant; it does not grant access. Never use a client-provided organization ID in a database query without this membership check.

## Browser fetch example

```ts
const response = await fetch("http://localhost:4000/api/auth/me", {
  credentials: "include",
});
```

For local development, configure the web app's API proxy or call the API origin directly with `credentials: "include"`. In production, use HTTPS and configure the web/API origins and cookie policy for the actual hosting topology.

## Session model

The browser receives a cryptographically random opaque token in an HttpOnly cookie. PostgreSQL stores only its SHA-256 hash. Sessions expire after seven days. Logout revokes the current session; rotation revokes the current session and creates its replacement in one transaction. Access tokens are never returned to JavaScript or stored in localStorage.

## Error envelope

Errors use a stable top-level shape:

```json
{
  "error": {
    "code": "UNAUTHENTICATED",
    "message": "Please sign in to continue."
  }
}
```

Common status codes: 400 validation/context input, 401 missing or invalid session, 403 membership/role denial, 409 uniqueness conflict, 429 authentication rate limit, and 500 unexpected server error.

## Before deployment

Run dependency installation, Prisma client generation, database migration, API/web typechecks, production builds and automated integration tests. Those checks have not been run as part of this repository update. Add email verification, password recovery, audit events, session cleanup and a deployment-specific CSRF/threat review before production use.
