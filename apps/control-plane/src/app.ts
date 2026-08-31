import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import { AppError, sha256Hex, newToken } from "@agency/core";
import type { Identity } from "./auth.ts";
import { AuthService } from "./auth.ts";
import { OidcClient, OidcStateStore } from "./oidc.ts";
import type { AppContext } from "./context.ts";
import { assertDeliveryDemoFlags, DELIVERY_STAGES } from "./delivery.ts";
import { MetricsRegistry, metricsRouteLabel } from "./metrics.ts";
import { createRateLimitStore, routeClassFor } from "./ratelimit.ts";
import { validateSkill, type Skill } from "@agency/skills";
import { SkillRuntime, evaluateRubric } from "@agency/skills";
import {
  AgentRegistry,
  MissionCompiler,
  CapabilityRouter,
  computeReachability,
  validateHandoff,
  verificationPolicyFor,
  DEFAULT_VERIFICATION_THRESHOLDS,
  hashContent,
  verifyRecord,
  unbackedCompletionClaims,
  CAPABILITY_IDS,
  summarize as summarizeEvidence,
  type AgentHandoff,
  type ToolId,
} from "@agency/orchestration";
import type { ModelTier } from "@agency/models";
import { parse } from "yaml";
import { AGENCY_OS_VERSION } from "./version.ts";

const PUBLIC_PATHS = new Set(["/health", "/ready", "/live", "/api/v1/meta", "/metrics", "/api/v1/health", "/api/v1/ready", "/api/v1/live", "/api/v1/metrics"]);
/** OIDC endpoints are unauthenticated by design (they ARE the login). */
const OIDC_PUBLIC_PATHS = new Set(["/api/v1/auth/oidc/login", "/api/v1/auth/oidc/callback"]);

/** One-time, short-TTL tickets so EventSource never carries the API key. */
interface SseTicket {
  identity: Identity;
  expiresAt: number;
}

