import {
  loadConfig,
  createLogger,
  EventBus,
  newId,
  newToken,
  parseMasterKey,
  createSecretResolver,
  type AppConfig,
  type Logger,
  type SecretResolver,
} from "@agency/core";
import { openDatabase, migrate, Db } from "@agency/db";
import { AuditLog, ApprovalService } from "@agency/security";
import { ModelRouter, MockModelProvider, OpenAICompatibleProvider, type ModelProvider } from "@agency/models";
import {
  AgentRegistry,
  TaskService,
  JobQueue,
  WorkflowEngine,
  WorkflowTemplateRegistry,
  OrgKeyEncryption,
} from "@agency/orchestration";
import { SkillRegistry } from "@agency/skills";
import { BudgetGuardImpl } from "./budget.ts";
import { initTracing, type TracingHandle } from "./tracing.ts";

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
  skills: SkillRegistry;
  workflowTemplates: WorkflowTemplateRegistry;
  bootstrapAdminKey: string;
  /** Active secret resolution backend (env|mock|vault). */
  secrets: SecretResolver;
  /** OpenTelemetry tracing handle (disabled unless OTEL_ENABLED + endpoint). */
  tracing: TracingHandle;
  /**
   * Per-workspace envelope encryption (audit Phase 4). Present whenever a
   * master key is configured; passthrough (no-op) when disabled.
   */
  encryption: OrgKeyEncryption;
  defaultOrgId(): string;
}

export function buildContext(env: NodeJS.ProcessEnv = process.env): AppContext {
  const config = loadConfig(env);
  const log = createLogger({ service: "control-plane", level: config.LOG_LEVEL });
  const secrets = createSecretResolver(config);
  const tracing = initTracing(config);
  if (tracing.enabled) log.info("OpenTelemetry tracing enabled", { tracesEndpoint: config.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT ?? config.OTEL_EXPORTER_OTLP_ENDPOINT });

  const driver = openDatabase(config.DATABASE_URL);
  const applied = migrate(driver);
  if (applied.length > 0) {
    log.info("migrations applied", { count: applied.length });
  }
  const db = new Db(driver, config.SLOW_QUERY_LOG_MS > 0
    ? {
        slowMs: config.SLOW_QUERY_LOG_MS,
        onSlow: (sql, ms) => log.warn("slow query", { ms, sql: sql.slice(0, 120) }),
      }
    : undefined);

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
  // At-rest encryption (audit Phases 3-4): a configured ENCRYPT_AT_REST +
  // ENCRYPTION_MASTER_KEY activates per-workspace envelope encryption on the
  // workflow run state. Without a master key the cipher is a passthrough, so
  // default deployments are byte-for-byte unchanged.
  const encryption = new OrgKeyEncryption(
    db,
    config.ENCRYPT_AT_REST && config.ENCRYPTION_MASTER_KEY
      ? parseMasterKey(config.ENCRYPTION_MASTER_KEY)
      : null
  );
  const workflows = new WorkflowEngine(db, { codecFor: (orgId) => encryption.codecFor(orgId) });
  const budget = new BudgetGuardImpl(db, defaultOrgId);

  // Skill loader (audit Phase 1): versionable YAML definitions under
  // workflows/skills, validated on boot. Permissive so one bad file can never
  // brick the control plane; issues are surfaced in the audit trail and log.
  const skills = new SkillRegistry({ mode: "permissive" }).load();
  if (skills.issues.length > 0) {
    for (const i of skills.issues) log.warn("skill registry issue", { file: i.file, errors: i.errors });
  }

  // Workflow path templates (audit Phase 2.2): workflows/*.yaml beside the
  // built-in enterprise-feature default.
  const workflowTemplates = new WorkflowTemplateRegistry(workflows, { mode: "permissive" }).load();
  if (workflowTemplates.issues.length > 0) {
    for (const i of workflowTemplates.issues) log.warn("workflow template issue", { file: i.file, errors: i.errors });
  }

  // Providers: mock always available; real provider when key + base URL present.
  // Keys resolve through the active SecretResolver (env or Vault at boot).
  const providers: ModelProvider[] = [new MockModelProvider()];
  const modelKey = config.MODEL_PROVIDER_API_KEY ?? secrets.get("MODEL_PROVIDER_API_KEY");
  if (
    env.MODEL_PROVIDER_BASE_URL &&
    (modelKey || config.SECRET_BACKEND === "vault")
  ) {
    providers.push(
      new OpenAICompatibleProvider({
        id: "openai-compatible",
        name: "OpenAI-compatible gateway",
        baseUrl: env.MODEL_PROVIDER_BASE_URL,
        priority: 10,
        resolveApiKey: () => config.MODEL_PROVIDER_API_KEY ?? secrets.get("MODEL_PROVIDER_API_KEY"),
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
    skills,
    workflowTemplates,
    bootstrapAdminKey:
      config.ADMIN_BOOTSTRAP_KEY || generatedOnce(log),
    secrets,
    tracing,
    encryption,
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
