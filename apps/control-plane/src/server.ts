import { buildContext } from "./context.ts";
import { buildApp } from "./app.ts";
import { registerWorkers } from "./workers.ts";

async function main(): Promise<void> {
  const ctx = buildContext();

  // bootstrap admin key + agent roster
  const { AuthService } = await import("./auth.ts");
  const auth = new AuthService(ctx.db);
  auth.ensureBootstrapKey(ctx.defaultOrgId(), ctx.bootstrapAdminKey);
  ctx.agents.seedRoster(ctx.defaultOrgId());

  // default budgets for safe operation
  const hasDaily = ctx.db.get("SELECT id FROM budgets WHERE org_id=? AND scope_type='daily'", [
    ctx.defaultOrgId(),
  ]);
  if (!hasDaily) {
    ctx.db.insert("budgets", {
      id: `bud_${Date.now().toString(16)}`,
      org_id: ctx.defaultOrgId(),
      scope_type: "daily",
      scope_id: "*",
      limit_usd: Number(process.env.DEFAULT_DAILY_BUDGET_USD ?? 25),
      action: "block",
      created_at: ctx.db.now(),
    });
  }

  registerWorkers(ctx);
  await ctx.jobs.start();

  const app = buildApp(ctx);
  try {
    await app.listen({ port: ctx.config.PORT, host: ctx.config.HOST });
  } catch (e) {
    ctx.log.error("failed to bind", { error: String(e), port: ctx.config.PORT, host: ctx.config.HOST });
    process.exit(1);
  }

  ctx.log.info("control plane listening", {
    url: `http://${ctx.config.HOST}:${ctx.config.PORT}`,
    env: ctx.config.NODE_ENV,
    adminKey: ctx.bootstrapAdminKey,
  });

  const shutdown = async (signal: string) => {
    ctx.log.info("shutting down", { signal });
    ctx.jobs.stop();
    await app.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((e) => {
  // Fail fast on invalid configuration — never boot in a broken state.
  console.error(JSON.stringify({ level: "fatal", event: "boot_failed", error: String(e) }));
  process.exit(1);
});