export function buildApp(ctx: AppContext): FastifyInstance {
  const auth = new AuthService(ctx.db);
  const metrics = new MetricsRegistry();
  const sseTickets = new Map<string, SseTicket>();
  const rateLimiter = createRateLimitStore(
    ctx.config.RATE_LIMIT_STORE === "postgres" ? ctx.db : null,
    {
      store: ctx.config.RATE_LIMIT_STORE,
      windowMs: ctx.config.RATE_LIMIT_WINDOW_MS,
      limits: { default: ctx.config.RATE_LIMIT_MAX, dispatch: 60 },
    }
  );

  // ADR-0007 IdentityProvider seam (audit Phase 2): OIDC/SSO client + server-side
  // state store. Activated only when OIDC_ENABLED — otherwise zero overhead.
  const oidc = ctx.config.OIDC_ENABLED ? new OidcClient(ctx.config) : null;
  const oidcStates = new OidcStateStore();
  void oidcStates;

  const app = Fastify({
    logger: false,
    genReqId: () => cryptoRandomId("req"),
    trustProxy: true,
    bodyLimit: 1_000_000,
  });

  // ---------- security headers (no external dependency) ----------
  app.addHook("onSend", async (_req, reply) => {
    reply.header("x-content-type-options", "nosniff");
    reply.header("x-frame-options", "DENY");
    reply.header("referrer-policy", "no-referrer");
    reply.header("permissions-policy", "geolocation=(), microphone=(), camera=()");
    // HSTS is meaningful only when TLS terminates at this process; production
    // fronts TLS at the proxy, which owns Strict-Transport-Security.
  });

  // ---------- hooks ----------
  app.addHook("onRequest", async (req, reply) => {
    const url = req.url.split("?")[0] ?? req.url;
    if (PUBLIC_PATHS.has(url)) return;
    if (OIDC_PUBLIC_PATHS.has(url)) return;

    // ---- Phase A/F-03: CORS origin enforcement (browser requests only) ----
    const origin = req.headers.origin;
    if (origin) {
      const allowed = ctx.config.CORS_ORIGIN.split(",").map((s) => s.trim());
      if (!allowed.includes(origin)) {
        auditEvent(ctx, { userId: "anonymous", orgId: ctx.defaultOrgId(), role: "VIEWER", name: "origin-block", keyId: "none" },
          "http.origin_blocked", "http", url, "low",
          { origin, allowList: allowed });
        throw new AppError("FORBIDDEN", "origin not allowed", { details: { origin } });
      }
    }

    // ---- logout must always be allowed so browsers can clear stale cookies ----
    if (req.method === "DELETE" && url === "/api/v1/auth/session") return;

    const header = req.headers.authorization;
    let token: string | undefined;
    let sessionToken: string | undefined;
    let sseTicket: string | undefined;
    if (header?.startsWith("Bearer ")) {
      token = header.slice(7);
    } else if (url === "/api/v1/events") {
      // EventSource cannot send headers; clients exchange the API key for a
      // one-time short-TTL ticket (POST /api/v1/events/ticket) first. Same-origin
      // EventSource requests may also authenticate via the httpOnly session cookie.
      sseTicket = new URLSearchParams(req.url.split("?")[1] ?? "").get("ticket") ?? undefined;
    }
    if (!token && !sseTicket) {
      sessionToken = readSessionCookie(req.headers.cookie, ctx.config.SESSION_COOKIE_NAME);
    }

    let identity: Identity;
    if (sseTicket) identity = consumeSseTicket(sseTicket);
    else if (token) identity = auth.authenticate(token);
    else if (sessionToken) identity = auth.authenticateSession(sessionToken);
    else identity = auth.authenticate(undefined); // throws unauthenticated
    (req as FastifyRequest & { identity?: Identity }).identity = identity;

    // Identity-aware rate buckets: hash(keyId|ip) — collision-resistant,
    // tenant-safe, and stable across routes (GAP G-07, Phase C1).
    const rlBucket = sha256Hex(`${identity.keyId}|${req.ip}`).slice(0, 24);
    const rlClass = routeClassFor(url);
    const rlResult = await rateLimiter.check(rlBucket, rlClass, identity.orgId, Date.now());
    if (!rlResult.allowed) {
      reply.header("Retry-After", String(Math.ceil((rlResult.retryAfterMs ?? ctx.config.RATE_LIMIT_WINDOW_MS) / 1000)));
      throw new AppError("RATE_LIMITED", "rate limit exceeded", {
        details: {
          windowMs: ctx.config.RATE_LIMIT_WINDOW_MS,
          max: rlResult.limit,
          remaining: rlResult.remaining,
          routeClass: rlClass,
          retryAfterMs: rlResult.retryAfterMs,
        },
      });
    }

    void reply;
  });

  function consumeSseTicket(ticket: string): Identity {
    const entry = sseTickets.get(ticket);
    if (!entry) throw new AppError("UNAUTHENTICATED", "invalid or expired SSE ticket");
    sseTickets.delete(ticket); // single-use
    if (Date.now() > entry.expiresAt) {
      throw new AppError("UNAUTHENTICATED", "SSE ticket expired");
    }
    return entry.identity;
  }

  app.addHook("onResponse", async (req, reply) => {
    const url = req.url.split("?")[0] ?? req.url;
    if (PUBLIC_PATHS.has(url)) return;
    metrics.observeHttp(
      { route: metricsRouteLabel(url), method: req.method, status: reply.statusCode },
      reply.elapsedTime
    );
  });

  app.addHook("onError", async (_req, _reply, err: Error) => {
    ctx.log.error("request error", { error: err.message, path: _req.url });
  });

  app.setErrorHandler((err: Error & { statusCode?: number; validation?: unknown; code?: string }, req, reply) => {
    const requestId = String(req.id);
    if (err instanceof AppError) {
      reply.code(err.statusCode);
      return reply.send({
        error: {
          code: err.code,
          message: err.message,
          requestId,
          retryable: err.retryable,
          ...(err.details ? { details: err.details } : {}),
        },
      });
    }
    // Malformed request bodies (fastify FST_ERR_CTP_* / JSON SyntaxError)
    const isBodyParse =
      typeof err.code === "string" && err.code.startsWith("FST_ERR_CTP") ||
      err instanceof SyntaxError;
    if (isBodyParse) {
      reply.code(400);
      return reply.send({
        error: {
          code: "VALIDATION_ERROR",
          message: "request body is not valid for content-type",
          requestId,
          retryable: false,
        },
      });
    }
    // validation / unknown
    const status = err.statusCode ?? 500;
    const validation = (err as { validation?: unknown }).validation;
    reply.code(status === 413 ? 400 : status >= 500 ? 500 : status);
    if (status >= 500) {
      ctx.log.error("internal error", { err: err.message, stack: err.stack?.split("\n")[0] });
    }
    return reply.send({
      error: {
        code: validation ? "VALIDATION_ERROR" : "INTERNAL",
        message:
          validation
            ? "request payload failed schema validation"
            : status < 500
              ? err.message
              : "internal server error",
        requestId,
        retryable: false,
      },
    });
  });

  // ---------- helpers ----------
  const ident = (req: FastifyRequest): Identity => {
    const i = (req as FastifyRequest & { identity?: Identity }).identity;
    if (!i) throw new AppError("UNAUTHENTICATED", "not authenticated");
    return i;
  };

  // ---------- public meta & health ----------
  const healthHandler = async () => ({ status: "ok", service: "control-plane" });
  const liveHandler = async () => ({ status: "alive" });
  const readyHandler = async () => {
    try {
      ctx.db.get("SELECT 1 AS ok");
      const dlq = ctx.jobs.stats(ctx.defaultOrgId())["dead_letter"] ?? 0;
      return {
        status: "ready",
        database: "ok",
        queueDeadLetters: dlq,
        sandboxProvider: ctx.config.SANDBOX_PROVIDER,
        features: featureFlags(ctx),
      };
    } catch (e) {
      throw new AppError("DEPENDENCY_UNAVAILABLE", `readiness failed: ${String(e)}`);
    }
  };
  app.get("/health", healthHandler);
  app.get("/api/v1/health", healthHandler);
  app.get("/live", liveHandler);
  app.get("/api/v1/live", liveHandler);
  app.get("/ready", readyHandler);
  app.get("/api/v1/ready", readyHandler);

  app.get("/api/v1/meta", async () => ({
    name: "enterprise-ai-agency-os",
    version: AGENCY_OS_VERSION,
    apiVersion: "v1",
    features: featureFlags(ctx),
    capabilities: {
      skillLoader: true,
      skills: ctx.skills.count(),
      skillRuntime: true,
      missionCompiler: true,
      capabilityRouting: true,
      workGraph: true,
      handoffContract: true,
      evidenceRegistry: true,
      workflowTemplates: ctx.workflowTemplates.count(),
      auth: {
        modes: ctx.config.OIDC_ENABLED ? ["api-key", "httpOnly-session", "oidc-sso"] : ["api-key", "httpOnly-session"],
        cookie: ctx.config.SESSION_COOKIE_NAME,
      },
      rosterAgents: ctx.agents.list(ctx.defaultOrgId()).length,
    },
    docs: "/docs",
  }));

  // ---------- organizations & tenancy ----------
  app.post("/api/v1/organizations", async (req, reply) => {
    // Authenticated OWNER-level identities may provision new tenants.
    const me = ident(req);
    auth.requirePermission(me, "settings:write");
    const body = (req.body ?? {}) as Record<string, unknown>;
    requireFields(body, ["name"]);
    const slug = slugify(String(body.slug ?? body.name));
    if (ctx.db.get("SELECT id FROM organizations WHERE slug = ?", [slug])) {
      throw new AppError("CONFLICT", `organization slug '${slug}' already exists`);
    }
    const id = cryptoRandomId("org");
    const now = ctx.db.now();
    ctx.db.insert("organizations", {
      id, name: String(body.name), slug,
      created_at: now, updated_at: now,
    });
    const key = auth.createKey(id, `${slug}-owner`, "OWNER");
    ctx.agents.seedRoster(id);
    auditEvent(ctx, me, "organization.created", "organization", id, "critical", { slug });
    publishEvent(ctx, id, me, "OrganizationCreated", { organizationId: id, slug });
    reply.code(201);
    return { id, slug, ownerKey: key.keyMaterial };
  });

  app.get("/api/v1/organizations", async (req) => {
    const me = ident(req);
    auth.requirePermission(me, "project:read");
    return {
      items: ctx.db.all(
        "SELECT id, name, slug, created_at FROM organizations WHERE id = ?",
        [me.orgId]
      ),
    };
  });

  // ---------- missions ----------
  app.post("/api/v1/missions", async (req, reply) => {
    const me = ident(req);
    auth.requirePermission(me, "mission:create");
    const body = (req.body ?? {}) as Record<string, unknown>;
    requireFields(body, ["projectId", "title", "objective"]);
    ensureProject(ctx, me.orgId, String(body.projectId));
    const id = cryptoRandomId("mis");
    const now = ctx.db.now();
    ctx.db.insert("missions", {
      id, org_id: me.orgId, project_id: String(body.projectId),
      title: String(body.title), objective: String(body.objective),
      status: "draft",
      budget_usd: Number(body.budgetUsd ?? 0),
      spent_usd: 0,
      created_by: me.userId,
      created_at: now, updated_at: now,
    });
    auditEvent(ctx, me, "mission.created", "mission", id, "low");
    reply.code(201);
    return { id };
  });

  app.get("/api/v1/missions", async (req) => {
    const me = ident(req);
    auth.requirePermission(me, "project:read");
    const q = req.query as { projectId?: string };
    const params: unknown[] = [me.orgId];
    let sql = "SELECT * FROM missions WHERE org_id = ?";
    if (q.projectId) { sql += " AND project_id = ?"; params.push(q.projectId); }
    sql += " ORDER BY created_at DESC LIMIT 100";
    return { items: ctx.db.all(sql, params) };
  });

  // ---------- mission compiler (Phase 2: deterministic classification) ----------
  app.post("/api/v1/missions/compile", async (req) => {
    const me = ident(req);
    auth.requirePermission(me, "mission:create");
    const body = (req.body ?? {}) as Record<string, unknown>;
    requireFields(body, ["objective"]);
    const plan = new MissionCompiler().compile({
      objective: String(body.objective),
      scope: body.scope !== undefined ? String(body.scope) : undefined,
      constraints: Array.isArray(body.constraints) ? (body.constraints as string[]) : undefined,
      acceptanceCriteria: Array.isArray(body.acceptanceCriteria) ? (body.acceptanceCriteria as string[]) : undefined,
    });
    auditEvent(ctx, me, "mission.compiled", "mission", "plan", "low", {
      complexity: plan.complexity,
      risk: plan.risk,
      capabilities: plan.requiredCapabilities,
    });
    return { plan, compilerVersion: "1.0" };
  });

  // ---------- workstreams ----------
  app.post("/api/v1/workstreams", async (req, reply) => {
    const me = ident(req);
    auth.requirePermission(me, "task:create");
    const body = (req.body ?? {}) as Record<string, unknown>;
    requireFields(body, ["projectId", "name"]);
    ensureProject(ctx, me.orgId, String(body.projectId));
    const id = cryptoRandomId("ws");
    const now = ctx.db.now();
    ctx.db.insert("workstreams", {
      id, org_id: me.orgId, project_id: String(body.projectId),
      mission_id: body.missionId ? String(body.missionId) : null,
      name: String(body.name),
      description: String(body.description ?? ""),
      status: "active",
      created_at: now, updated_at: now,
    });
    reply.code(201);
    return { id };
  });

  app.get("/api/v1/workstreams", async (req) => {
    const me = ident(req);
    auth.requirePermission(me, "project:read");
    const q = req.query as { projectId?: string };
    const params: unknown[] = [me.orgId];
    let sql = "SELECT * FROM workstreams WHERE org_id = ?";
    if (q.projectId) { sql += " AND project_id = ?"; params.push(q.projectId); }
    sql += " ORDER BY created_at DESC LIMIT 100";
    return { items: ctx.db.all(sql, params) };
  });

  // ---------- projects ----------
  app.post("/api/v1/projects", async (req, reply) => {
    const me = ident(req);
    auth.requirePermission(me, "project:create");
    const body = (req.body ?? {}) as Record<string, unknown>;
    requireFields(body, ["name"]);
    const name = String(body.name);
    const slug = slugify(String(body.slug ?? name));
    const dup = ctx.db.get("SELECT id FROM projects WHERE org_id=? AND slug=?", [me.orgId, slug]);
    if (dup) throw new AppError("CONFLICT", `project slug '${slug}' already exists`);
    const id = cryptoRandomId("prj");
    const now = ctx.db.now();
    ctx.db.insert("projects", {
      id, org_id: me.orgId, name, slug,
      description: String(body.description ?? ""),
      status: "draft",
      repo_url: body.repoUrl ? String(body.repoUrl) : null,
      created_by: me.userId,
      created_at: now, updated_at: now,
    });
    auditEvent(ctx, me, "project.created", "project", id, "low");
    publishEvent(ctx, me.orgId, me, "ProjectCreated", { projectId: id, name });
    reply.code(201);
    return { id, slug };
  });

  app.get("/api/v1/projects", async (req) => {
    const me = ident(req);
    auth.requirePermission(me, "project:read");
    const rows = ctx.db.all(
      "SELECT id, name, slug, description, status, repo_url, created_at FROM projects WHERE org_id=? AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 100",
      [me.orgId]
    );
    return { items: rows, nextCursor: null };
  });

  app.get("/api/v1/projects/:id", async (req) => {
    const me = ident(req);
    auth.requirePermission(me, "project:read");
    const { id } = req.params as { id: string };
    const row = ctx.db.get(
      "SELECT * FROM projects WHERE id=? AND org_id=? AND deleted_at IS NULL",
      [id, me.orgId]
    );
    if (!row) throw new AppError("NOT_FOUND", "project not found");
    return row;
  });

  // ---------- project agents (team) ----------
  app.post("/api/v1/projects/:id/agents", async (req, reply) => {
    const me = ident(req);
    auth.requirePermission(me, "project:update");
    const { id } = req.params as { id: string };
    ensureProject(ctx, me.orgId, id);
    const body = (req.body ?? {}) as Record<string, unknown>;
    requireFields(body, ["agentId"]);
    const agent = ctx.db.get<{ id: string; name: string; role: string }>(
      "SELECT id, name, role FROM agents WHERE id=? AND org_id=?", [String(body.agentId), me.orgId]);
    if (!agent) throw new AppError("NOT_FOUND", "agent not found");
    const existing = ctx.db.get("SELECT id FROM project_agents WHERE project_id=? AND agent_id=?", [id, agent.id]);
    if (existing) { reply.code(200); return { id: String(existing.id), alreadyMember: true }; }
    const paId = cryptoRandomId("pma");
    ctx.db.insert("project_agents", {
      id: paId, org_id: me.orgId, project_id: id, agent_id: agent.id,
      role_in_project: body.roleInProject ? String(body.roleInProject) : "member",
      added_by: me.userId, created_at: ctx.db.now(),
    });
    auditEvent(ctx, me, "project.agent.added", "project", id, "low", { agentId: agent.id });
    reply.code(201);
    return { id: paId };
  });

  app.get("/api/v1/projects/:id/agents", async (req) => {
    const me = ident(req);
    auth.requirePermission(me, "project:read");
    const { id } = req.params as { id: string };
    ensureProject(ctx, me.orgId, id);
    const items = ctx.db.all(
      `SELECT pa.id AS paId, pa.role_in_project AS roleInProject, pa.created_at AS joinedAt,
              a.id AS agentId, a.name, a.role, a.description, a.status, a.model_policy AS modelPolicy,
              a.budget_usd AS budgetUsd, a.allowed_tools AS allowedTools, a.forbidden_tools AS forbiddenTools,
              a.max_iterations AS maxIterations, a.timeout_ms AS timeoutMs, a.heartbeat_at AS heartbeatAt
       FROM project_agents pa JOIN agents a ON a.id = pa.agent_id
       WHERE pa.project_id = ? AND pa.org_id = ?
       ORDER BY a.role, a.name`,
      [id, me.orgId]
    );
    return { items };
  });

  app.delete("/api/v1/projects/:id/agents/:agentId", async (req, reply) => {
    const me = ident(req);
    auth.requirePermission(me, "project:update");
    const { id, agentId } = req.params as { id: string; agentId: string };
    ensureProject(ctx, me.orgId, id);
    ctx.db.run("DELETE FROM project_agents WHERE project_id=? AND agent_id=? AND org_id=?", [id, agentId, me.orgId]);
    auditEvent(ctx, me, "project.agent.removed", "project", id, "low", { agentId });
    reply.code(204);
    return null;
  });

  // ---------- requirements ----------
  app.post("/api/v1/projects/:id/requirements", async (req, reply) => {
    const me = ident(req);
    auth.requirePermission(me, "task:create");
    const { id } = req.params as { id: string };
    ensureProject(ctx, me.orgId, id);
    const body = (req.body ?? {}) as Record<string, unknown>;
    requireFields(body, ["title"]);
    const count = ctx.db.get<{ n: number }>(
      "SELECT COUNT(*) AS n FROM requirements WHERE project_id=?", [id]
    );
    const ref = `REQ-${String(Number(count?.n ?? 0) + 1).padStart(4, "0")}`;
    const rid = cryptoRandomId("req_").replace("req_", "rqm_");
    ctx.db.insert("requirements", {
      id: rid, org_id: me.orgId, project_id: id, ref,
      title: String(body.title),
      description: String(body.description ?? ""),
      acceptance_criteria: JSON.stringify(body.acceptanceCriteria ?? []),
      status: "proposed",
      source: String(body.source ?? "manual"),
      created_by: me.userId,
      created_at: ctx.db.now(), updated_at: ctx.db.now(),
    });
    publishEvent(ctx, me.orgId, me, "RequirementCreated", { requirementId: rid, ref });
    reply.code(201);
    return { id: rid, ref };
  });

  app.get("/api/v1/projects/:id/requirements", async (req) => {
    const me = ident(req);
    auth.requirePermission(me, "project:read");
    const { id } = req.params as { id: string };
    return {
      items: ctx.db.all(
        "SELECT * FROM requirements WHERE project_id=? ORDER BY ref",
        [id]
      ),
    };
  });

  // ---------- tasks ----------
  app.post("/api/v1/tasks", async (req, reply) => {
    const me = ident(req);
    auth.requirePermission(me, "task:create");
    const body = (req.body ?? {}) as Record<string, unknown>;
    requireFields(body, ["projectId", "title"]);
    // Structured delivery spec: pass `deliverySpec` as a JSON object and the
    // server serializes it into the task description the delivery worker reads.
    let description = String(body.description ?? "");
    if (body.deliverySpec !== undefined) {
      const s = body.deliverySpec as { kind?: string; moduleName?: string; ops?: unknown };
      if (
        typeof s !== "object" || s === null ||
        s.kind !== "delivery" || typeof s.moduleName !== "string" || !Array.isArray(s.ops)
      ) {
        throw new AppError("VALIDATION_ERROR",
          "deliverySpec must be {kind:'delivery', moduleName:string, ops:[{name,arity,cases?}]}");
      }
      description = JSON.stringify(s);
      // PHASE B5: perfBudget range validation at the boundary
      if ((s as { perfBudget?: unknown }).perfBudget !== undefined) {
        const { validatePerfBudget } = await import("@agency/delivery");
        const v = validatePerfBudget((s as { perfBudget?: unknown }).perfBudget);
        if (!v.ok) throw new AppError("VALIDATION_ERROR", v.reason);
      }
    }
    const t = ctx.tasks.create({
      orgId: me.orgId,
      projectId: String(body.projectId),
      title: String(body.title),
      description,
      workstreamId: body.workstreamId ? String(body.workstreamId) : undefined,
      missionId: body.missionId ? String(body.missionId) : undefined,
      priority: body.priority ? Number(body.priority) : 3,
      createdBy: me.userId,
      dependsOn: Array.isArray(body.dependsOn) ? body.dependsOn.map(String) : [],
    });
    auditEvent(ctx, me, "task.created", "task", t.id, "low");
    // PHASE B4: Definition-of-Ready warnings ride the event payload
    {
      const { reqReadinessCheck } = await import("./specialists.ts");
      const warnings = reqReadinessCheck({ title: String(body.title), description: description });
      publishEvent(ctx, me.orgId, me, "TaskCreated", { taskId: t.id, warnings });
    }
    reply.code(201);
    return t;
  });

  app.get("/api/v1/tasks", async (req) => {
    const me = ident(req);
    auth.requirePermission(me, "project:read");
    const q = req.query as { projectId?: string; status?: string; limit?: string; cursor?: string };
    if (!q.projectId) throw new AppError("VALIDATION_ERROR", "projectId query param required");
    const params: unknown[] = [me.orgId, q.projectId];
    let sql =
      "SELECT id, title, status, priority, assignee_agent_id, quality_receipt, version, created_at FROM tasks WHERE org_id=? AND project_id=?";
    if (q.status) {
      sql += " AND status=?";
      params.push(q.status);
    }
    if (q.cursor) {
      sql += " AND created_at > ?";
      params.push(new Date(q.cursor).toISOString());
    }
    sql += " ORDER BY created_at ASC LIMIT ?";
    params.push(Math.min(200, Number(q.limit ?? 50)));
    const items = ctx.db.all(sql, params);
    const last = items.at(-1);
    return { items, nextCursor: items.length === Number(q.limit ?? 50) && last ? String(last.created_at) : null };
  });

  app.get("/api/v1/projects/:id/tasks/ready", async (req) => {
    const me = ident(req);
    auth.requirePermission(me, "project:read");
    const { id } = req.params as { id: string };
    return { items: ctx.tasks.readyQueue(id) };
  });

  app.post("/api/v1/tasks/:id/transition", async (req) => {
    const me = ident(req);
    auth.requirePermission(me, "task:update");
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as Record<string, unknown>;
    requireFields(body, ["to"]);
    const r = ctx.tasks.transition(id, String(body.to) as never);
    publishEvent(ctx, me.orgId, me, `Task${cap(body.to as string)}`, { taskId: id, from: r.from, to: r.to });
    return r;
  });

  app.post("/api/v1/tasks/:id/receipt", async (req) => {
    const me = ident(req);
    auth.requirePermission(me, "task:update");
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as Record<string, unknown>;
    requireFields(body, ["tests", "security", "review"]);
    const receipt = ctx.tasks.issueQualityReceipt(id, {
      tests: String(body.tests) as never,
      security: String(body.security) as never,
      review: String(body.review) as never,
      coverageLine: body.coverageLine !== undefined ? Number(body.coverageLine) : undefined,
      coverageBranch: body.coverageBranch !== undefined ? Number(body.coverageBranch) : undefined,
      commit: body.commit ? String(body.commit) : null,
    });
    return receipt;
  });

  // ---------- Phase A/F-06: users & key lifecycle ----------
  const ROLES = ["OWNER", "PRINCIPAL", "ADMIN", "CTO", "TECH_LEAD", "ENGINEER", "QA", "SECURITY", "DEVOPS", "VIEWER", "AUDITOR"];

  app.post("/api/v1/users", async (req, reply) => {
    const me = ident(req);
    auth.requirePermission(me, "settings:write");
    const body = (req.body ?? {}) as Record<string, unknown>;
    requireFields(body, ["name", "role"]);
    if (!ROLES.includes(String(body.role))) {
      throw new AppError("VALIDATION_ERROR", `role must be one of ${ROLES.join(",")}`);
    }
    const id = cryptoRandomId("usr");
    ctx.db.insert("users", {
      id, org_id: me.orgId,
      email: `${id}@provisioned.local`,
      name: String(body.name), role: String(body.role),
      created_at: ctx.db.now(), updated_at: ctx.db.now(),
    });
    auditEvent(ctx, me, "user.created", "user", id, "high", { role: body.role, name: body.name });
    reply.code(201);
    return { id };
  });

  app.post("/api/v1/keys", async (req, reply) => {
    const me = ident(req);
    auth.requirePermission(me, "settings:write");
    const body = (req.body ?? {}) as Record<string, unknown>;
    requireFields(body, ["name", "role"]);
    if (!ROLES.includes(String(body.role))) {
      throw new AppError("VALIDATION_ERROR", `role must be one of ${ROLES.join(",")}`);
    }
    const created = auth.createKey(me.orgId, String(body.name), String(body.role));
    auditEvent(ctx, me, "key.created", "api_key", created.id, "critical", { name: body.name, role: body.role });
    reply.code(201);
    return { id: created.id, keyMaterial: created.keyMaterial }; // material shown ONCE
  });

  app.get("/api/v1/keys", async (req) => {
    const me = ident(req);
    auth.requirePermission(me, "settings:read");
    return { items: auth.listKeys(me.orgId) };
  });

  app.delete("/api/v1/keys/:id", async (req) => {
    const me = ident(req);
    auth.requirePermission(me, "settings:write");
    const { id } = req.params as { id: string };
    const ok = auth.revokeKey(me.orgId, id);
    if (!ok) throw new AppError("NOT_FOUND", "key not found or already revoked");
    auditEvent(ctx, me, "key.revoked", "api_key", id, "high");
    return { ok: true };
  });

  app.post("/api/v1/keys/:id/rotate", async (req, reply) => {
    const me = ident(req);
    auth.requirePermission(me, "settings:write");
    const { id } = req.params as { id: string };
    const rotated = auth.rotateKey(me.orgId, id);
    if (!rotated) throw new AppError("NOT_FOUND", "key not found or already revoked");
    auditEvent(ctx, me, "key.rotated", "api_key", id, "critical", { newKeyId: rotated.newKeyId });
    reply.code(201);
    return { newKeyId: rotated.newKeyId, keyMaterial: rotated.keyMaterial };
  });

  // ---------- auth sessions (audit Phase 1.2: httpOnly cookie) ----------
  const sessionSecure = () =>
    ctx.config.SESSION_COOKIE_SECURE || ctx.config.NODE_ENV === "production";

  app.post("/api/v1/auth/session", async (req, reply) => {
    // Requires a valid Bearer API key; produces a short-lived httpOnly session
    // token in a cookie so browsers never persist the raw key in storage.
    const me = ident(req);
    const ttlMs = Number((req.body as { ttlDays?: number } | undefined)?.ttlDays ?? 0) * 86_400_000 ||
      ctx.config.SESSION_TTL_MS;
    const session = auth.createSession(me, ttlMs);
    const secure = sessionSecure();
    reply.header("set-cookie", sessionCookieHeader(ctx.config.SESSION_COOKIE_NAME, session.token, ttlMs / 1000, secure));
    auditEvent(ctx, me, "auth.session_created", "auth_session", session.sessionId, "low", {
      ttlMs,
      secure,
      cookie: ctx.config.SESSION_COOKIE_NAME,
    });
    reply.code(201);
    return { sessionId: session.sessionId, expiresAt: session.expiresAt };
  });

  // Logout is unauthenticated (handled early in onRequest) so stale cookies can
  // always be cleared by the browser.
  app.delete("/api/v1/auth/session", async (req, reply) => {
    const cookieToken = readSessionCookie(req.headers.cookie, ctx.config.SESSION_COOKIE_NAME);
    if (cookieToken) {
      const revoked = auth.revokeSession(cookieToken);
      if (revoked) {
        ctx.audit.append({
          orgId: ctx.defaultOrgId(),
          actorType: "user",
          actorId: "session",
          action: "auth.session_revoked",
          resourceType: "auth_session",
          resourceId: "cookie",
          riskLevel: "low",
          decision: "allow",
          result: "success",
        });
      }
    }
    reply.header("set-cookie", clearSessionCookieHeader(ctx.config.SESSION_COOKIE_NAME));
    return { ok: true };
  });

  app.get("/api/v1/auth/session", async (req) => {
    const me = ident(req);
    return { active: true, role: me.role, name: me.name, orgId: me.orgId };
  });

  // ---------- OIDC/SSO (audit Phase 2: ADR-0007 IdentityProvider seam) ----------
  // The control plane consumes the IdP's tokens server-side and mints a normal
  // httpOnly session cookie; the browser never sees the IdP's tokens.
  function oidcCallbackUrl(req: FastifyRequest): string {
    if (ctx.config.OIDC_REDIRECT_URI) return ctx.config.OIDC_REDIRECT_URI;
    const proto = req.headers["x-forwarded-proto"] ?? (req.protocol || "http");
    const host = req.headers["x-forwarded-host"] ?? req.hostname;
    return `${proto}://${host}/api/v1/auth/oidc/callback`;
  }

  // Initiates the dance: redirects the browser to the IdP authorize endpoint.
  app.get("/api/v1/auth/oidc/login", async (req, reply) => {
    if (!oidc) throw new AppError("VALIDATION_ERROR", "OIDC is not enabled (OIDC_ENABLED=false)");
    const redirectUri = oidcCallbackUrl(req);
    const created = oidcStates.create(redirectUri);
    const location = await oidc.authorizationUrl(created.state, created.codeVerifier, created.nonce, redirectUri);
    auditEvent(ctx, { userId: "anonymous", orgId: ctx.defaultOrgId(), role: "VIEWER", name: "oidc-initiate", keyId: "none" },
      "auth.oidc_login_initiated", "auth", "/api/v1/auth/oidc/login", "low", { issuer: ctx.config.OIDC_ISSUER });
    reply.redirect(location);
    return reply;
  });

  // IdP callback: verify state/nonce + id_token, upsert the OIDC identity, and
  // land it in the dashboard with an httpOnly session cookie.
  app.get("/api/v1/auth/oidc/callback", async (req, reply) => {
    if (!oidc) throw new AppError("VALIDATION_ERROR", "OIDC is not enabled (OIDC_ENABLED=false)");
    const q = req.query as { code?: string; state?: string; error?: string };
    if (q.error) throw new AppError("UNAUTHENTICATED", `OIDC authorization failed: ${q.error}`);
    if (!q.code || !q.state) throw new AppError("VALIDATION_ERROR", "missing code or state");
    const rec = oidcStates.consume(q.state);
    const tokenResult = await oidc.exchangeCode(q.code, rec.codeVerifier, rec.redirectUri);
    const claims = await oidc.verifyIdToken(tokenResult.idToken, rec.nonce);

    const sub = String(claims.sub);
    const role = extractClaim(claims, ctx.config.OIDC_ROLE_CLAIM, "VIEWER");
    const orgClaim = extractClaim(claims, ctx.config.OIDC_ORG_CLAIM, undefined);
    const orgId = orgClaim && ctx.db.get("SELECT id FROM organizations WHERE id = ?", [orgClaim])
      ? String(orgClaim)
      : ctx.defaultOrgId();
    const email = typeof claims.email === "string" ? claims.email : undefined;
    const name = typeof claims.name === "string" ? claims.name : (email ?? sub);
    const now = ctx.db.now();
    const existing = ctx.db.get<{ id: string }>("SELECT id FROM oidc_users WHERE sub = ?", [sub]);
    if (existing) {
      ctx.db.run("UPDATE oidc_users SET org_id=?, role=?, name=?, email=?, updated_at=?, last_login_at=? WHERE id=?",
        [orgId, role, name, email ?? null, now, now, existing.id]);
    } else {
      const id = cryptoRandomId("oidc");
      ctx.db.insert("oidc_users", {
        id, sub, email: email ?? null, name, org_id: orgId, role,
        created_at: now, updated_at: now, last_login_at: now,
      });
    }

    const identity: Identity = { userId: `oidc:${sub}`, orgId, role: role ?? "VIEWER", name, keyId: `oidc:${sub.slice(0, 24)}` };
    const session = auth.createSession(identity);
    const secure = sessionSecure();
    reply.header("set-cookie", sessionCookieHeader(ctx.config.SESSION_COOKIE_NAME, session.token, ctx.config.SESSION_TTL_MS / 1000, secure));
    auditEvent(ctx, identity, "auth.oidc_logged_in", "auth_session", session.sessionId, "low", {
      issuer: ctx.config.OIDC_ISSUER, role, orgId, sso: true,
    });
    const home = req.headers["x-forwarded-proto"] ?? req.protocol;
    const host = req.headers["x-forwarded-host"] ?? req.hostname;
    reply.redirect(`${home}://${host}/`);
    return reply;
  });

  // ---------- Phase 41: notifications ----------
  function pushNotification(ctx2: AppContext, orgId2: string, topic: string, payloadObj: Record<string, unknown>): void {
    ctx2.db.insert("notifications", {
      id: cryptoRandomId("ntf"), org_id: orgId2,
      channel: "inbox", topic,
      payload: JSON.stringify(payloadObj),
      created_at: ctx2.db.now(),
    });
  }

  app.get("/api/v1/notifications", async (req) => {
    const me = ident(req);
    auth.requirePermission(me, "project:read");
    const q = req.query as { limit?: string; unread?: string };
    const limit = Math.min(100, Number(q.limit ?? 50));
    const where = q.unread === "true" ? "AND read_at IS NULL" : "";
    return {
      items: ctx.db.all(
        `SELECT id, topic, payload, read_at, created_at FROM notifications
         WHERE org_id = ? ${where} ORDER BY created_at DESC LIMIT ?`,
        [me.orgId, limit]
      ),
      unreadCount: Number((ctx.db.get<{ n: number }>(
        "SELECT COUNT(*) AS n FROM notifications WHERE org_id=? AND read_at IS NULL",
        [me.orgId]
      ) ?? { n: 0 }).n),
    };
  });

  app.post("/api/v1/notifications/:id/read", async (req) => {
    const me = ident(req);
    auth.requirePermission(me, "project:read");
    const { id } = req.params as { id: string };
    ctx.db.run("UPDATE notifications SET read_at = ? WHERE id = ? AND org_id = ? AND read_at IS NULL",
      [ctx.db.now(), id, me.orgId]);
    return { ok: true };
  });

  app.post("/api/v1/notifications/read-all", async (req) => {
    const me = ident(req);
    auth.requirePermission(me, "project:read");
    ctx.db.run("UPDATE notifications SET read_at = ? WHERE org_id = ? AND read_at IS NULL", [ctx.db.now(), me.orgId]);
    return { ok: true };
  });

  // ---------- agents ----------
  app.get("/api/v1/agents", async (req) => {
    const me = ident(req);
    auth.requirePermission(me, "agent:read");
    return { items: ctx.agents.list(me.orgId) };
  });

  app.post("/api/v1/agents/seed", async (req) => {
    const me = ident(req);
    auth.requirePermission(me, "agent:manage");
    const n = ctx.agents.seedRoster(me.orgId);
    return { seeded: n, rosterSize: ctx.agents.list(me.orgId).length };
  });

  // ---------- capability routing (Phase 2: auditable agent dispatch) ----------
  const rosterProfiles = (orgId: string) =>
    ctx.agents.list(orgId).map((row) => {
      const c = AgentRegistry.parseContract(row);
      return {
        name: String(row.name),
        allowedTools: c.allowedTools as ToolId[],
        forbiddenTools: c.forbiddenTools as ToolId[],
        modelTier: c.modelTier as ModelTier,
        budgetUsd: c.budgetUsd,
        skills: c.skills,
      };
    });

  app.post("/api/v1/routing/decide", async (req, reply) => {
    const me = ident(req);
    auth.requirePermission(me, "task:dispatch");
    const body = (req.body ?? {}) as Record<string, unknown>;
    requireFields(body, ["requiredCapabilities"]);
    const capabilities = (body.requiredCapabilities as string[] ?? []);
    const unknown = capabilities.filter((c) => !(CAPABILITY_IDS as readonly string[]).includes(c));
    if (unknown.length > 0) {
      throw new AppError("VALIDATION_ERROR", `unknown capability: ${unknown.join(", ")}`, { details: { unknown } });
    }
    const risk = body.risk === undefined ? undefined : String(body.risk) as "low" | "medium" | "high";
    const decision = new CapabilityRouter().route({
      requiredCapabilities: capabilities,
      preferredAgent: body.preferredAgent !== undefined ? String(body.preferredAgent) : undefined,
      risk,
      roster: rosterProfiles(me.orgId),
      requiredTools: Array.isArray(body.requiredTools) ? (body.requiredTools as string[]) as ToolId[] : undefined,
    });
    const id = cryptoRandomId("rtd");
    ctx.db.insert("routing_decisions", {
      id,
      org_id: me.orgId,
      task_id: body.taskId !== undefined ? String(body.taskId) : null,
      mission_id: body.missionId !== undefined ? String(body.missionId) : null,
      required_capabilities: JSON.stringify(capabilities),
      preferred_agent: decision.preferredAgent ?? null,
      risk: risk ?? null,
      primary_agent_id: decision.primaryAgentId,
      candidates_json: JSON.stringify(decision.candidates),
      why_agent_selected: decision.whyAgentSelected,
      policy_version: decision.policyVersion,
      created_by: me.userId,
      created_at: ctx.db.now(),
    });
    auditEvent(ctx, me, "routing.decided", "routing_decision", id, "medium", {
      primaryAgentId: decision.primaryAgentId,
      candidates: decision.candidates.length,
    });
    reply.code(201);
    return { id, decision };
  });

  app.get("/api/v1/routing/decisions", async (req) => {
    const me = ident(req);
    auth.requirePermission(me, "execution:read");
    return {
      items: ctx.db.all(
        "SELECT id, task_id, mission_id, required_capabilities, preferred_agent, risk, primary_agent_id, candidates_json, why_agent_selected, policy_version, created_at FROM routing_decisions WHERE org_id=? ORDER BY created_at DESC LIMIT 100",
        [me.orgId]
      ),
    };
  });

  // ---------- roster reachability (Phase 2: every agent reachable) ----------
  app.get("/api/v1/agents/reachability", async (req) => {
    const me = ident(req);
    auth.requirePermission(me, "agent:read");
    const report = computeReachability({
      skills: ctx.skills.list().map((s) => s.name),
      workflowTemplates: ctx.workflowTemplates.list(),
    });
    return {
      total: report.total,
      reachableCount: report.reachableCount,
      unreachable: report.unreachable,
      items: report.items.map((i) => ({ agentId: i.agentId, reachable: i.reachable, via: i.via })),
    };
  });

  // ---------- skills (audit Phase 1: skill loader shipped; Phase 4: org overrides) ----------
  app.get("/api/v1/skills", async (req) => {
    const me = ident(req);
    auth.requirePermission(me, "agent:read");
    const skills = ctx.skills.list().map((s) => {
      const eff = effectiveSkill(ctx, me.orgId, s.name);
      return {
        name: eff.name,
        version: eff.version,
        description: eff.description,
        requiredTools: eff.requiredTools,
        requiredPermissions: eff.requiredPermissions,
        overridden: eff !== s,
      };
    });
    const skillsByAgent: Record<string, string[]> = {};
    for (const a of ctx.db.all(
      "SELECT name, skills FROM agents WHERE org_id = ? AND skills != '[]'",
      [me.orgId]
    )) {
      skillsByAgent[String(a.name)] = safeJson(String(a.skills ?? "[]")) as string[];
    }
    const orgOverrides = ctx.db.all(
      "SELECT skill_name, enabled FROM org_skill_overrides WHERE org_id = ? ORDER BY skill_name",
      [me.orgId]
    );
    return {
      count: skills.length,
      registryIssues: ctx.skills.issues,
      skillsByAgent,
      orgOverrides: orgOverrides.map((o) => ({
        skillName: String(o.skill_name),
        enabled: Number(o.enabled) === 1,
      })),
      items: skills,
    };
  });

  app.get("/api/v1/skills/:name", async (req) => {
    const me = ident(req);
    auth.requirePermission(me, "agent:read");
    const { name } = req.params as { name: string };
    const effective = effectiveSkill(ctx, me.orgId, name);
    return { ...effective, overridden: effective !== ctx.skills.get(name) };
  });

  app.put("/api/v1/skills/overrides/:name", async (req) => {
    const me = ident(req);
    auth.requirePermission(me, "agent:manage");
    const { name } = req.params as { name: string };
    const body = (req.body ?? {}) as Record<string, unknown>;
    requireFields(body, ["definition"]);
    // Only existing registry skills can be customized — creates stay declarative.
    const base = ctx.skills.get(name);
    const parsed = parseOverrideDefinition(String(body.definition));
    const errors = validateSkill(parsed);
    if (errors.length > 0) {
      throw new AppError("VALIDATION_ERROR", `override for skill '${name}' is invalid: ${errors.join("; ")}`, {
        details: { errors },
      });
    }
    const override = parsed as Partial<Skill>;
    if (override.name !== base.name) {
      throw new AppError("VALIDATION_ERROR", "override definition name must match the overridden skill");
    }
    const enabled = body.enabled === undefined ? true : Boolean(body.enabled);
    const now = ctx.db.now();
    ctx.db.run(
      `INSERT INTO org_skill_overrides (org_id, skill_name, definition, enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(org_id, skill_name) DO UPDATE SET
         definition = excluded.definition, enabled = excluded.enabled, updated_at = excluded.updated_at`,
      [me.orgId, name, String(body.definition), enabled ? 1 : 0, now, now]
    );
    auditEvent(ctx, me, "skill.override_upsert", "skill_override", `${me.orgId}/${name}`, "medium", {
      enabled,
    });
    return { ok: true, skillName: name, enabled, overridden: true };
  });

  app.delete("/api/v1/skills/overrides/:name", async (req) => {
    const me = ident(req);
    auth.requirePermission(me, "agent:manage");
    const { name } = req.params as { name: string };
    const res = ctx.db.driver.run("DELETE FROM org_skill_overrides WHERE org_id = ? AND skill_name = ?", [
      me.orgId,
      name,
    ]);
    auditEvent(ctx, me, "skill.override_delete", "skill_override", `${me.orgId}/${name}`, "medium", {});
    return { ok: true, skillName: name, removed: Number(res.changes) > 0 };
  });

  // ---------- skill feedback loop (audit Phase 4: skill_executions metrics) ----------
  const SKILL_OUTCOMES = new Set(["success", "failed", "skipped"]);
  app.post("/api/v1/skills/executions", async (req) => {
    const me = ident(req);
    auth.requirePermission(me, "execution:control");
    const body = (req.body ?? {}) as Record<string, unknown>;
    requireFields(body, ["skillName", "outcome"]);
    const skillName = String(body.skillName);
    const outcome = String(body.outcome);
    if (!SKILL_OUTCOMES.has(outcome)) {
      throw new AppError("VALIDATION_ERROR", `outcome must be one of: ${[...SKILL_OUTCOMES].join(", ")}`);
    }
    if (!ctx.skills.has(skillName)) {
      throw new AppError("VALIDATION_ERROR", `skill '${skillName}' is not registered`);
    }
    const startedAt = ctx.db.now();
    const id = cryptoRandomId("skx");
    ctx.db.insert("skill_executions", {
      id,
      org_id: me.orgId,
      skill_name: skillName,
      task_id: body.taskId ? String(body.taskId) : null,
      outcome,
      duration_ms: body.durationMs === undefined ? null : Number(body.durationMs),
      cost_usd: body.costUsd === undefined ? null : Number(body.costUsd),
      error: body.error ? String(body.error).slice(0, 4000) : null,
      started_at: startedAt,
      finished_at: startedAt,
    });
    return { ok: true, id };
  });

  app.get("/api/v1/skills/executions/stats", async (req) => {
    const me = ident(req);
    auth.requirePermission(me, "execution:read");
    const rows = ctx.db.all<{
      skill_name: string;
      outcome: string;
      n: number;
      avg_duration_ms: number | null;
      sum_cost_usd: number | null;
    }>(
      `SELECT skill_name, outcome, COUNT(*) AS n,
              AVG(duration_ms) AS avg_duration_ms, SUM(cost_usd) AS sum_cost_usd
       FROM skill_executions WHERE org_id = ? GROUP BY skill_name, outcome`,
      [me.orgId]
    );
    const bySkill: Record<string, Record<string, number | string>> = {};
    const totals = { success: 0, failed: 0, skipped: 0, costUsd: 0, executions: 0 };
    for (const r of rows) {
      const key = r.outcome as "success" | "failed" | "skipped";
      const entry = (bySkill[r.skill_name] ??= {});
      entry[key] = Number(r.n);
      totals[key] += Number(r.n);
      totals.executions += Number(r.n);
      totals.costUsd += Number(r.sum_cost_usd ?? 0);
      if (r.avg_duration_ms !== null && entry.avgDurationMs === undefined) {
        entry.avgDurationMs = Math.round(Number(r.avg_duration_ms));
      }
    }
    return { bySkill, totals, orgId: me.orgId };
  });

  app.get("/api/v1/skills/executions", async (req) => {
    const me = ident(req);
    auth.requirePermission(me, "execution:read");
    const q = req.query as { limit?: string; skillName?: string };
    const limit = Math.min(200, Math.max(1, Number(q.limit ?? 50)));
    const items = q.skillName
      ? ctx.db.all(
          "SELECT id, skill_name, task_id, outcome, duration_ms, cost_usd, started_at FROM skill_executions WHERE org_id = ? AND skill_name = ? ORDER BY started_at DESC LIMIT ?",
          [me.orgId, String(q.skillName), limit]
        )
      : ctx.db.all(
          "SELECT id, skill_name, task_id, outcome, duration_ms, cost_usd, started_at FROM skill_executions WHERE org_id = ? ORDER BY started_at DESC LIMIT ?",
          [me.orgId, limit]
        );
    return { count: items.length, items };
  });

  // ---------- evidence registry (Phase 2: no completion claim without evidence) ----------
  app.post("/api/v1/evidence", async (req, reply) => {
    const me = ident(req);
    auth.requirePermission(me, "execution:control");
    const body = (req.body ?? {}) as Record<string, unknown>;
    requireFields(body, ["type", "source"]);
    const type = String(body.type);
    const source = String(body.source);
    const claims = Array.isArray(body.claims) ? (body.claims as string[]).map(String) : [];
    const content = body.content !== undefined ? String(body.content) : undefined;
    let contentHash = body.contentHash !== undefined ? String(body.contentHash) : undefined;
    if (content !== undefined) {
      const computed = hashContent(content);
      if (contentHash !== undefined && contentHash !== computed) {
        throw new AppError("VALIDATION_ERROR", "contentHash does not match supplied content", {
          details: { supplied: contentHash, computed },
        });
      }
      contentHash = computed;
    }
    if (!contentHash) {
      throw new AppError("VALIDATION_ERROR", "either content (computed hash) or contentHash is required");
    }
    const id = cryptoRandomId("evd");
    ctx.db.insert("evidence_records", {
      id, org_id: me.orgId,
      execution_id: body.executionId !== undefined ? String(body.executionId) : null,
      type, source, content_hash: contentHash,
      claims: JSON.stringify(claims),
      content_location: body.contentLocation !== undefined ? String(body.contentLocation) : null,
      created_at: ctx.db.now(),
    });
    // Evidence guard: claims with a known evidence contract that no matching
    // record exists for yet are surfaced immediately.
    const existingTypes = ctx.db
      .all<{ type: string }>("SELECT DISTINCT type FROM evidence_records WHERE org_id = ?", [me.orgId])
      .map((r) => String(r.type));
    const unbackedNow = unbackedCompletionClaims(claims, existingTypes);
    auditEvent(ctx, me, "evidence.recorded", "evidence", id, "low", { type, unbackedNow });
    reply.code(201);
    return { id, contentHash, unbackedNow };
  });

  app.get("/api/v1/evidence", async (req) => {
    const me = ident(req);
    auth.requirePermission(me, "execution:read");
    const rows = ctx.db.all(
      "SELECT id, execution_id, type, source, content_hash, claims, content_location, created_at FROM evidence_records WHERE org_id=? ORDER BY created_at DESC LIMIT 200",
      [me.orgId]
    );
    const summary = summarizeEvidence(rows as never);
    return {
      count: rows.length,
      summary,
      items: rows.map((r) => ({
        id: String(r.id),
        executionId: r.execution_id,
        type: String(r.type),
        source: String(r.source),
        contentHash: String(r.content_hash),
        claims: safeJson(String(r.claims ?? "[]")),
        contentLocation: r.content_location,
        createdAt: String(r.created_at),
      })),
    };
  });

  app.post("/api/v1/evidence/:id/verify", async (req, reply) => {
    const me = ident(req);
    auth.requirePermission(me, "execution:read");
    const { id } = req.params as { id: string };
    const row = ctx.db.get(
      "SELECT id, type, source, content_hash, claims FROM evidence_records WHERE org_id=? AND id=?",
      [me.orgId, id]
    );
    if (!row) throw new AppError("NOT_FOUND", `evidence record ${id} not found`);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const verification = verifyRecord({
      id,
      content: body.content !== undefined ? String(body.content) : undefined,
      contentHash: String(row.content_hash),
    });
    reply.code(200);
    return { ...verification, type: String(row.type), source: String(row.source) };
  });

  // ---------- typed handoff contracts (Phase 2: what/was/remains + confidence) ----------
  app.post("/api/v1/handoffs", async (req, reply) => {
    const me = ident(req);
    auth.requirePermission(me, "task:dispatch");
    const body = (req.body ?? {}) as Record<string, unknown>;
    requireFields(body, ["sender", "receiver", "intent", "payload", "confidence"]);
    const handoff: Partial<AgentHandoff> = {
      sender: String(body.sender),
      receiver: String(body.receiver),
      intent: String(body.intent) as AgentHandoff["intent"],
      payload: body.payload as Record<string, unknown>,
      evidence: Array.isArray(body.evidence) ? (body.evidence as string[]).map(String) : [],
      confidence: Number(body.confidence),
      assumptions: Array.isArray(body.assumptions) ? (body.assumptions as string[]).map(String) : [],
      unresolvedQuestions: Array.isArray(body.unresolvedQuestions) ? (body.unresolvedQuestions as string[]).map(String) : [],
      missionId: body.missionId !== undefined ? String(body.missionId) : undefined,
      executionId: body.executionId !== undefined ? String(body.executionId) : undefined,
    };
    const errors = validateHandoff(handoff);
    if (errors.length > 0) {
      throw new AppError("VALIDATION_ERROR", "handoff contract invalid", { details: { errors } });
    }
    const confidence = Number(body.confidence);
    const policy = verificationPolicyFor(confidence, DEFAULT_VERIFICATION_THRESHOLDS);
    const id = cryptoRandomId("hnd");
    ctx.db.insert("agent_handoffs", {
      id,
      org_id: me.orgId,
      mission_id: handoff.missionId ?? null,
      execution_id: handoff.executionId ?? null,
      sender: handoff.sender,
      receiver: handoff.receiver,
      intent: handoff.intent,
      payload: JSON.stringify(handoff.payload),
      evidence: JSON.stringify(handoff.evidence),
      confidence,
      assumptions: JSON.stringify(handoff.assumptions),
      unresolved_questions: JSON.stringify(handoff.unresolvedQuestions),
      created_at: ctx.db.now(),
    });
    auditEvent(ctx, me, "handoff.recorded", "handoff", id, "medium", {
      sender: handoff.sender,
      receiver: handoff.receiver,
      intent: handoff.intent,
      suggestedPolicy: policy,
    });
    reply.code(201);
    return { id, suggestedPolicy: policy };
  });

  app.get("/api/v1/handoffs", async (req) => {
    const me = ident(req);
    auth.requirePermission(me, "execution:read");
    const q = req.query as { receiver?: string };
    const params: unknown[] = [me.orgId];
    let sql = "SELECT id, mission_id, execution_id, sender, receiver, intent, confidence, evidence, assumptions, unresolved_questions, created_at FROM agent_handoffs WHERE org_id=?";
    if (q.receiver) {
      sql += " AND receiver=?";
      params.push(String(q.receiver));
    }
    sql += " ORDER BY created_at DESC LIMIT 100";
    return {
      items: ctx.db.all(sql, params).map((r) => ({
        id: String(r.id),
        missionId: r.mission_id,
        executionId: r.execution_id,
        sender: String(r.sender),
        receiver: String(r.receiver),
        intent: String(r.intent),
        confidence: Number(r.confidence),
        evidence: safeJson(String(r.evidence ?? "[]")),
        assumptions: safeJson(String(r.assumptions ?? "[]")),
        unresolvedQuestions: safeJson(String(r.unresolved_questions ?? "[]")),
        createdAt: String(r.created_at),
      })),
    };
  });

  // ---------- skill runtime execution (Phase 2: enforce, don't just declare) ----------
  app.post("/api/v1/skills/runtime/execute", async (req, reply) => {
    const me = ident(req);
    auth.requirePermission(me, "execution:control");
    const body = (req.body ?? {}) as Record<string, unknown>;
    requireFields(body, ["skillName"]);
    const skillName = String(body.skillName);
    const skill = effectiveSkill(ctx, me.orgId, skillName);
    const claims = Array.isArray(body.claims) ? (body.claims as string[]).map(String) : [];
    const started = ctx.db.now();
    const runtime = new SkillRuntime();
    const executionId = cryptoRandomId("skx");
    const result = await runtime.execute(skill, {
      input: (body.input ?? {}) as Record<string, unknown>,
      timeoutMs: body.timeoutMs !== undefined ? Number(body.timeoutMs) : 30_000,
      hooks: {
        // Deterministic harness: provider execution is a slot; the runtime
        // enforces the orchestration contract (preconditions, steps, rubric).
        runStep: async (step, context, i) => {
          context["_dispatched"] = true;
          return { [`step_${i}`]: step };
        },
        verify: async (output) => {
          const rubricOk = evaluateRubric(skill.verification, output);
          if (!rubricOk) return { ok: false, notes: `rubric not satisfied: ${skill.verification}` };
          const available = ctx.db
            .all<{ type: string }>("SELECT DISTINCT type FROM evidence_records WHERE org_id = ?", [me.orgId])
            .map((r) => String(r.type));
          const unbacked = unbackedCompletionClaims(claims, available);
          if (unbacked.length > 0) {
            return { ok: false, notes: `evidence_required: ${unbacked.join(", ")}` };
          }
          return { ok: true };
        },
      },
    });
    ctx.db.insert("skill_executions", {
      id: executionId,
      org_id: me.orgId,
      skill_name: skillName,
      task_id: body.taskId !== undefined ? String(body.taskId) : null,
      outcome: result.ok ? "success" : "failed",
      duration_ms: Math.round(result.durationMs),
      cost_usd: result.budgetUsd ?? null,
      error: result.ok ? null : `${result.failureClass}: ${result.failureMessage}`.slice(0, 4000),
      started_at: started,
      finished_at: ctx.db.now(),
    });
    auditEvent(ctx, me, "skill.runtime_executed", "skill", skillName, "medium", {
      ok: result.ok,
      failureClass: result.failureClass,
      escalatedTo: result.escalatedTo,
      attempts: result.attempts,
    });
    reply.code(result.ok ? 200 : 422);
    return {
      id: executionId,
      ok: result.ok,
      result,
    };
  });

  // ---------- agent-to-agent protocol (audit Phase 4: TaskCards v0.1) ----------
  const A2A_STATUSES = new Set(["received", "accepted", "working", "completed", "failed", "cancelled"]);
  const requireA2A = (): void => {
    if (!ctx.config.FEATURE_A2A) {
      throw new AppError("NOT_FOUND", "A2A protocol is disabled (FEATURE_A2A=false)");
    }
  };

  app.post("/api/v1/a2a/cards", async (req, reply) => {
    requireA2A();
    const me = ident(req);
    auth.requirePermission(me, "execution:control");
    const body = (req.body ?? {}) as Record<string, unknown>;
    requireFields(body, ["direction", "payload"]);
    const direction = String(body.direction);
    if (direction !== "inbound" && direction !== "outbound") {
      throw new AppError("VALIDATION_ERROR", "direction must be 'inbound' or 'outbound'");
    }
    const id = cryptoRandomId("a2a");
    const status = String(body.status ?? "received");
    if (!A2A_STATUSES.has(status)) {
      throw new AppError("VALIDATION_ERROR", `status must be one of: ${[...A2A_STATUSES].join(", ")}`);
    }
    const now = ctx.db.now();
    ctx.db.insert("a2a_cards", {
      id,
      org_id: me.orgId,
      direction,
      status,
      card_json: JSON.stringify(body.payload),
      partner: body.partner ? String(body.partner).slice(0, 256) : null,
      ack_token: body.ackToken ? String(body.ackToken) : null,
      created_at: now,
      updated_at: now,
    });
    auditEvent(ctx, me, "a2a.card_created", "a2a_card", id, "medium", { direction, status });
    reply.code(201);
    return { id, direction, status, ackToken: body.ackToken ? String(body.ackToken) : null };
  });

  app.get("/api/v1/a2a/cards", async (req) => {
    requireA2A();
    const me = ident(req);
    auth.requirePermission(me, "execution:read");
    const q = req.query as { limit?: string; direction?: string; status?: string };
    const limit = Math.min(200, Math.max(1, Number(q.limit ?? 50)));
    const clauses = ["org_id = ?"];
    const params: unknown[] = [me.orgId];
    if (q.direction) {
      clauses.push("direction = ?");
      params.push(String(q.direction));
    }
    if (q.status) {
      clauses.push("status = ?");
      params.push(String(q.status));
    }
    params.push(limit);
    const items = ctx.db.all(
      `SELECT id, direction, status, partner, card_json, created_at, updated_at
       FROM a2a_cards WHERE ${clauses.join(" AND ")} ORDER BY created_at DESC LIMIT ?`,
      params
    );
    return {
      count: items.length,
      protocol: "TaskCard v0.1",
      items: items.map((c) => ({ ...c, payload: safeJson(String(c.card_json)) })),
    };
  });

  app.get("/api/v1/a2a/cards/:id", async (req) => {
    requireA2A();
    const me = ident(req);
    auth.requirePermission(me, "execution:read");
    const { id } = req.params as { id: string };
    const card = ctx.db.get("SELECT * FROM a2a_cards WHERE id = ? AND org_id = ?", [id, me.orgId]);
    if (!card) throw new AppError("NOT_FOUND", "a2a card not found");
    return { ...card, payload: safeJson(String(card.card_json)) };
  });

  app.post("/api/v1/a2a/cards/:id/status", async (req) => {
    requireA2A();
    const me = ident(req);
    auth.requirePermission(me, "execution:control");
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as Record<string, unknown>;
    requireFields(body, ["status"]);
    const status = String(body.status);
    if (!A2A_STATUSES.has(status)) {
      throw new AppError("VALIDATION_ERROR", `status must be one of: ${[...A2A_STATUSES].join(", ")}`);
    }
    const card = ctx.db.get<{
      id: string;
      org_id: string;
      direction: string;
      status: string;
      ack_token: string | null;
    }>("SELECT id, org_id, direction, status, ack_token FROM a2a_cards WHERE id = ? AND org_id = ?", [
      id,
      me.orgId,
    ]);
    if (!card) throw new AppError("NOT_FOUND", "a2a card not found");
    const now = ctx.db.now();
    const patch: Record<string, unknown> = { status, updated_at: now };
    if (status === "accepted" && !card.ack_token) {
      patch.ack_token = newToken(16);
    }
    ctx.db.updateById("a2a_cards", id, patch);
    auditEvent(ctx, me, "a2a.card_status", "a2a_card", id, "medium", { from: card.status, to: status });
    const updated = ctx.db.get<{ ack_token: string | null }>(
      "SELECT ack_token FROM a2a_cards WHERE id = ? AND org_id = ?",
      [id, me.orgId]
    );
    return { id, status, ackToken: updated?.ack_token ?? null };
  });

  app.post("/api/v1/agents/:id/heartbeat", async (req) => {
    const me = ident(req);
    auth.requirePermission(me, "execution:control");
    const { id } = req.params as { id: string };
    ctx.agents.heartbeat(me.orgId, id);
    return { ok: true };
  });

  app.post("/api/v1/agents/:id/status", async (req) => {
    const me = ident(req);
    auth.requirePermission(me, "agent:manage");
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as Record<string, unknown>;
    requireFields(body, ["status"]);
    ctx.agents.setStatus(me.orgId, id, String(body.status) as never);
    auditEvent(ctx, me, "agent.status_changed", "agent", id, "medium", { status: body.status });
    return { ok: true };
  });

  // ---------- autonomous delivery runs ----------
  app.post("/api/v1/delivery/runs", async (req, reply) => {
    const me = ident(req);
    auth.requirePermission(me, "task:dispatch");
    const body = (req.body ?? {}) as Record<string, unknown>;
    requireFields(body, ["taskId"]);

    const task = ctx.db.get<{ org_id: string; project_id: string; description: string; status: string }>(
      "SELECT org_id, project_id, description, status FROM tasks WHERE id=? AND org_id=?",
      [String(body.taskId), me.orgId]
    );
    if (!task) throw new AppError("NOT_FOUND", "task not found");

    // Phase A/F-07: demo flags are dev-only
    assertDeliveryDemoFlags(ctx.config as unknown as { NODE_ENV?: string }, body);

    let spec: { kind?: string };
    try {
      spec = JSON.parse(String(task.description));
    } catch {
      spec = {};
    }
    if (spec.kind !== "delivery") {
      throw new AppError("VALIDATION_ERROR", "task description must be DeliverySpec JSON (kind=delivery)");
    }

    // Client-supplied idempotency: same key returns the original run (A/F-02).
    const idemKey = body.idempotencyKey ? String(body.idempotencyKey) : null;
    const execId = cryptoRandomId("exe");
    const traceId = cryptoRandomId("trc");
    const dispatchResponse = { executionId: execId, traceId, status: "queued" };
    if (idemKey) {
      const existing = ctx.db.get<{ response_hash: string }>(
        "SELECT response_hash FROM idempotency_keys WHERE org_id=? AND scope=? AND key=?",
        [me.orgId, "delivery.dispatch", idemKey]
      );
      if (existing) {
        reply.code(200);
        return JSON.parse(String(existing.response_hash)) as Record<string, unknown>;
      }
      if (!atomicIdempotencyPut(ctx, {
        orgId: me.orgId, scope: "delivery.dispatch", key: idemKey, response: dispatchResponse,
      })) {
        reply.code(200);
        const winner = ctx.db.get<{ response_hash: string }>(
          "SELECT response_hash FROM idempotency_keys WHERE org_id=? AND scope=? AND key=?",
          [me.orgId, "delivery.dispatch", idemKey]
        );
        return JSON.parse(String(winner!.response_hash)) as Record<string, unknown>;
      }
    }
    // Resolve a REAL agent row (FK) — default to backend-engineer.
    let agentFk: string | null = body.agentId ? String(body.agentId) : null;
    if (!agentFk || !ctx.db.get("SELECT id FROM agents WHERE id=?", [agentFk])) {
      const eng = ctx.db.get<{ id: string }>(
        "SELECT id FROM agents WHERE org_id=? AND role='ENGINEERING' ORDER BY name LIMIT 1",
        [me.orgId]
      );
      if (!eng) throw new AppError("DEPENDENCY_UNAVAILABLE", "no engineering agent seeded");
      agentFk = String(eng.id);
    }
    ctx.db.insert("executions", {
      id: execId, org_id: me.orgId,
      task_id: String(body.taskId),
      agent_id: agentFk,
      status: "queued",
      attempt: 1,
      trace_id: traceId,
      created_at: ctx.db.now(),
    });
    ctx.jobs.enqueue({
      orgId: me.orgId,
      type: "deliver_task",
      data: {
        executionId: execId,
        taskId: String(body.taskId),
        injectFault: Boolean(body.injectFault),
        maxRepairAttempts: body.maxRepairAttempts ? Number(body.maxRepairAttempts) : 2,
        testsTimeoutMs: body.testsTimeoutMs ? Number(body.testsTimeoutMs) : undefined,
      },
      idempotencyKey: `delivery:${execId}`,
    });
    auditEvent(ctx, me, "delivery.dispatched", "execution", execId, "high");
    publishEvent(ctx, me.orgId, me, "DeliveryStarted", { executionId: execId, taskId: body.taskId });
    pushNotification(ctx, me.orgId, "delivery.started", { executionId: execId, taskId: body.taskId });
    reply.code(202);
    return { executionId: execId, traceId, status: "queued" };
  });

  // ---------- scraping (deterministic crawler worker) ----------
  app.post("/api/v1/scrape", async (req, reply) => {
    const me = ident(req);
    auth.requirePermission(me, "scrape:create");
    const body = (req.body ?? {}) as Record<string, unknown>;
    requireFields(body, ["url"]);

    const url = String(body.url);
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new AppError("VALIDATION_ERROR", "url must be an absolute http(s) URL");
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new AppError("VALIDATION_ERROR", "url must be http(s)");
    }

    const jobId = cryptoRandomId("scr");
    const config = {
      seeds: [url],
      render: (String(body.render ?? "auto")) as "auto" | "static" | "js",
      extract: (String(body.extract ?? "auto")) as "css" | "auto" | "llm" | "meta",
      depth: body.depth != null ? Number(body.depth) : 0,
      maxPages: body.maxPages != null ? Number(body.maxPages) : 25,
      followLinks: body.followLinks != null ? Boolean(body.followLinks) : true,
      respectRobots: body.respectRobots != null ? Boolean(body.respectRobots) : true,
      redactPii: body.redactPii != null ? Boolean(body.redactPii) : true,
      politenessDelayMs: body.politenessDelayMs != null ? Number(body.politenessDelayMs) : 500,
      rules: Array.isArray(body.rules) ? (body.rules as never) : undefined,
      proxyUrl: body.proxyUrl ? String(body.proxyUrl) : undefined,
      tenantId: me.orgId,
    };

    ctx.db.insert("scrape_jobs", {
      id: jobId,
      org_id: me.orgId,
      created_by: me.userId,
      seed_url: url,
      config_json: JSON.stringify(config),
      status: "queued",
      created_at: ctx.db.now(),
    });

    ctx.jobs.enqueue({
      orgId: me.orgId,
      type: "scrape_task",
      data: { jobId },
      idempotencyKey: `scrape:${jobId}`,
    });

    auditEvent(ctx, me, "scrape.submitted", "scrape_job", jobId, "medium", { url, depth: config.depth });
    publishEvent(ctx, me.orgId, me, "ScrapeSubmitted", { jobId, url });
    reply.code(202);
    return { jobId, status: "queued" };
  });

  app.get("/api/v1/scrape", async (req) => {
    const me = ident(req);
    auth.requirePermission(me, "scrape:read");
    const q = req.query as { limit?: string };
    const items = ctx.db.all(
      `SELECT id, seed_url, status, created_at, finished_at
         FROM scrape_jobs WHERE org_id = ? ORDER BY created_at DESC LIMIT ?`,
      [me.orgId, Math.min(200, Number(q.limit ?? 50))]
    );
    return { items };
  });

  app.get("/api/v1/scrape/:id", async (req) => {
    const me = ident(req);
    auth.requirePermission(me, "scrape:read");
    const { id } = req.params as { id: string };
    const row = ctx.db.get<{
      id: string; org_id: string; seed_url: string; status: string;
      config_json: string; result_json: string | null; error: string | null;
      created_at: string; finished_at: string | null;
    }>("SELECT * FROM scrape_jobs WHERE id=? AND org_id=?", [id, me.orgId]);
    if (!row) throw new AppError("NOT_FOUND", "scrape job not found");
    return {
      id: row.id,
      seedUrl: row.seed_url,
      status: row.status,
      config: JSON.parse(row.config_json),
      result: row.result_json ? JSON.parse(row.result_json) : null,
      error: row.error,
      createdAt: row.created_at,
      finishedAt: row.finished_at,
    };
  });

  // Recent autonomous delivery runs (dashboard Delivery page).
  app.get("/api/v1/delivery/runs", async (req) => {
    const me = ident(req);
    auth.requirePermission(me, "execution:read");
    const q = req.query as { limit?: string };
    const items = ctx.db.all(
      `SELECT e.id AS executionId, e.task_id AS taskId, e.status, e.trace_id AS traceId,
              e.output_summary AS summary, e.error_code AS errorCode, e.created_at AS createdAt,
              e.finished_at AS finishedAt, t.title AS taskTitle, t.quality_receipt IS NOT NULL AND t.quality_receipt <> '' AS receipt
       FROM executions e JOIN tasks t ON t.id = e.task_id
       WHERE e.org_id = ?
         AND EXISTS (SELECT 1 FROM jobs j WHERE j.job_type='deliver_task' AND j.payload LIKE '%' || e.id || '%')
       ORDER BY e.created_at DESC LIMIT ?`,
      [me.orgId, Math.min(200, Number(q.limit ?? 50))]
    );
    return { items };
  });

  app.get("/api/v1/delivery/runs/:id", async (req) => {
    const me = ident(req);
    auth.requirePermission(me, "execution:read");
    const { id } = req.params as { id: string };
    const row = ctx.db.get<{
      id: string; taskId: string; taskTitle: string; taskStatus: string; projectId: string; projectName: string;
      agentId: string; status: string; traceId: string; startedAt: string | null; finishedAt: string | null;
      summary: string | null; errorCode: string | null; tokensIn: number; tokensOut: number; costUsd: number;
      receipt: 0 | 1; createdAt: string;
    }>(
      `SELECT e.id, e.task_id AS taskId, t.title AS taskTitle, t.status AS taskStatus, t.project_id AS projectId,
              p.name AS projectName, e.agent_id AS agentId, e.status, e.trace_id AS traceId,
              e.started_at AS startedAt, e.finished_at AS finishedAt, e.output_summary AS summary,
              e.error_code AS errorCode, e.tokens_in AS tokensIn, e.tokens_out AS tokensOut, e.cost_usd AS costUsd,
              (t.quality_receipt IS NOT NULL AND t.quality_receipt <> '') AS receipt, e.created_at AS createdAt
       FROM executions e
       JOIN tasks t ON t.id = e.task_id
       JOIN projects p ON p.id = t.project_id
       WHERE e.id = ? AND e.org_id = ?`,
      [id, me.orgId]
    );
    if (!row) throw new AppError("NOT_FOUND", "execution not found");
    const safeJson = (s: string): Record<string, unknown> | undefined => {
      try { return JSON.parse(s) as Record<string, unknown>; } catch { return undefined; }
    };
    // Real per-stage progress is persisted in `delivery_stages` by the worker (onStage).
    const persisted = ctx.db.all<{ stage: string; idx: number; state: string; detail: string; at: string }>(
      "SELECT stage, idx, state, detail, at FROM delivery_stages WHERE execution_id=? ORDER BY idx",
      [id]
    );
    const STAGES = DELIVERY_STAGES as readonly string[];
    let stages: { name: string; index: number; state: string; detail?: Record<string, unknown>; at?: string }[];
    if (persisted.length) {
      const lastIdx = persisted[persisted.length - 1]!.idx;
      stages = STAGES.map((name, i) => {
        const rec = persisted.find((r) => r.stage === name);
        let state: string;
        if (rec) state = rec.state;
        else if (row.status === "succeeded") state = "done";
        else if (row.status === "failed") state = i + 1 === lastIdx + 1 ? "failed" : "pending";
        else if (row.status === "running" || row.status === "queued") state = i + 1 <= lastIdx ? "done" : i + 1 === lastIdx + 1 ? "active" : "pending";
        else state = "pending";
        return {
          name,
          index: i + 1,
          state,
          detail: rec ? safeJson(rec.detail) : undefined,
          at: rec ? rec.at : undefined,
        };
      });
    } else {
      // Nothing actually executed (e.g. blocked by governance before the pipeline).
      stages = STAGES.map((name, i) => ({
        name,
        index: i + 1,
        state: row.status === "succeeded" ? "done" : "pending",
      }));
    }
    return { execution: row, stages };
  });

  // ---------- reviews ----------
  app.post("/api/v1/tasks/:id/reviews", async (req, reply) => {
    const me = ident(req);
    auth.requirePermission(me, "task:update");
    const { id } = req.params as { id: string };
    const task = ctx.db.get("SELECT id FROM tasks WHERE id=? AND org_id=?", [id, me.orgId]);
    if (!task) throw new AppError("NOT_FOUND", "task not found");
    const body = (req.body ?? {}) as Record<string, unknown>;
    requireFields(body, ["verdict"]);
    const axes = ["standards", "spec", "security", "adversarial"];
    const axis = String(body.axis ?? "standards");
    if (!axes.includes(axis)) throw new AppError("VALIDATION_ERROR", `axis must be one of ${axes.join(",")}`);
    const verdicts = ["pass", "fail", "changes_requested"];
    const verdict = String(body.verdict);
    if (!verdicts.includes(verdict)) throw new AppError("VALIDATION_ERROR", `verdict must be one of ${verdicts.join(",")}`);
    const rid = cryptoRandomId("rev");
    ctx.db.insert("reviews", {
      id: rid, org_id: me.orgId, task_id: id,
      reviewer_agent_id: body.reviewerAgentId ? String(body.reviewerAgentId) : null,
      axis, verdict,
      findings: JSON.stringify(body.findings ?? []),
      score: body.score !== undefined ? Number(body.score) : null,
      created_at: ctx.db.now(),
    });
    auditEvent(ctx, me, "review.recorded", "review", rid, "low", { taskId: id, verdict });
    publishEvent(ctx, me.orgId, me, "ReviewRecorded", { reviewId: rid, taskId: id, verdict });
    reply.code(201);
    return { id: rid };
  });

  app.get("/api/v1/tasks/:id/reviews", async (req) => {
    const me = ident(req);
    auth.requirePermission(me, "project:read");
    const { id } = req.params as { id: string };
    return {
      items: ctx.db.all(
        "SELECT * FROM reviews WHERE org_id=? AND task_id=? ORDER BY created_at DESC LIMIT 50",
        [me.orgId, id]
      ),
    };
  });

  // ---------- executions (dispatch) ----------
  app.post("/api/v1/executions", async (req, reply) => {
    const me = ident(req);
    auth.requirePermission(me, "task:dispatch");
    const body = (req.body ?? {}) as Record<string, unknown>;
    requireFields(body, ["taskId", "agentId"]);

    const task = ctx.db.get("SELECT * FROM tasks WHERE id=? AND org_id=?", [
      String(body.taskId), me.orgId,
    ]);
    if (!task) throw new AppError("NOT_FOUND", "task not found");

    // Client-supplied idempotency: same key returns the original execution (GAP G-12).
    const idemKey = body.idempotencyKey ? String(body.idempotencyKey) : null;
    if (idemKey) {
      const existing = ctx.db.get<{ response_hash: string }>(
        "SELECT response_hash FROM idempotency_keys WHERE org_id=? AND scope=? AND key=?",
        [me.orgId, "execution.dispatch", idemKey]
      );
      if (existing) {
        reply.code(200);
        return JSON.parse(String(existing.response_hash)) as Record<string, unknown>;
      }
    }

    const execId = cryptoRandomId("exe");
    const traceId = cryptoRandomId("trc");
    const dispatchResponse = { executionId: execId, traceId, status: "queued" };
    if (idemKey && !atomicIdempotencyPut(ctx, {
      orgId: me.orgId, scope: "execution.dispatch", key: idemKey, response: dispatchResponse,
    })) {
      reply.code(200);
      const winner = ctx.db.get<{ response_hash: string }>(
        "SELECT response_hash FROM idempotency_keys WHERE org_id=? AND scope=? AND key=?",
        [me.orgId, "execution.dispatch", idemKey]
      );
      return JSON.parse(String(winner!.response_hash)) as Record<string, unknown>;
    }
    ctx.db.insert("executions", {
      id: execId, org_id: me.orgId,
      task_id: String(body.taskId),
      agent_id: String(body.agentId),
      status: "queued",
      attempt: 1,
      trace_id: traceId,
      created_at: ctx.db.now(),
    });
    ctx.jobs.enqueue({
      orgId: me.orgId,
      type: "execute_task",
      data: { executionId: execId },
      idempotencyKey: `exec:${execId}`,
    });
    auditEvent(ctx, me, "execution.dispatched", "execution", execId, "medium", {
      taskId: body.taskId, agentId: body.agentId,
    });
    publishEvent(ctx, me.orgId, me, "AgentStarted", { executionId: execId });
    reply.code(202);
    return { executionId: execId, traceId, status: "queued" };
  });

  app.get("/api/v1/executions", async (req) => {
    const me = ident(req);
    auth.requirePermission(me, "execution:read");
    const q = req.query as { taskId?: string; limit?: string };
    const params: unknown[] = [me.orgId];
    let sql = "SELECT * FROM executions WHERE org_id=?";
    if (q.taskId) {
      sql += " AND task_id=?";
      params.push(q.taskId);
    }
    sql += " ORDER BY created_at DESC LIMIT ?";
    params.push(Math.min(200, Number(q.limit ?? 50)));
    return { items: ctx.db.all(sql, params) };
  });

  app.get("/api/v1/jobs/stats", async (req) => {
    const me = ident(req);
    auth.requirePermission(me, "settings:read");
    return ctx.jobs.stats(me.orgId);
  });

  // ---------- models & cost ----------
  app.get("/api/v1/models", async (req) => {
    const me = ident(req);
    auth.requirePermission(me, "model:read");
    return {
      models: ctx.router.allModels().map(({ provider, model }) => ({
        provider: provider.id, providerKind: provider.kind, ...model,
      })),
    };
  });

  app.post("/api/v1/models/complete", async (req) => {
    const me = ident(req);
    auth.requirePermission(me, "model:read");
    const body = (req.body ?? {}) as Record<string, unknown>;
    requireFields(body, ["prompt"]);
    const tier = body.tier ? String(body.tier) : undefined;
    const res = await ctx.router.complete(
      {
        messages: [{ role: "user", content: String(body.prompt) }],
        maxTokens: body.maxTokens ? Number(body.maxTokens) : 512,
      },
      { tier: tier as never }
    );
    return res;
  });

  app.get("/api/v1/costs/summary", async (req) => {
    const me = ident(req);
    auth.requirePermission(me, "model:read");
    return ctx.budget.summary(me.orgId);
  });

  app.post("/api/v1/budgets", async (req, reply) => {
    const me = ident(req);
    auth.requirePermission(me, "budget:manage");
    const body = (req.body ?? {}) as Record<string, unknown>;
    requireFields(body, ["scopeType", "limitUsd"]);
    const scopeTypes = ["task", "mission", "project", "org", "daily", "monthly"];
    if (!scopeTypes.includes(String(body.scopeType))) {
      throw new AppError("VALIDATION_ERROR", `scopeType must be one of ${scopeTypes.join(",")}`);
    }
    const existing = ctx.db.get(
      "SELECT id FROM budgets WHERE org_id=? AND scope_type=? AND scope_id=?",
      [me.orgId, String(body.scopeType), String(body.scopeId ?? "*")]
    );
    if (existing) {
      ctx.db.run("UPDATE budgets SET limit_usd=?, action=? WHERE id=?", [
        Number(body.limitUsd), String(body.action ?? "block"), String(existing.id),
      ]);
    } else {
      ctx.db.insert("budgets", {
        id: cryptoRandomId("bud"), org_id: me.orgId,
        scope_type: String(body.scopeType), scope_id: String(body.scopeId ?? "*"),
        limit_usd: Number(body.limitUsd), action: String(body.action ?? "block"),
        created_at: ctx.db.now(),
      });
    }
    reply.code(201);
    return { ok: true };
  });

  // ---------- approvals ----------
  app.post("/api/v1/approvals", async (req, reply) => {
    const me = ident(req);
    auth.requirePermission(me, "approval:request");
    const body = (req.body ?? {}) as Record<string, unknown>;
    requireFields(body, ["action", "resourceType", "resourceId", "reason", "riskLevel"]);
    const r = ctx.approvals.request({
      orgId: me.orgId,
      projectId: body.projectId ? String(body.projectId) : undefined,
      action: String(body.action),
      resourceType: String(body.resourceType),
      resourceId: String(body.resourceId),
      reason: String(body.reason),
      riskLevel: String(body.riskLevel) as never,
      requestedBy: me.userId,
      // explicit zero/negative TTL must win over the default (falsy-zero bug)
      ttlMinutes: body.ttlMinutes !== undefined ? Number(body.ttlMinutes) : 60,
    });
    publishEvent(ctx, me.orgId, me, "ApprovalRequested", { approvalId: r.id, action: body.action });
    pushNotification(ctx, me.orgId, "approval.requested", {
      approvalId: r.id, action: body.action,
      riskLevel: body.riskLevel, reason: String(body.reason ?? ""),
    });
    reply.code(201);
    return r;
  });

  app.get("/api/v1/approvals/pending", async (req) => {
    const me = ident(req);
    auth.requirePermission(me, "settings:read");
    return { items: ctx.approvals.listPending(me.orgId) };
  });

  app.get("/api/v1/approvals", async (req) => {
    const me = ident(req);
    auth.requirePermission(me, "settings:read");
    const q = req.query as { status?: string; projectId?: string };
    const clauses = ["org_id = ?"];
    const params: unknown[] = [me.orgId];
    if (q.status) { clauses.push("decision = ?"); params.push(q.status); }
    if (q.projectId) { clauses.push("project_id = ?"); params.push(q.projectId); }
    const items = ctx.db.all(
      `SELECT id, project_id AS projectId, action, resource_type AS resourceType, resource_id AS resourceId,
              reason, risk_level AS riskLevel, requested_by AS requestedBy, decision, decided_at AS decidedAt,
              created_at AS createdAt, expires_at AS expiresAt
       FROM approvals WHERE ${clauses.join(" AND ")} ORDER BY created_at DESC LIMIT 100`,
      params
    );
    return { items };
  });

  app.post("/api/v1/approvals/:id/decide", async (req) => {
    const me = ident(req);
    auth.requirePermission(me, "approval:decide");
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as Record<string, unknown>;
    requireFields(body, ["decision"]);
    const approve = String(body.decision) === "approve";
    if (!approve && String(body.decision) !== "reject") {
      throw new AppError("VALIDATION_ERROR", "decision must be 'approve' or 'reject'");
    }
    const r = ctx.approvals.decide(id, me, approve);
    publishEvent(ctx, me.orgId, me, approve ? "ApprovalGranted" : "ApprovalRejected", { approvalId: id });
    return r;
  });

  // ---------- deployments ----------
  app.post("/api/v1/deployments", async (req, reply) => {
    const me = ident(req);
    auth.requirePermission(me, "deployment:create");
    const body = (req.body ?? {}) as Record<string, unknown>;
    requireFields(body, ["projectId", "environment", "version", "commitSha"]);
    const environment = String(body.environment);
    if (!["development", "staging", "production"].includes(environment)) {
      throw new AppError("VALIDATION_ERROR", "invalid environment");
    }
    if (environment === "production") {
      ctx.approvals.assertApproved("deploy:production", "deployment", String(body.projectId), me.orgId);
    }
    const id = cryptoRandomId("dep");
    const now = ctx.db.now();
    ctx.db.insert("deployments", {
      id, org_id: me.orgId, project_id: String(body.projectId),
      environment, strategy: String(body.strategy ?? "rolling"),
      version: String(body.version), commit_sha: String(body.commitSha),
      status: "deploying", deployed_by: me.userId,
      started_at: now, created_at: now,
    });
    ctx.db.insert("deployment_events", {
      id: cryptoRandomId("devt"), deployment_id: id, event: "started", at: now, payload: "{}",
    });
    auditEvent(ctx, me, "deployment.started", "deployment", id, environment === "production" ? "critical" : "high");
    publishEvent(ctx, me.orgId, me, "DeploymentStarted", { deploymentId: id, environment });
    reply.code(202);
    return { id, status: "deploying" };
  });

  app.post("/api/v1/deployments/:id/succeed", async (req) => {
    const me = ident(req);
    auth.requirePermission(me, "deployment:create");
    const { id } = req.params as { id: string };
    ctx.db.updateById("deployments", id, { status: "succeeded", finished_at: ctx.db.now() });
    ctx.db.insert("deployment_events", {
      id: cryptoRandomId("devt"), deployment_id: id, event: "succeeded", at: ctx.db.now(), payload: "{}",
    });
    publishEvent(ctx, me.orgId, me, "DeploymentSucceeded", { deploymentId: id });
    // PHASE B4: SRE post-deploy operational stub (flag-gated)
    if (ctx.config.FEATURE_AGENT_SPECIALISTS) {
      const { srePostDeployCheck } = await import("./specialists.ts");
      const dep = ctx.db.get<{ project_id: string }>("SELECT project_id FROM deployments WHERE id=?", [id]);
      srePostDeployCheck(ctx, {
        orgId: me.orgId, deploymentId: id,
        projectId: dep ? String(dep.project_id) : undefined,
      });
    }
    return { ok: true };
  });

  app.post("/api/v1/deployments/:id/fail", async (req) => {
    const me = ident(req);
    auth.requirePermission(me, "deployment:create");
    const { id } = req.params as { id: string };
    ctx.db.updateById("deployments", id, { status: "failed", finished_at: ctx.db.now() });
    publishEvent(ctx, me.orgId, me, "DeploymentFailed", { deploymentId: id });
    return { ok: true };
  });

  app.post("/api/v1/deployments/:id/rollback", async (req, reply) => {
    const me = ident(req);
    auth.requirePermission(me, "deployment:rollback");
    const { id } = req.params as { id: string };
    const dep = ctx.db.get("SELECT * FROM deployments WHERE id=? AND org_id=?", [id, me.orgId]);
    if (!dep) throw new AppError("NOT_FOUND", "deployment not found");
    const rbId = cryptoRandomId("dep");
    const now = ctx.db.now();
    ctx.db.insert("deployments", {
      id: rbId, org_id: me.orgId, project_id: String(dep.project_id),
      environment: String(dep.environment), strategy: String(dep.strategy),
      version: `${String(dep.version)}-rollback`, commit_sha: String(dep.commit_sha),
      status: "deploying", rollback_of: id, deployed_by: me.userId,
      started_at: now, created_at: now,
    });
    ctx.db.updateById("deployments", id, { status: "rolled_back" });
    auditEvent(ctx, me, "deployment.rollback_started", "deployment", id, "critical");
    publishEvent(ctx, me.orgId, me, "RollbackStarted", { originalDeploymentId: id, rollbackId: rbId });
    reply.code(202);
    return { rollbackId: rbId };
  });

  app.get("/api/v1/deployments", async (req) => {
    const me = ident(req);
    auth.requirePermission(me, "deployment:read");
    return {
      items: ctx.db.all(
        "SELECT * FROM deployments WHERE org_id=? ORDER BY created_at DESC LIMIT 100",
        [me.orgId]
      ),
    };
  });

  // ---------- security findings ----------
  app.get("/api/v1/security/findings", async (req) => {
    const me = ident(req);
    auth.requirePermission(me, "security:read");
    const q = req.query as { severity?: string; status?: string };
    const params: unknown[] = [me.orgId];
    let sql = "SELECT * FROM security_findings WHERE org_id=?";
    if (q.severity) { sql += " AND severity=?"; params.push(q.severity); }
    if (q.status) { sql += " AND status=?"; params.push(q.status); }
    sql += " ORDER BY detected_at DESC LIMIT 100";
    return { items: ctx.db.all(sql, params) };
  });

  app.post("/api/v1/security/findings", async (req, reply) => {
    const me = ident(req);
    auth.requirePermission(me, "security:manage");
    const body = (req.body ?? {}) as Record<string, unknown>;
    requireFields(body, ["severity", "title"]);
    const id = cryptoRandomId("sec");
    ctx.db.insert("security_findings", {
      id, org_id: me.orgId,
      project_id: body.projectId ? String(body.projectId) : null,
      task_id: body.taskId ? String(body.taskId) : null,
      severity: String(body.severity), title: String(body.title),
      description: String(body.description ?? ""),
      cve: body.cve ? String(body.cve) : null,
      tool: String(body.tool ?? "internal"),
      status: "open", detected_at: ctx.db.now(),
    });
    publishEvent(ctx, me.orgId, me, "SecurityFindingCreated", {
      findingId: id, severity: body.severity,
    });
    pushNotification(ctx, me.orgId, "security.finding", { findingId: id, severity: body.severity, title: body.title });
    reply.code(201);
    return { id };
  });

  // ---------- knowledge ----------
  app.post("/api/v1/knowledge", async (req, reply) => {
    const me = ident(req);
    auth.requirePermission(me, "knowledge:write");
    const body = (req.body ?? {}) as Record<string, unknown>;
    requireFields(body, ["title", "content"]);
    const kinds = ["fact", "assumption", "decision", "hypothesis", "observation", "failure", "operational", "handoff"];
    const kind = String(body.kind ?? "fact");
    if (!kinds.includes(kind)) throw new AppError("VALIDATION_ERROR", `kind must be one of ${kinds.join(",")}`);
    const id = cryptoRandomId("knw");
    const now = ctx.db.now();
    ctx.db.insert("knowledge_documents", {
      id, org_id: me.orgId,
      project_id: body.projectId ? String(body.projectId) : null,
      kind, title: String(body.title), content: String(body.content),
      tags: JSON.stringify(body.tags ?? []),
      confidence: Number(body.confidence ?? 0.5),
      verification_status: String(body.verificationStatus ?? "unverified"),
      created_by: me.userId, created_at: now, updated_at: now,
    });
    reply.code(201);
    return { id };
  });

  app.get("/api/v1/knowledge/search", async (req) => {
    const me = ident(req);
    auth.requirePermission(me, "knowledge:read");
    const { q } = req.query as { q?: string };
    // Empty query → most recent documents (default dashboard view) instead of
    // an empty list; non-empty queries keep the LIKE search behavior.
    if (!q || q.trim() === "") {
      return {
        items: ctx.db.all(
          `SELECT id, kind, title, content, tags, confidence, verification_status, project_id, updated_at
           FROM knowledge_documents WHERE org_id=?
           ORDER BY updated_at DESC LIMIT 25`,
          [me.orgId]
        ),
        defaultView: true,
      };
    }
    const like = `%${q.replace(/[%_]/g, "")}%`;
    return {
      items: ctx.db.all(
        `SELECT id, kind, title, content, tags, confidence, verification_status, project_id, updated_at
         FROM knowledge_documents
         WHERE org_id=? AND (title LIKE ? OR content LIKE ? OR tags LIKE ?)
         ORDER BY updated_at DESC LIMIT 25`,
        [me.orgId, like, like, like]
      ),
    };
  });

  // ---------- Phase 40: global search ----------
  app.get("/api/v1/search", async (req) => {
    const me = ident(req);
    auth.requirePermission(me, "project:read");
    const { q } = req.query as { q?: string };
    if (!q || q.trim() === "") return { items: [] };
    const like = `%${q.replace(/[%_]/g, "")}%`;
    const projects = ctx.db.all<{ id: string; name: string; type: string }>(
      "SELECT id, name, 'project' AS type FROM projects WHERE org_id=? AND (name LIKE ? OR slug LIKE ?) LIMIT 5",
      [me.orgId, like, like]
    );
    const tasks = ctx.db.all<{ id: string; title: string; type: string }>(
      "SELECT id, title, 'task' AS type FROM tasks WHERE org_id=? AND title LIKE ? LIMIT 5",
      [me.orgId, like]
    );
    const knowledge = ctx.db.all<{ id: string; title: string; type: string }>(
      "SELECT id, title, 'knowledge' AS type FROM knowledge_documents WHERE org_id=? AND (title LIKE ? OR content LIKE ?) LIMIT 5",
      [me.orgId, like, like]
    );
    return {
      items: [
        ...projects.map((r) => ({ ...r, url: `/projects` })),
        ...tasks.map((r) => ({ ...r, url: `/tasks` })),
        ...knowledge.map((r) => ({ ...r, url: `/knowledge` })),
      ],
    };
  });

  // ---------- workflow runs (audit Phase 2.2: path templates + risk tiers) ----------
  const registryList = (defn: WorkflowDefinition) => ({
    name: defn.name,
    description: defn.description ?? "",
    stages: defn.stages.map((s) => ({
      name: s.name,
      agentRole: s.agentRole,
      lowRiskSkip: s.lowRiskSkip === true,
      approvalRequired: s.approvalRequired === true,
    })),
  });

  app.get("/api/v1/workflows", async (req) => {
    const me = ident(req);
    auth.requirePermission(me, "task:dispatch");
    const builtins = [defaultWorkflowDefinition()];
    const templates = ctx.workflowTemplates.list();
    const items = [...builtins.map(registryList), ...templates.map(registryList)];
    return {
      count: items.length,
      templates: items.map((i) => i.name),
      registryIssues: ctx.workflowTemplates.issues,
      items,
    };
  });

  app.get("/api/v1/workflows/:name", async (req) => {
    const me = ident(req);
    auth.requirePermission(me, "task:dispatch");
    const { name } = req.params as { name: string };
    const defn = resolveWorkflow(ctx, name);
    if (!defn) throw new AppError("NOT_FOUND", `workflow '${name}' not registered`);
    return registryList(defn);
  });

  app.post("/api/v1/workflows/:name/start", async (req, reply) => {
    const me = ident(req);
    auth.requirePermission(me, "task:dispatch");
    const { name } = req.params as { name: string };
    const defn = resolveWorkflow(ctx, name);
    if (!defn) throw new AppError("NOT_FOUND", `workflow '${name}' not registered`);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const riskTier = ["low", "medium", "high"].includes(String(body.riskTier ?? ""))
      ? (String(body.riskTier) as RiskTier)
      : "medium";
    const run = ctx.workflows.start(me.orgId, {
      definition: defn,
      projectId: body.projectId ? String(body.projectId) : undefined,
      riskTier,
      initialState: { requestedBy: me.userId },
    });
    auditEvent(ctx, me, "workflow.started", "workflow_run", run.runId, "medium", {
      workflow: name,
      riskTier,
    });
    reply.code(202);
    return { ...run, riskTier };
  });

  app.get("/api/v1/workflows/runs/:id", async (req) => {
    const me = ident(req);
    auth.requirePermission(me, "project:read");
    const { id } = req.params as { id: string };
    return ctx.workflows.getState(me.orgId, id);
  });

  // ---------- audit ----------
  app.get("/api/v1/audit", async (req) => {
    const me = ident(req);
    auth.requirePermission(me, "audit:read");
    const q = req.query as { limit?: string; beforeSeq?: string };
    return {
      items: ctx.audit.list(
        me.orgId,
        Math.min(500, Number(q.limit ?? 100)),
        q.beforeSeq ? Number(q.beforeSeq) : undefined
      ),
    };
  });

  app.get("/api/v1/audit/verify", async (req) => {
    const me = ident(req);
    auth.requirePermission(me, "audit:verify");
    return ctx.audit.verify(me.orgId);
  });
  app.get("/api/v1/audit/events", async (req) => {
    const me = ident(req);
    auth.requirePermission(me, "audit:read");
    const q = req.query as { limit?: string; beforeSeq?: string };
    return {
      items: ctx.audit.list(
        me.orgId,
        Math.min(500, Number(q.limit ?? 100)),
        q.beforeSeq ? Number(q.beforeSeq) : undefined
      ),
    };
  });

  const metricsHandler = async () => metrics.render(ctx);
  app.get("/metrics", metricsHandler);
  app.get("/api/v1/metrics", metricsHandler);

  // ---------- SSE ticket exchange ----------
  app.post("/api/v1/events/ticket", async (req, reply) => {
    const me = ident(req);
    const ticket = newToken(24);
    sseTickets.set(ticket, {
      identity: me,
      expiresAt: Date.now() + 60_000, // single-use, 60s window
    });
    reply.code(201);
    return { ticket, expiresInSeconds: 60 };
  });

  // ---------- SSE event stream ----------
  const EVENT_LABELS: Record<string, string> = {
    ProjectCreated: "Project created",
    TaskCreated: "Task created",
    TaskReady: "Task marked ready",
    TaskPlanned: "Task planned",
    TaskInProgress: "Implementation started",
    TaskReview: "Code review started",
    TaskQa: "QA validation",
    TaskSecurity: "Security review",
    TaskApproval: "Awaiting approval",
    TaskDeploying: "Deploying",
    TaskDeployed: "Deployed",
    TaskCompleted: "Task completed",
    DeliveryStarted: "Delivery dispatch queued",
    "Delivery.worktree_created": "Isolated worktree provisioned",
    "Delivery.code_generated": "Code generated",
    "Delivery.static_analysis": "Static analysis gate",
    "Delivery.fault_injected": "Fault injected (demo)",
    "Delivery.tests_run": "Tests executed",
    "Delivery.repair_attempted": "Self-heal repair applied",
    "Delivery.contract_verified": "Contract verified",
    "Delivery.benchmark_run": "Performance benchmark",
    "Delivery.docs_generated": "Documentation generated",
    "Delivery.review_completed": "Review gate decision",
    "Delivery.committed": "Committed to branch",
    "Delivery.merged": "Merged to main",
    "Delivery.converged": "Self-heal converged (no net diff)",
    "Delivery.postmerge_verified": "Post-merge verification passed",
    "Delivery.postmerge_reverted": "Post-merge failure auto-reverted",
    "Delivery.blocked": "Delivery blocked by gate",
    GovernanceClassified: "Request classified",
    "Governance.gate": "Governance gate evaluated",
    "Governance.impact": "Impact analysis complete",
    KnowledgeCreated: "Knowledge document created",
    "Promotion.staging_ready": "Staging promotion ready",
    DeploymentSucceeded: "Deployment succeeded",
    ApprovalRequested: "Human approval requested",
    ApprovalGranted: "Approval granted",
    SecurityFindingCreated: "Security finding recorded",
    AgentStarted: "Agent execution started",
  };
  function labelFor(type: string): string {
    return EVENT_LABELS[type] ?? type.replace(/[._]/g, " ");
  }

  app.get("/api/v1/events", async (req, reply) => {
    const me = ident(req);
    auth.requirePermission(me, "project:read");
    reply.raw.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    });
    reply.raw.write(`event: hello\ndata: {"org":"ok"}\n\n`);

    // Phase 10: Last-Event-ID replay — client reconnects with last seen seq,
    // server replays persisted domain_events after that point.
    const url = new URL(req.url, "http://localhost");
    const lastEventId = req.headers["last-event-id"] ?? url.searchParams.get("lastEventId");
    if (lastEventId && /^\d+$/.test(String(lastEventId))) {
      const missed = ctx.db.all(
        `SELECT seq, type, payload, occurred_at FROM domain_events
         WHERE org_id = ? AND seq > ? ORDER BY seq ASC LIMIT 200`,
        [me.orgId, Number(lastEventId)]
      );
      for (const e of missed) {
        reply.raw.write(`id: ${e.seq}\nevent: domain\ndata: ${JSON.stringify({
          seq: e.seq, type: e.type, label: labelFor(String(e.type)),
          payload: JSON.parse(String(e.payload || "{}")), occurredAt: e.occurred_at,
        })}\n\n`);
      }
    }

    // Snapshot: recent events for initial page load
    for (const e of ctx.bus.recent(20)) {
      if (e.orgId && e.orgId !== me.orgId) continue;
      reply.raw.write(`event: domain\ndata: ${JSON.stringify(e)}\n\n`);
    }

    let liveSeq = Number(lastEventId ?? 0) || 0;
    const unsub = ctx.bus.subscribe((e) => {
      if (e.orgId && e.orgId !== me.orgId) return;
      try {
        // look up the persisted seq for this event for id assignment
        liveSeq++;
        reply.raw.write(`id: ${liveSeq}\nevent: domain\ndata: ${JSON.stringify({ ...e, label: labelFor(e.type) })}\n\n`);
      } catch { /* stream closed */ }
    });
    const hb = setInterval(() => {
      try { reply.raw.write(`: keepalive\n\n`); } catch { /* ignore */ }
    }, 15_000);
    req.raw.on("close", () => { clearInterval(hb); unsub(); });
    await new Promise(() => { /* hold open until client disconnects */ });
  });

  ctx.log.info("routes registered");
  void auth;
  return app;
}

