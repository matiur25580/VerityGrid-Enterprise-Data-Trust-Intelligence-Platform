# VerityGrid dashboard screenshot capture guide

The root README publishes a **single-column gallery**: one genuine dashboard screenshot per row, followed by its descriptive caption. Capture at a consistent 1440 × 1000 viewport with browser chrome hidden. The Playwright script saves full-page PNGs in this directory.

## Capture command

Install Playwright locally without changing the committed workspace manifests, install Chromium, and run the capture script against a running app:

```bash
npm install --no-save playwright
npx playwright install chromium
export SHOWCASE_BASE_URL=http://localhost:5173
export SHOWCASE_EMAIL=demo-admin@example.test
export SHOWCASE_PASSWORD='your-local-demo-password'
node scripts/capture-showcase.mjs
```

Use a dedicated synthetic demo tenant and credentials. The script signs in, navigates the live React application, and writes all twelve PNGs into `docs/screenshots/`. It does not fabricate screenshots or overlay metrics.

## Capture requirements

- Capture the current running application, never a design mockup or generated illustration.
- Use a synthetic demo workspace with representative but clearly non-customer data.
- Keep workspace, viewport, theme and browser zoom consistent across all captures.
- Ensure each screenshot shows a real page or panel that exists in the application.
- Do not edit values into images or imply seeded sample data is customer telemetry.
- Hide or redact personal email addresses, tokens, organization identifiers, connection strings and secrets before publishing.
- Review all twelve images at full resolution before adding them to the root README.
- If a panel is empty, retain the truthful empty state rather than inventing operational activity.

## The 12 planned captures

1. **Executive command center** — Workspace-level data trust overview and onboarding priorities. File: `01-executive-overview.png`.
2. **Data catalog and discovery** — Dataset inventory, source registry, ownership and classification. File: `02-data-catalog.png`.
3. **Data contract registry** — Versioned schema expectations and compatibility evidence. File: `03-data-contracts.png`.
4. **Lineage and impact analysis** — Selected dataset, upstream/downstream dependencies and reachable impact. File: `04-data-lineage.png`.
5. **Quality center** — Validation rules, recorded runs and field-level results. File: `05-quality-center.png`.
6. **Incident response** — Severity, incident lifecycle and operational event history. File: `06-incident-response.png`.
7. **Governance approvals** — Policy configuration, approval requests and decision history from the Operations workspace. File: `07-governance-approvals.png`.
8. **Notification delivery** — Webhook configuration state, delivery counts and retry history. File: `08-notification-deliveries.png`.
9. **Reliability overview** — Asset, quality, and freshness indicators. File: `09-reliability-overview.png`.
10. **Reliability trends** — Daily quality, incident and freshness history. File: `10-reliability-trends.png`.
11. **Freshness and SLA monitor** — Configured targets and healthy/at-risk/breached freshness states. File: `11-freshness-sla.png`.
12. **Evidence-grounded insights** — Deterministic recommendations linked to persisted evidence, with the rule-based mode clearly visible. File: `12-evidence-insights.png`.

## Final gallery checklist

- [ ] All twelve PNG files exist and open successfully.
- [ ] Images are ordered 01–12 and match the root README captions.
- [ ] Each image is a real capture from the current application.
- [ ] No credentials, personal information or production tenant data are visible.
- [ ] Empty or disabled states are described honestly.
- [ ] Gallery uses one image per row with descriptive alt text and a short caption.

The screenshots remain **pending** until the capture command has been run against an authenticated demo instance and the resulting images have been reviewed and committed.
