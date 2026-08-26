import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildContext } from "../apps/control-plane/src/context.ts";
import { buildApp } from "../apps/control-plane/src/app.ts";
import { registerWorkers } from "../apps/control-plane/src/workers.ts";
import { registerDeliveryWorkers } from "../apps/control-plane/src/delivery-worker.ts";
import { AuthService } from "../apps/control-plane/src/auth.ts";

const dataDir = mkdtempSync(join(tmpdir(), "govdbg-"));
const ctx = buildContext({
  NODE_ENV: "test", DATABASE_URL: join(dataDir, "t.sqlite"), ADMIN_BOOTSTRAP_KEY: "k-1234567890",
  PORT: "0", LOG_LEVEL: "error", SANDBOX_PROVIDER: "process",
});
const auth = new AuthService(ctx.db);
auth.ensureBootstrapKey(ctx.defaultOrgId(), "k-1234567890");
ctx.agents.seedRoster(ctx.defaultOrgId());
registerWorkers(ctx); registerDeliveryWorkers(ctx);
await ctx.jobs.start();
const app = buildApp(ctx);

async function api(m, p, b) {
  const r = await app.inject({ method: m, url: p, ...(b !== undefined ? { payload: b } : {}), headers: { authorization: "Bearer k-1234567890" } });
  let j = {}; try { j = r.json(); } catch {}
  return { status: r.statusCode, body: j };
}

const prj = await api("POST", "/api/v1/projects", { name: "GovDbg" });
const tsk = await api("POST", "/api/v1/tasks", {
  projectId: prj.body.id, title: "never ready",
  deliverySpec: { kind: "delivery", moduleName: "gb", ops: [{ name: "add", arity: 2 }] },
});
console.log("task status right after create:", tsk.body.status);
const run = await api("POST", "/api/v1/delivery/runs", { taskId: tsk.body.id });
console.log("dispatch:", run.status, JSON.stringify(run.body));

for (let i = 0; i < 12; i++) {
  await new Promise((r) => setTimeout(r, 500));
  const s = await api("GET", "/api/v1/delivery/runs/" + run.body.executionId);
  console.log("poll", i, s.body.execution?.status, s.body.execution?.error_code ?? "");
  if (["succeeded", "failed"].includes(s.body.execution?.status)) break;
}
const job = ctx.db.get(`SELECT status, attempts, last_error FROM jobs WHERE job_type='deliver_task' ORDER BY created_at DESC LIMIT 1`);
console.log("JOB:", JSON.stringify(job));
const evs = ctx.db.all("SELECT type FROM domain_events ORDER BY seq DESC LIMIT 8").map(r => r.type);
console.log("recent events:", evs.join(","));

await app.close(); ctx.jobs.stop(); ctx.db.driver.close();
try { rmSync(dataDir, { recursive: true, force: true, maxRetries: 5 }); } catch {}
process.exit(0);