// ---------- shared helpers ----------

function featureFlags(ctx: AppContext): Record<string, boolean> {
  return {
    browserAutomation: ctx.config.FEATURE_BROWSER_AUTOMATION,
    agenticSoc: ctx.config.FEATURE_AGENTIC_SOC,
    a2a: ctx.config.FEATURE_A2A,
    hermes: ctx.config.FEATURE_HERMES,
    vectorKnowledge: ctx.config.FEATURE_VECTOR_KNOWLEDGE,
    github: Boolean(ctx.config.GITHUB_TOKEN || ctx.secrets?.get("GITHUB_TOKEN")),
    skillLoader: true,
    skillRuntime: true,
    workflowTemplates: ctx.workflowTemplates.count() > 0,
    oidcSso: Boolean(ctx.config.OIDC_ENABLED),
    encryptionAtRest: Boolean(ctx.config.ENCRYPT_AT_REST && ctx.config.ENCRYPTION_MASTER_KEY),
    tracing: Boolean(ctx.tracing.enabled),
    missionCompiler: true,
    capabilityRouting: true,
    workGraph: true,
    handoffContract: true,
    evidenceRegistry: true,
  };
}

/** Read a boolean/string claim by dotted path; tolerate missing or non-string values. */
function extractClaim(claims: Record<string, unknown>, path: string, fallback: string | undefined): string | undefined {
  const value = path.split(".").reduce<unknown>((acc, part) => {
    if (acc && typeof acc === "object") return (acc as Record<string, unknown>)[part];
    return undefined;
  }, claims);
  if (Array.isArray(value) && value.length > 0) return String(value[0]);
  if (typeof value === "boolean") return String(value);
  if (typeof value === "string" && value.trim()) return value.trim();
  return fallback;
}

