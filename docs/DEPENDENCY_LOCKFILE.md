# Reproducible dependency installation

The repository uses npm workspaces. A committed root `package-lock.json` is required before CI can use `npm ci`.

## Generate the lockfile through GitHub Actions

1. Open the repository's **Actions** tab.
2. Select **Generate reproducible npm lockfile**.
3. Choose **Run workflow** on the default branch.
4. Wait for the workflow to resolve the complete workspace dependency graph, run a clean `npm ci`, and generate Prisma Client.
5. Review the automatically opened pull request. Confirm that package manifests are unchanged, the lockfile is present, and CI uses `npm ci`.
6. Merge only after the standard CI and dependency-review checks pass.

The workflow uses Node.js 22 for lockfile generation, creates a reviewable pull request, and does not deploy the application. If npm resolution, clean installation, or Prisma generation fails, the workflow stops before opening the pull request.

## Local verification after merge

```bash
npm ci
npm run db:generate
npm run typecheck
npm run build
npm test
```

A lockfile is considered reproducible only after a clean install from the committed lockfile succeeds. Merely generating or committing the file is not a passing build or test result.
