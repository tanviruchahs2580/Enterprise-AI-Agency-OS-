import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildContext } from "../apps/control-plane/src/context.ts";
import { buildApp } from "../apps/control-plane/src/app.ts";
import { AuthService } from "../apps/control-plane/src/auth.ts";

const dataDir = mkdtempSync(join(tmpdir(), "dbg-"));
const ctx = buildContext({
  NODE_ENV: "test",
  DATABASE_URL: join(dataDir, "t.sqlite"),
  ADMIN_BOOTSTRAP_KEY: "test-admin-key-0001",
  PORT: "0",
  LOG_LEVEL: "error",
});
const auth = new AuthService(ctx.db);
auth.ensureBootstrapKey(ctx.defaultOrgId(), "test-admin-key-0001");
ctx.agents.seedRoster(ctx.defaultOrgId());
const app = buildApp(ctx);

const r = await app.inject({ method: "POST", url: "/api/v1/models/complete", payload: { prompt: "ping", tier: "FAST" }, headers: { authorization: "Bearer test-admin-key-0001" } });
console.log("complete:", r.statusCode, r.body.slice(0, 500));

// inspect model_requests rows
const rows = ctx.db.all("SELECT * FROM model_requests");
console.log("model_requests:", JSON.stringify(rows, null, 1).slice(0, 800));

await app.close();