function requireFields(body: Record<string, unknown>, fields: string[]): void {
  const missing = fields.filter((f) => body[f] === undefined || body[f] === null || body[f] === "");
  if (missing.length > 0) {
    throw new AppError("VALIDATION_ERROR", `missing required fields: ${missing.join(", ")}`, {
      details: { missing },
    });
  }
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || `p-${Date.now()}`;
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function cryptoRandomId(prefix: string): string {
  const buf = new Uint8Array(12);
  crypto.getRandomValues(buf);
  return `${prefix}_${Buffer.from(buf).toString("hex")}`;
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return [];
  }
}

function readSessionCookie(cookieHeader: string | undefined, name: string): string | undefined {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() !== name) continue;
    const value = part.slice(eq + 1).trim();
    try {
      return decodeURIComponent(value);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function sessionCookieHeader(name: string, token: string, maxAgeSecs: number, secure: boolean): string {
  return `${name}=${encodeURIComponent(token)}; HttpOnly; Path=/; Max-Age=${Math.floor(maxAgeSecs)}; SameSite=Strict${secure ? "; Secure" : ""}`;
}

function clearSessionCookieHeader(name: string): string {
  return `${name}=; HttpOnly; Path=/; Max-Age=0; SameSite=Strict`;
}

function auditEvent(
  ctx: AppContext,
  me: Identity,
  action: string,
  resourceType: string,
  resourceId: string,
  risk: "low" | "medium" | "high" | "critical",
  metadata?: Record<string, unknown>
): void {
  ctx.audit.append({
    orgId: me.orgId,
    actorType: "user",
    actorId: me.userId,
    action,
    resourceType,
    resourceId,
    riskLevel: risk,
    decision: "allow",
    result: "success",
    metadata,
  });
}

function publishEvent(
  ctx: AppContext,
  orgId: string,
  me: Identity,
  type: string,
  payload: Record<string, unknown>
): void {
  ctx.bus.emit({ type, orgId, actorType: "user", actorId: me.userId, payload });
  ctx.db.insert("domain_events", {
    event_id: cryptoRandomId("evt"),
    org_id: orgId,
    type,
    actor_type: "user",
    actor_id: me.userId,
    payload: JSON.stringify(payload),
    occurred_at: ctx.db.now(),
  });
}

function ensureProject(ctx: AppContext, orgId: string, projectId: string): void {
  const p = ctx.db.get("SELECT id FROM projects WHERE id=? AND org_id=?", [projectId, orgId]);
  if (!p) throw new AppError("NOT_FOUND", "project not found");
}

/**
 * Phase A/F-02: atomic idempotent insert. Inserts the key first; on unique
 * violation re-reads the winner's stored response and returns null so the
 * caller replays it. Eliminates the check-then-insert race entirely.
 */
function atomicIdempotencyPut(
  ctx: AppContext,
  args: { orgId: string; scope: string; key: string; response: Record<string, unknown> }
): boolean {
  try {
    ctx.db.insert("idempotency_keys", {
      id: cryptoRandomId("idk"),
      org_id: args.orgId,
      scope: args.scope,
      key: args.key,
      response_hash: JSON.stringify(args.response),
      created_at: ctx.db.now(),
    });
    return true;
  } catch (e) {
    const msg = String((e as Error).message ?? e);
    if (/UNIQUE constraint failed|duplicate key value|unique constraint/i.test(msg)) return false;
    throw e;
  }
}

// late import avoidance: default workflow comes from orchestration package via context wiring
import { defaultWorkflowDefinition, type WorkflowDefinition, type RiskTier } from "@agency/orchestration";
function resolveWorkflow(ctx: AppContext, name: string): WorkflowDefinition | undefined {
  const builtin = defaultWorkflowDefinition();
  if (builtin.name === name) return builtin;
  if (ctx.workflowTemplates.has(name)) return ctx.workflowTemplates.get(name);
  return undefined;
}

// ---------- org skill overrides (audit Phase 4, T-I) ----------

interface OrgSkillOverrideRow {
  definition: string;
  enabled: number;
}

function parseOverrideDefinition(source: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = parse(source);
  } catch (e) {
    throw new AppError(
      "VALIDATION_ERROR",
      `override definition is not valid YAML: ${String(e instanceof Error ? e.message : e)}`
    );
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new AppError("VALIDATION_ERROR", "override definition must be a YAML object");
  }
  return parsed as Record<string, unknown>;
}

