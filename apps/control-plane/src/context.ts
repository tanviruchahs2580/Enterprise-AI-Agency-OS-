import {
  loadConfig,
  createLogger,
  EventBus,
  newId,
  newToken,
  type AppConfig,
  type Logger,
} from "@agency/core";
import { openDatabase, migrate, Db } from "@agency/db";
import { AuditLog, ApprovalService } from "@agency/security";
import { ModelRouter, MockModelProvider, OpenAICompatibleProvider, type ModelProvider } from "@agency/models";
import { AgentRegistry, TaskService, JobQueue, WorkflowEngine } from "@agency/orchestration";
import { BudgetGuardImpl } from "./budget.ts";

/** Everything a route handler may need, wired once. */
export interface AppContext {
  config: AppConfig;
  log: Logger;
  db: Db;
  bus: EventBus;
  audit: AuditLog;
  approvals: ApprovalService;
  tasks: TaskService;
  agents: AgentRegistry;
  jobs: JobQueue;
  workflows: WorkflowEngine;
  router: ModelRouter;
  budget: BudgetGuardImpl;
  bootstrapAdminKey: string;
  defaultOrgId(): string;
}

export function buildContext(env: NodeJS.ProcessEnv = process.env): AppContext {
  const config = loadConfig(env);
  const log = createLogger({ service: "control-plane", level: config.LOG_LEVEL });

  const driver = openDatabase(config.DATABASE_URL);
  const applied = migrate(driver);
  if (applied.length > 0) {
    log.info("migrations applied", { count: applied.length });
  }
  const db = new Db(driver);

  let orgCache: string | null = null;
  function defaultOrgId(): string {
    if (orgCache) return orgCache;
    const existing = db.get<{ id: string }>(
      "SELECT id FROM organizations WHERE slug = 'default'"
    );
    if (existing) {
      orgCache = String(existing.id);
      return orgCache;
    }
    const now = db.now();
    const id = newId("org");
    db.insert("organizations", {
      id,
      name: "Default Organization",
      slug: "default",
      created_at: now,
      updated_at: now,
    });
    orgCache = id;
    return id;
  }

  const bus = new EventBus();
  const audit = new AuditLog(db);
  const approvals = new ApprovalService(db, audit);
  const tasks = new TaskService(db);
  const agents = new AgentRegistry(db);
  const jobs = new JobQueue(db);
  const workflows = new WorkflowEngine(db);
  const budget = new BudgetGuardImpl(db, defaultOrgId);

  // Providers: mock always available; real provider when key + base URL present.
  const providers: ModelProvider[] = [new MockModelProvider()];
  if (env.MODEL_PROVIDER_API_KEY && env.MODEL_PROVIDER_BASE_URL) {
    providers.push(
      new OpenAICompatibleProvider({
        id: "openai-compatible",
        name: "OpenAI-compatible gateway",
        baseUrl: env.MODEL_PROVIDER_BASE_URL,
        priority: 10,
        resolveApiKey: () => env.MODEL_PROVIDER_API_KEY,
        models: [
          {
            id: "gateway-standard",
            alias: env.MODEL_PROVIDER_MODEL ?? "ox-alpha",
            modelId: env.MODEL_PROVIDER_MODEL ?? "ox-alpha",
            tier: "STANDARD",
            capabilities: ["chat", "tools", "json", "code"],
            contextWindow: Number(env.MODEL_PROVIDER_CONTEXT ?? 200_000),
            inputCostPer1k: Number(env.MODEL_PROVIDER_COST_IN_PER_1K ?? 0.002),
            outputCostPer1k: Number(env.MODEL_PROVIDER_COST_OUT_PER_1K ?? 0.008),
          },
        ],
      })
    );
    log.info("real model provider registered");
  }

  const router = new ModelRouter({
    providers,
    budget,
    onRecord: (rec) => {
      try {
        db.insert("model_requests", {
          id: newId("mreq"),
          org_id: defaultOrgId(),
          request_id: rec.requestId,
          trace_id: rec.traceId,
          requested_model: rec.requestedModel ?? "-",
          selected_model: rec.selectedModel,
          provider: rec.provider,
          fallback_reason: rec.fallbackReason,
          tier: rec.tier,
          latency_ms: rec.latencyMs,
          tokens_in: rec.tokensIn,
          tokens_out: rec.tokensOut,
          cost_usd: rec.estimatedCostUsd,
          retry_count: rec.retryCount,
          fallback_count: rec.fallbackCount,
          status: rec.status,
          error_code: rec.errorCode,
          redacted: 1,
          created_at: db.now(),
        });
      } catch (e) {
        log.error("failed to persist model request record", { error: String(e) });
      }
    },
  });

  return {
    config,
    log,
    db,
    bus,
    audit,
    approvals,
    tasks,
    agents,
    jobs,
    workflows,
    router,
    budget,
    bootstrapAdminKey:
      config.ADMIN_BOOTSTRAP_KEY || generatedOnce(log),
    defaultOrgId,
  };
}

function generatedOnce(log: Logger): string {
  const key = newToken(32);
  log.warn(
    "no ADMIN_BOOTSTRAP_KEY configured — generated one-time admin key (store it now; shown only once)"
  );
  return key;
}
