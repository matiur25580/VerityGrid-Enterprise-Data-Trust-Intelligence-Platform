# VerityGrid dashboard screenshot capture plan

The README gallery uses a **single-column layout**: one 16:9 (or full-page where necessary) screenshot per section, followed immediately by its caption. Capture the real running React application at a consistent desktop viewport (recommended 1440 × 900), with browser chrome hidden and no personal or production data visible.

## Capture requirements

- Use a running build of the current commit, not a design mockup.
- Sign in with a dedicated demonstration workspace and synthetic sample data.
- Keep the same workspace, viewport, theme and browser zoom across all captures.
- Show genuine UI states and actual values. Never edit numbers into the images or imply seeded sample data is customer telemetry.
- Redact email addresses, tokens, organization identifiers, connection strings and other secrets.
- Export optimized PNG or WebP files. Preserve a lossless original for review.
- Verify all screenshots correspond to the final UI before adding image links to the root README.

## The 12 planned captures

1. **Executive workspace overview** — A single glance at the data estate, quality posture, operational activity and the next action for a data leader. File: `01-executive-overview.png`.
2. **Data catalog and discovery** — Searchable assets, ownership, source metadata and classification, illustrating how teams establish a shared inventory. File: `02-data-catalog.png`.
3. **Dataset profile and schema** — Field-level schema and profiling evidence, making data structure and completeness understandable to engineers and stewards. File: `03-dataset-profile.png`.
4. **Quality rule management** — Versioned validation expectations and active rules, showing how teams codify data contracts. File: `04-quality-rules.png`.
5. **Quality execution results** — A persisted validation run with pass, fail and skipped evidence, making quality outcomes explainable. File: `05-quality-results.png`.
6. **Lineage and impact analysis** — Upstream/downstream relationships and bounded impact results, demonstrating change-awareness across the data estate. File: `06-lineage-impact.png`.
7. **Background processing operations** — Queue state, retries and dead-letter visibility, emphasizing resilient asynchronous execution. File: `07-processing-operations.png`.
8. **Incident response workspace** — Incident severity, lifecycle, assignment and event history, showing an actionable operational workflow. File: `08-incident-response.png`.
9. **Governance and approvals** — Policy configuration, independent approval decisions and traceability for consequential changes. File: `09-governance-approvals.png`.
10. **Freshness and SLA monitoring** — Configured freshness objectives and healthy/at-risk/breached states, connecting timeliness to operational accountability. File: `10-freshness-sla.png`.
11. **Reliability trends and insights** — Historical quality, incident and freshness trends alongside evidence-linked recommendations. File: `11-reliability-trends.png`.
12. **Notification delivery and auditability** — Webhook delivery state, retry controls and audit evidence, closing the loop from detection to response. File: `12-notifications-audit.png`.

## Final gallery paths

Store the verified captures in this directory. The root README should embed each file in numeric order with a descriptive alt text and the matching caption. Do not add empty placeholder images or substitute generated illustrations for screenshots.