function orgSkillOverride(ctx: AppContext, orgId: string, name: string): OrgSkillOverrideRow | undefined {
  return ctx.db.get<OrgSkillOverrideRow>(
    "SELECT definition, enabled FROM org_skill_overrides WHERE org_id = ? AND skill_name = ? AND enabled = 1",
    [orgId, name]
  );
}

/**
 * Per-org merged view of a skill: the declarative registry default, with the
 * org's active override layered on top. A broken stored override (corrupt YAML
 * or invalid schema) fails loudly at read time — silent degradation of agent
 * contracts is not acceptable for governance.
 */
function effectiveSkill(ctx: AppContext, orgId: string, name: string): Skill {
  const base = ctx.skills.get(name);
  const ov = orgSkillOverride(ctx, orgId, name);
  if (!ov) return base;
  let parsed: Record<string, unknown>;
  try {
    parsed = parseOverrideDefinition(ov.definition);
  } catch (e) {
    throw new AppError(
      "VALIDATION_ERROR",
      `org override for skill '${name}' is not valid YAML: ${String(e instanceof Error ? e.message : e)}`,
      { cause: e }
    );
  }
  const errors = validateSkill(parsed);
  if (errors.length > 0) {
    throw new AppError("VALIDATION_ERROR", `org override for skill '${name}' is invalid: ${errors.join("; ")}`, {
      details: { errors },
    });
  }
  return { ...base, ...(parsed as Partial<Skill>) };
}
