#!/usr/bin/env node
/**
 * AUTONOMOUS DELIVERY DEMO (master prompt Phase 25-27).
 *
 * Drives the agency over HTTP to autonomously deliver a working module:
 *   requirement(task) → dispatch(+fault injection) → worktree → codegen →
 *   RED tests → self-heal repair → GREEN → review APPROVE → commit → merge.
 *
 * Prints machine-readable evidence. Exit code 0 = demo valid.
 */
import { loadEnvFile } from "./lib/env.mjs";
import { writeFileSync, existsSync, readFileSync } from "node:fs";

loadEnvFile();
const base = process.argv[2] ?? `http://127.0.0.1:${process.env.PORT ?? 3000}`;
const key = process.argv[3] ?? process.env.ADMIN_BOOTSTRAP_KEY;
if (!key) { console.error("usage: node scripts/demo-delivery.mjs <base> <apiKey>"); process.exit(1); }

const H = { authorization: `Bearer ${key}`, "content-type": "application/json" };
async function api(method, path, body) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: H,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = {};
  try { json = text ? JSON.parse(text) : {}; } catch { /* html */ }
  if (!res.ok && !(res.status === 202)) {
    throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 200)}`);
  }
  return json;
}

const evidence = { steps: [] };
function step(name, data) {
  evidence.steps.push({ name, ...data });
  console.log(`\n== ${name} ==`);
  console.log(JSON.stringify(data).slice(0, 300));
}

// 1. project
const prj = await api("POST", "/api/v1/projects", {
  name: "Autonomous Demo " + Date.now(),
  description: "Built end-to-end by the agency delivery loop",
});
step("project_created", prj);
const projectId = String(prj.id);

// 2. task carrying a DeliverySpec
const spec = {
  kind: "delivery",
  moduleName: "calculator",
  ops: [{ name: "add", arity: 2 }, { name: "mul", arity: 2 }],
};
const task = await api("POST", "/api/v1/tasks", {
  projectId,
  title: "Implement calculator module with tests",
  description: JSON.stringify(spec),
});
step("task_created", { taskId: task.id });

await api("POST", `/api/v1/tasks/${task.id}/transition`, { to: "ready" });
step("task_ready", { state: "ready" });

// 3. dispatch WITH intentional fault injection (proves self-healing)
const run = await api("POST", "/api/v1/delivery/runs", {
  taskId: task.id,
  injectFault: true,
  maxRepairAttempts: 2,
});
step("dispatched", run);

// 4. wait for the worker loop to finish (server processes jobs in-process)
let final = null;
for (let i = 0; i < 60; i++) {
  await new Promise((r) => setTimeout(r, 1000));
  const s = await api("GET", `/api/v1/delivery/runs/${run.executionId}`);
  if (["succeeded", "failed"].includes(s.execution.status)) { final = s; break; }
}
if (!final) throw new Error("delivery did not finish within timeout");
step("execution_finished", {
  status: final.execution.status,
  summary: final.execution.output_summary,
  taskStatus: final.task?.status,
  receipt: final.task?.quality_receipt ? "issued(hash-chained)" : null,
});

// 5. assertions — the demo is INVALID unless all hold
const checks = [];
const addCheck = (name, ok, detail) => checks.push({ name, ok, detail });
addCheck("execution_succeeded", final.execution.status === "succeeded", final.execution.output_summary);
addCheck("quality_receipt_issued", Boolean(final.task?.quality_receipt), "hash-chained receipt");

// merged code must exist in the managed repo with REPAIRED operator
const slug = String(prj.slug ?? "");
const repoFile = `data/repos/${slug}-${projectId.slice(-6)}/src/calculator.js`;
addCheck("merged_file_on_disk", existsSync(repoFile), repoFile);
if (existsSync(repoFile)) {
  const src = readFileSync(repoFile, "utf8");
  addCheck("repaired_operator_merged", /return a \* b;/.test(src), "mul repaired to '*' in merged main");
  addCheck("no_broken_operator", !/\+ b;\n}/.test(src.split("mul")[1] ?? "+"), "no leftover '+' in mul");
}

const listRes = await fetch(`${base}/api/v1/meta`, { headers: H }).then((r) => r.json()).catch(() => ({}));
void listRes;

const execRow = final.execution;
addCheck("trace_id_present", Boolean(execRow.trace_id || run.traceId), "trace linkage");

// audit chain integrity after autonomous actions
const audit = await api("GET", "/api/v1/audit?limit=200");
addCheck("audit_has_delivery_events", (audit.items ?? []).some((a) => String(a.action).startsWith("delivery.")), `${(audit.items ?? []).length} events`);

// knowledge handoff persisted
const knw = await api("GET", "/api/v1/knowledge/search?q=Delivered");
addCheck("handoff_knowledge_persisted", (knw.items ?? []).some((k) => String(k.title).includes("Delivered")), `${(knw.items ?? []).length} matches`);

// metrics expose the traffic we just generated
const metrics = await fetch(`${base}/metrics`).then((r) => r.text());
addCheck("metrics_live", metrics.includes("agencyos_http_requests_total"), `${metrics.split("\n").length} lines`);

const failedChecks = checks.filter((c) => !c.ok);
evidence.checks = checks;

console.log("\n== VERIFICATION ==");
for (const c of checks) console.log(` ${c.ok ? "PASS" : "FAIL"}  ${c.name}`);

console.log("\n== DEMO VERDICT ==");
if (failedChecks.length === 0 && final.execution.status === "succeeded") {
  console.log("AUTONOMOUS DELIVERY DEMO: SUCCESS");
  evidence.verdict = "SUCCESS";
} else {
  console.log("AUTONOMOUS DELIVERY DEMO: FAILED");
  evidence.verdict = "FAILED";
}
writeFileSync(".demo-evidence.json", JSON.stringify(evidence, null, 2));

process.exit(failedChecks.length === 0 ? 0 : 1);