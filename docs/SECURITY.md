# Security Baseline

This document records the intended security baseline. It is not a certification or a claim that all controls are already implemented.

## Required controls
- Hash passwords with a modern password-hashing algorithm; never store plaintext passwords.
- Use short-lived access credentials and revocable, rotating refresh sessions.
- Derive tenant context from authenticated membership, never from an untrusted request body.
- Apply authorization in the API for every tenant-owned resource.
- Validate request bodies, query parameters and path parameters at the boundary.
- Apply request-size limits, rate limits and secure HTTP headers.
- Keep secrets in environment variables or a managed secret store; never commit real credentials.
- Encrypt transport in production and protect database/object-storage backups.
- Store sensitive connector credentials encrypted with managed key material.
- Avoid logging passwords, tokens, raw sensitive records or connection strings.
- Record privileged actions in append-only audit events.
- Apply least privilege to database users, workers and integrations.

## Local-only credentials
The credentials in the Compose file and environment example are intentionally local-development defaults. Replace them before any shared or deployed environment. Do not expose the local database or Redis ports to the public internet.

## Data handling
Use synthetic or explicitly authorized sample datasets for development. Data import must enforce file-size limits, supported formats, safe parsing, and tenant ownership. Production connector access requires explicit user authorization and narrowly scoped credentials.
