/**
 * UI runtime QA (master prompt Phase 17/18): real Chromium against the built
 * dashboard + live control plane. Asserts pages load without console errors
 * and render expected content. Requires PLAYWRIGHT_UI_KEY env (API key).
 *
 * Usage: node scripts/ui-test.mjs [baseUrl] [apiKey]
 */
import { chromium } from "playwright";
import { loadEnvFile } from "./lib/env.mjs";

loadEnvFile();
const base = process.argv[2] ?? "http://127.0.0.1:5173";
const key = process.argv[3] ?? process.env.PLAYWRIGHT_UI_KEY ?? process.env.ADMIN_BOOTSTRAP_KEY;

if (!key) {
  console.error("usage: node scripts/ui-test.mjs <baseUrl> <apiKey>");
  process.exit(1);
}

const results = [];
let pass = 0;
let fail = 0;

async function checkPage(browser, path, expectText, label) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const consoleErrors = [];
  const badResponses = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (e) => consoleErrors.push(String(e)));
  page.on("response", (res) => {
    if (res.status() >= 400 && !/favicon/.test(res.url())) badResponses.push(`${res.status()} ${res.url()}`);
  });

  // authenticate via localStorage AFTER reaching the app's origin
  await page.goto(base + "/", { waitUntil: "domcontentloaded", timeout: 20000 });
  await page.evaluate((k) => localStorage.setItem("agencyos.apiKey", k), key);
  try {
    await page.goto(base + path, { waitUntil: "networkidle", timeout: 15000 });
  } catch {
    // SSE keeps connections open; give SPA time to render after load
    await page.waitForTimeout(1500);
  }
  const body = (await page.textContent("body")) ?? "";
  const hasExpected = body.toLowerCase().includes(expectText.toLowerCase());
  const relevantErrors = consoleErrors.filter(
    (e) => !/net::ERR_ABORTED|Failed to load resource.*401|favicon/i.test(e)
  );
  const ok = hasExpected && relevantErrors.length === 0 && badResponses.length === 0;
  if (ok) pass++; else fail++;
  results.push({
    label,
    path,
    rendered: hasExpected,
    consoleErrors: relevantErrors.slice(0, 3),
    badResponses: badResponses.slice(0, 3),
    status: ok ? "PASS" : "FAIL",
  });
  await context.close();
}

const browser = await chromium.launch();
try {
  await checkPage(browser, "/", "mission control", "Overview");
  await checkPage(browser, "/projects", "projects", "Projects");
  await checkPage(browser, "/agents", "agent fleet", "Agents");
  await checkPage(browser, "/models", "models & cost governance", "Models & Cost");
  await checkPage(browser, "/audit", "audit log", "Audit");
  await checkPage(browser, "/approvals", "approval gates", "Approvals");
} finally {
  await browser.close();
}

console.log(JSON.stringify({ event: "ui_qa_complete", pass, fail, results }, null, 2));
process.exit(fail > 0 ? 1 : 0);
