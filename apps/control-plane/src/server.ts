import { buildContext } from "./context.ts";
import { buildApp } from "./app.ts";
import { registerWorkers } from "./workers.ts";
import { registerDeliveryWorkers } from "./delivery-worker.ts";
import { sweepExpiredApprovals } from "./sweeper.ts";
import { SENSITIVE_KEYS } from "@agency/core";

async function main(): Promise<void> {
  const ctx = buildContext();

  // Warm any async secret backend (Vault) before serving traffic. Failures
  // must not brick the whole plane — sensitive use will refuse loudly later.
  if (ctx.config.SECRET_BACKEND === "vault" && ctx.secrets.prime) {
    try {
      await ctx.secrets.prime(SENSITIVE_KEYS);
      const missing = ctx.secrets.missing ?? [];
      if (missing.length > 0) {
        ctx.log.warn("vault backend: secrets not found", { missing });
      }
      ctx.log.info("vault secrets primed", { backend: ctx.secrets.backend });
    } catch (e) {
      ctx.log.error("vault secret priming failed", { error: String(e) });
    }
  }

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
  registerDeliveryWorkers(ctx);
  await ctx.jobs.start();

  // Approval expiry sweeper (GAP G-03) — deterministic, auditable, idempotent.
  const sweeper = setInterval(() => {
    try {
      const n = sweepExpiredApprovals(ctx.db, ctx.audit);
      if (n > 0) ctx.log.info("expired approvals swept", { count: n });
    } catch (e) {
      ctx.log.error("approval sweeper failed", { error: String(e) });
    }
  }, 60_000);

  const app = buildApp(ctx);
  try {
    await app.listen({ port: ctx.config.PORT, host: ctx.config.HOST });
  } catch (e) {
    ctx.log.error("failed to bind", { error: String(e), port: ctx.config.PORT, host: ctx.config.HOST });
    process.exit(1);
  }

  // SECURITY: never log the full key. Fingerprint only. When the key was
  // auto-generated (no ADMIN_BOOTSTRAP_KEY), surface it exactly once on
  // stderr for first-boot convenience outside production.
  ctx.log.info("control plane listening", {
    url: `http://${ctx.config.HOST}:${ctx.config.PORT}`,
    env: ctx.config.NODE_ENV,
    adminKeyFingerprint: ctx.bootstrapAdminKey.slice(0, 8) + "…",
  });
  if (!ctx.config.ADMIN_BOOTSTRAP_KEY && ctx.config.NODE_ENV !== "production") {
    console.error(`[bootstrap] one-time admin API key: ${ctx.bootstrapAdminKey}`);
  }

  const shutdown = async (signal: string) => {
    ctx.log.info("shutting down", { signal });
    clearInterval(sweeper);
    ctx.jobs.stop();
    await app.close();
    await ctx.tracing.shutdown();
    // Explicitly release the database handle so WAL frames are checkpointed
    // before the process exits (graceful, durable shutdown).
    try {
      ctx.db.close();
    } catch {
      // best-effort during shutdown
    }
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
