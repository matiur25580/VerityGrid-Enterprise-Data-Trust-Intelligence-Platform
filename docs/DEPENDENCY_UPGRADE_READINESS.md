# Dependency Upgrade Readiness Plan

## Purpose

This plan tracks the open grouped Dependabot updates in PRs [#12](https://github.com/matiur25580/VerityGrid-Enterprise-Data-Trust-Intelligence-Platform/pull/12) and [#13](https://github.com/matiur25580/VerityGrid-Enterprise-Data-Trust-Intelligence-Platform/pull/13). These pull requests must not be merged as a single blind dependency refresh: they combine multiple major-version transitions across the API, web app, build toolchain and ORM.

This document is a migration plan, not a claim that the upgrades have been applied or validated.

## Current upgrade surface

| Area | Current baseline on `main` | Proposed update surface | Compatibility concern |
|---|---|---|---|
| ORM | Prisma CLI/client 6.12.0 | Prisma CLI/client 7.10.1 | Prisma 7 configuration, generated client and migration behavior need an explicit migration review |
| API framework | Express 4.21.x | Express 5.3.x | Express 5 routing, middleware and error propagation behavior |
| Queue runtime | BullMQ 5.x, ioredis 5.x | BullMQ 6.7.x, ioredis 6.x | Queue/Redis client compatibility and worker retry/shutdown behavior |
| Web runtime | React 18.3.x | React 19.3.x | React 19 type/runtime changes and component regression coverage |
| Web build | Vite 6.4.x, React plugin 4.x | Vite 8.3.x, plugin 6.x | Node/toolchain requirements, plugin peer dependencies and build output |
| TypeScript | 5.7.x | 7.0.x in PR #13 | Compiler behavior and project-reference/type-check changes |
| Supporting packages | bcryptjs 2.x, dotenv 16.x, rate-limit 7.x, lucide 0.x | bcryptjs 3.x, dotenv 18.x, rate-limit 8.x, lucide 1.x | ESM/type changes and API behavior changes |

The two Dependabot PRs overlap in the web toolchain and API development dependencies. PR #12 also upgrades several runtime packages. PR #13 additionally changes root TypeScript and the Prisma CLI. Review the combined target state before resolving either PR independently.

## Required migration sequence

1. **Establish a clean baseline**
   - Start from the latest `main`.
   - Preserve the existing lockfile and confirm `npm ci`, typecheck, build and tests pass before changing versions.
   - Record the baseline Node.js 22, 24 and 26 CI results.

2. **Upgrade the ORM as its own migration**
   - Review the official Prisma 7 upgrade guide and configuration requirements.
   - Keep `prisma` and `@prisma/client` on the same exact release.
   - Review schema datasource configuration, generator configuration, environment loading, generated client imports and migration commands.
   - Regenerate the client and verify migrations against an isolated PostgreSQL database.
   - Do not combine an ORM major upgrade with unrelated framework changes in the same first validation step.

3. **Upgrade API runtime packages**
   - Migrate Express 4 to 5 deliberately; inspect route patterns, middleware ordering, async error handling and request/response assumptions.
   - Verify BullMQ and ioredis peer/runtime compatibility together.
   - Run queue retry, idempotency, dead-letter, shutdown and notification-delivery integration tests.
   - Verify bcrypt hash compatibility against existing fixtures and authentication flows.

4. **Upgrade the web runtime and build toolchain**
   - Upgrade React and React DOM together with matching React type packages.
   - Upgrade Vite and `@vitejs/plugin-react` as a compatible pair.
   - Check Node engine requirements and Vitest/Vite peer dependencies.
   - Run the complete frontend test suite and production build.

5. **Upgrade TypeScript last**
   - Move root and workspace TypeScript constraints together.
   - Resolve compiler diagnostics without weakening strictness or suppressing errors.
   - Verify all workspace project references and generated Prisma types.

6. **Regenerate and validate the lockfile**
   - Use a network-enabled, supported Node/npm environment to update the root workspace lockfile from the final manifests.
   - Commit manifest and lockfile changes together.
   - Require a clean `npm ci --no-audit --no-fund`; do not hand-edit lockfile package entries.
   - Run `npm audit --audit-level=high`, `npm run db:generate`, database migrations, `npm run typecheck`, `npm run build` and `npm test`.

7. **Merge only after evidence**
   - Require all CI matrix jobs (Node.js 22, 24 and 26) and CodeQL to pass on the final combined dependency state.
   - Review the resulting diff for unexpected transitive package churn.
   - Merge the validated migration PR; close or supersede the original grouped Dependabot PRs only after the replacement is merged.

## Merge-blocking acceptance criteria

- [ ] Prisma CLI and client versions match exactly and Prisma 7 migration/configuration changes are reviewed.
- [ ] Express 5 API integration tests pass, including error paths and authentication middleware.
- [ ] BullMQ/ioredis worker lifecycle and retry tests pass.
- [ ] React 19 frontend regression tests pass.
- [ ] Vite 8 production build succeeds on supported Node versions.
- [ ] TypeScript 7 typecheck passes without relaxed compiler settings.
- [ ] Root lockfile is generated by npm and clean `npm ci` succeeds.
- [ ] Dependency audit, Node 22/24/26 CI and CodeQL pass.
- [ ] No deployment is performed as part of dependency maintenance.

## Operational note

The repository's CI currently runs Node.js 22, 24 and 26, performs `npm ci`, dependency audit, Prisma generation, PostgreSQL migrations, typecheck, build and integration tests. Keep these checks as mandatory migration gates. If the toolchain upgrade makes one supported Node line incompatible, change the support policy explicitly in a separate reviewed decision rather than silently removing that matrix entry.
