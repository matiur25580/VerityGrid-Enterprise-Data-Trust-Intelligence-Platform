import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const baseURL = process.env.SHOWCASE_BASE_URL;
const email = process.env.SHOWCASE_EMAIL;
const password = process.env.SHOWCASE_PASSWORD;
if (!baseURL || !email || !password) {
  throw new Error("Set SHOWCASE_BASE_URL, SHOWCASE_EMAIL and SHOWCASE_PASSWORD. Use a synthetic demo workspace only.");
}
const output = path.resolve("docs/screenshots");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
page.setDefaultTimeout(20000);

async function capture(name, description) {
  await page.screenshot({ path: path.join(output, name), fullPage: true });
  process.stdout.write(`Captured ${name} — ${description}\n`);
}
async function capturePanel(name, heading, description) {
  const panel = page.locator(".panel").filter({ hasText: heading }).first();
  await panel.waitFor({ state: "visible" });
  await panel.scrollIntoViewIfNeeded();
  await panel.screenshot({ path: path.join(output, name) });
  process.stdout.write(`Captured ${name} — ${description}\n`);
}
async function open(label) {
  await page.getByRole("button", { name: label, exact: true }).click();
  await page.waitForTimeout(600);
}

try {
  await page.goto(baseURL, { waitUntil: "networkidle" });
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.locator("form button[type=submit]").first().click();
  await page.getByRole("heading", { name: /data command center/i }).waitFor();
  await page.waitForTimeout(1000);
  await capture("01-executive-overview.png", "Executive data trust and reliability command center");

  await open("Data Catalog");
  await capture("02-data-catalog.png", "Searchable data inventory, ownership and classification");

  await open("Data Lineage");
  await capture("03-data-lineage.png", "Upstream and downstream lineage with impact context");

  await open("Quality Center");
  await capture("04-quality-center.png", "Versioned validation rules and persisted quality evidence");

  await open("Incidents");
  await capture("05-incident-response.png", "Tenant-scoped incident lifecycle and response operations");
  await capturePanel("06-governance-approvals.png", "Governance policies", "Policy approvals and accountable decision history");
  await capturePanel("07-notification-deliveries.png", "Incident notifications", "Webhook delivery state, retries and delivery evidence");

  await open("Reliability");
  await capture("08-reliability-overview.png", "Reliability posture across freshness and quality");
  await capturePanel("09-reliability-trends.png", "Reliability trends", "Historical quality, incident and freshness trends");
  await capturePanel("10-freshness-sla.png", "Freshness & SLA monitor", "Freshness objectives and healthy, at-risk and breached states");
  await capturePanel("11-operational-analytics.png", "Operational analytics", "Persisted operational measures and bounded exports");
  await capturePanel("12-evidence-insights.png", "Evidence-grounded assistant", "Evidence-linked operational recommendations with traceable facts");
} finally {
  await browser.close();
}
