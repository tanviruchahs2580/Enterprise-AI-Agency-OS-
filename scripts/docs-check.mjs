#!/usr/bin/env node
/**
 * docs-check (self-serve drift gate for docs/artifacts/schema surfaces).
 *
 * Enforces the invariants this repo is repeatedly tripped up by:
 *   1. Version consistency — one source of truth (`src/version.ts`) must agree
 *      with every place that nominates the *current* version (chart, image
 *      tags, README status, CHANGELOG header, metrics/tracing attributes).
 *   2. Roster sync — every agent in the AGENTS.md contract table (the README
 *      truth) must exist in the orchestration AGENT_ROSTER, and vice versa.
 *   3. Skill register sanity — each workflows/skills/*.yaml declares a name
 *      matching its filename (registry idempotency) and is non-empty.
 *
 * Fails (exit 1) on drift; prints what it checked. Wired into `npm run
 * docs-check` + the Makefile; deliberately NOT part of self-test (read-only
 * doc/constants check, not a runtime system check).
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const failures = [];
const ok = (msg) => console.log(`  PASS  ${msg}`);
const FAIL = (msg) => {
  failures.push(msg);
  console.error(`  FAIL  ${msg}`);
};
const SKIP = (msg) => console.log(`  SKIP  ${msg}`);

const versionTs = readFileSync(join(root, "apps", "control-plane", "src", "version.ts"), "utf8");
const m = versionTs.match(/export const AGENCY_OS_VERSION = "([^"]+)";/);
if (!m) {
  FAIL("src/version.ts has no AGENCY_OS_VERSION constant");
  process.exit(1);
}
const VERSION = m[1];
if (!/^\d+\.\d+\.\d+$/.test(VERSION)) {
  FAIL(`AGENCY_OS_VERSION '${VERSION}' is not semver`);
  process.exit(1);
}
ok(`source of truth: ${VERSION}`);

const contains = (label, filePath, needle) => {
  if (!existsSync(filePath)) {
    FAIL(`${label}: missing ${filePath}`);
    return;
  }
  const text = readFileSync(filePath, "utf8");
  if (!text.includes(needle)) FAIL(`${label}: does not reference '${needle}'`);
  else ok(`${label}: references ${VERSION}`);
};

// --- 1. version consistency among files that nominate the CURRENT version ---
contains("Chart.yaml version", join(root, "charts", "agency-os", "Chart.yaml"), `version: ${VERSION}`);
const values = readFileSync(join(root, "charts", "agency-os", "values.yaml"), "utf8");
if (values.includes(`tag: "${VERSION}"`)) ok("values.yaml image tags");
else {
  const stale = values.match(/tag: "([^"]+)"/g) ?? [];
  FAIL(`values.yaml image tags miss ${VERSION} (found ${stale.join(", ") || "none"})`);
}
contains("README status", join(root, "README.md"), `Status: v${VERSION}`);
contains("CHANGELOG header", join(root, "CHANGELOG.md"), `## [${VERSION}]`);
contains("tracing version", join(root, "apps", "control-plane", "src", "tracing.ts"), "AGENCY_OS_TRACING_VERSION = AGENCY_OS_VERSION");

// no stale 0.10.0 anywhere it used to lurk
for (const f of [
  "apps/control-plane/src/app.ts",
  "apps/control-plane/src/metrics.ts",
  "charts/agency-os/Chart.yaml",
  "charts/agency-os/values.yaml",
]) {
  const text = readFileSync(join(root, f), "utf8");
  if (/(0\.10\.0|version:\s*"0\.10\.0")/.test(text) && !f.includes("Chart.yaml")) FAIL(`${f}: stale 0.10.0 remains`);
}
if (values.includes('tag: "0.10.0"')) FAIL("values.yaml: stale 0.10.0 image tag remains");
ok("no stale 0.10.0 in version-bearing files");

// --- 1b. singular constants instead of duplicated literals ------------------
const appTs = readFileSync(join(root, "apps", "control-plane", "src", "app.ts"), "utf8");
if (appTs.includes('AGENCY_OS_VERSION')) ok("app.ts /api/v1/meta reads the shared constant");
else FAIL("app.ts does not import AGENCY_OS_VERSION");
const metricsTs = readFileSync(join(root, "apps", "control-plane", "src", "metrics.ts"), "utf8");
if (metricsTs.includes('AGENCY_OS_VERSION')) ok("metrics.ts build_info reads the shared constant");
else FAIL("metrics.ts does not import AGENCY_OS_VERSION");

// --- 2. roster sync (AGENTS.md contract table ↔ AGENT_ROSTER) ---------------
const agentsMd = readFileSync(join(root, "AGENTS.md"), "utf8");
const agentsTs = readFileSync(join(root, "packages", "orchestration", "src", "agents.ts"), "utf8");
const tableNames = new Set(
  [...agentsMd.matchAll(/^\| ?([a-z0-9-]+) ?\|/gm)]
    .map((x) => x[1].trim())
    .filter((n) => !/^-+$/.test(n))
);
const rosterDefs = new Set(
  [...agentsTs.matchAll(/def\("([a-z0-9-]+)"/g)].map((x) => x[1])
);
const missingInRoster = [...tableNames].filter((n) => !rosterDefs.has(n));
const missingInMd = [...rosterDefs].filter((n) => !tableNames.has(n));
if (missingInRoster.length > 0) FAIL(`AGENTS.md agents absent from AGENT_ROSTER: ${missingInRoster.join(", ")}`);
if (missingInMd.length > 0) FAIL(`AGENT_ROSTER agents absent from AGENTS.md: ${missingInMd.join(", ")}`);
if (missingInRoster.length === 0 && missingInMd.length === 0) ok(`roster sync (${rosterDefs.size} agents)`);

// --- 3. skill file sanity (name matches filename, registry idempotent) ------
const skillsDir = join(root, "workflows", "skills");
if (existsSync(skillsDir)) {
  const files = readdirSync(skillsDir).filter((f) => /\.ya?ml$/i.test(f));
  const bad = [];
  const names = [];
  for (const f of files) {
    const text = readFileSync(join(skillsDir, f), "utf8");
    const name = text.match(/^name:\s*([a-z0-9-]+)\s*$/m)?.[1];
    const slug = f.replace(/\.ya?ml$/i, "");
    if (!name) bad.push(`${f}: missing name`);
    else if (names.includes(name)) bad.push(`${f}: duplicate name '${name}'`);
    else if (name !== slug) bad.push(`${f}: name '${name}' != filename '${slug}'`);
    else names.push(name);
    if (!text.trim()) bad.push(`${f}: empty`);
  }
  if (bad.length > 0) bad.forEach(FAIL);
  else ok(`skills register sanity (${files.length} files)`);
} else SKIP("workflows/skills not present in this cwd (run from repo root)");

// --- 4. docs referenced by README/AGENTS actually exist ---------------------
const links = [
  ["PROGRESS.md", join(root, "PROGRESS.md")],
  ["SKILLS.md", join(root, "SKILLS.md")],
  ["docs/AGENT-WORKFORCE-IMPLEMENTATION-REPORT.md", join(root, "docs", "AGENT-WORKFORCE-IMPLEMENTATION-REPORT.md")],
];
const implReport = join(root, "artifacts", "baselines", "pre-agent-workforce.json");
for (const [label, filePath] of [...links, ["baseline artifact", implReport]]) {
  if (existsSync(filePath)) ok(`${label} exists`);
  else FAIL(`${label}: missing`);
}

if (failures.length > 0) {
  console.error(`\ndocs-check: ${failures.length} failure(s).`);
  process.exit(1);
}
console.log("\ndocs-check: all invariants hold.");