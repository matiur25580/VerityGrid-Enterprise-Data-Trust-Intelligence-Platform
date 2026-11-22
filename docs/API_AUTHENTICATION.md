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

Password length must be between 12 and 72 characters (and no more than 72 UTF-8 bytes). Successful registration returns HTTP 201 and sets the session cookie. User, organization and OWNER membership creation is one database transaction.

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

The web app uses relative `/api/...` requests and the Vite development proxy, so the browser communicates with one origin locally. For production, prefer a same-site reverse proxy that exposes the API under the web origin. The session cookie is `SameSite=Strict`; a cross-site frontend/API deployment will not work with that cookie policy by merely enabling CORS. If separate sites are required, design and review a `SameSite=None; Secure` cookie plus explicit CSRF protections before changing the cookie policy. Always use HTTPS in production.

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

## Integration tests

Run `npm test` from the repository root after installing dependencies, starting PostgreSQL and applying the Prisma schema. The API integration suite exercises registration, authenticated membership lookup, tenant access denial, role checks, session rotation, logout and login. The suite has been added but has not yet been executed in this environment.

## Web authentication experience

The React client now provides sign-in and workspace-registration screens, checks the existing session on page load, loads the authenticated user and memberships, supports switching between verified organizations, and revokes the session on sign-out. It does not store session tokens in localStorage. The dashboard remains a data-empty shell until catalog and quality APIs are implemented.
