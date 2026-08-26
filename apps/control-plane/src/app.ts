import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import { AppError, sha256Hex, newToken } from "@agency/core";
import type { Identity } from "./auth.ts";
import { AuthService } from "./auth.ts";
import type { AppContext } from "./context.ts";
import { MetricsRegistry, metricsRouteLabel } from "./metrics.ts";

const PUBLIC_PATHS = new Set(["/health", "/ready", "/live", "/api/v1/meta", "/metrics"]);

interface RateBucket {
  count: number;
  windowStart: number;
}

/** One-time, short-TTL tickets so EventSource never carries the API key. */
interface SseTicket {
  identity: Identity;
  expiresAt: number;
}

export function buildApp(ctx: AppContext): FastifyInstance {
  const auth = new AuthService(ctx.db);
  const metrics = new MetricsRegistry();
  const sseTickets = new Map<string, SseTicket>();

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

    const header = req.headers.authorization;
    let token: string | undefined;
    let sseTicket: string | undefined;
    if (header?.startsWith("Bearer ")) {
      token = header.slice(7);
    } else if (url === "/api/v1/events") {
      // EventSource cannot send headers; clients exchange the API key for a
      // one-time short-TTL ticket (POST /api/v1/events/ticket) first.
      sseTicket = new URLSearchParams(req.url.split("?")[1] ?? "").get("ticket") ?? undefined;
    }

    const identity = sseTicket ? consumeSseTicket(sseTicket) : auth.authenticate(token);
    (req as FastifyRequest & { identity?: Identity }).identity = identity;

    // Identity-aware rate buckets: hash(keyId|ip) — collision-resistant,
    // tenant-safe, and stable across routes (GAP G-07).
    enforceRateLimit(
      sha256Hex(`${identity.keyId}|${req.ip}`).slice(0, 24),
      ctx.config.RATE_LIMIT_WINDOW_MS,
      ctx.config.RATE_LIMIT_MAX
    );

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
  app.get("/health", async () => ({ status: "ok", service: "control-plane" }));
  app.get("/live", async () => ({ status: "alive" }));
  app.get("/ready", async () => {
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
  });

  app.get("/api/v1/meta", async () => ({
    name: "enterprise-ai-agency-os",
    version: "0.7.0",
    apiVersion: "v1",
    features: featureFlags(ctx),
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
    publishEvent(ctx, me.orgId, me, "TaskCreated", { taskId: t.id });
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
    return { seeded: n };
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

    let spec: { kind?: string };
    try {
      spec = JSON.parse(String(task.description));
    } catch {
      spec = {};
    }
    if (spec.kind !== "delivery") {
      throw new AppError("VALIDATION_ERROR", "task description must be DeliverySpec JSON (kind=delivery)");
    }

    // Client-supplied idempotency: same key returns the original run.
    const idemKey = body.idempotencyKey ? String(body.idempotencyKey) : null;
    if (idemKey) {
      const existing = ctx.db.get<{ response_hash: string }>(
        "SELECT response_hash FROM idempotency_keys WHERE org_id=? AND scope=? AND key=?",
        [me.orgId, "delivery.dispatch", idemKey]
      );
      if (existing) {
        reply.code(200);
        return JSON.parse(String(existing.response_hash)) as Record<string, unknown>;
      }
    }

    const execId = cryptoRandomId("exe");
    const traceId = cryptoRandomId("trc");
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
    if (idemKey) {
      const dup = ctx.db.get("SELECT id FROM idempotency_keys WHERE org_id=? AND scope=? AND key=?", [
        me.orgId, "delivery.dispatch", idemKey,
      ]);
      if (!dup) {
        ctx.db.insert("idempotency_keys", {
          id: cryptoRandomId("idk"), org_id: me.orgId,
          scope: "delivery.dispatch", key: idemKey,
          response_hash: JSON.stringify({ executionId: execId, traceId, status: "queued" }),
          created_at: ctx.db.now(),
        });
      }
    }
    auditEvent(ctx, me, "delivery.dispatched", "execution", execId, "high");
    publishEvent(ctx, me.orgId, me, "DeliveryStarted", { executionId: execId, taskId: body.taskId });
    reply.code(202);
    return { executionId: execId, traceId, status: "queued" };
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
    const row = ctx.db.get("SELECT * FROM executions WHERE id=? AND org_id=?", [id, me.orgId]);
    if (!row) throw new AppError("NOT_FOUND", "execution not found");
    const receiptTask = ctx.db.get<{ title: string; quality_receipt: string | null; status: string }>(
      `SELECT t.title, t.quality_receipt, t.status FROM executions e
       JOIN tasks t ON t.id = e.task_id WHERE e.id = ?`,
      [id]
    );
    return { execution: row, task: receiptTask ?? null };
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
    ctx.db.insert("executions", {
      id: execId, org_id: me.orgId,
      task_id: String(body.taskId),
      agent_id: String(body.agentId),
      status: "queued",
      attempt: 1,
      trace_id: traceId,
      created_at: ctx.db.now(),
    });
    if (idemKey) {
      const dup = ctx.db.get("SELECT id FROM idempotency_keys WHERE org_id=? AND scope=? AND key=?", [
        me.orgId, "execution.dispatch", idemKey,
      ]);
      if (!dup) {
        ctx.db.insert("idempotency_keys", {
          id: cryptoRandomId("idk"), org_id: me.orgId,
          scope: "execution.dispatch", key: idemKey,
          response_hash: JSON.stringify({ executionId: execId, traceId, status: "queued" }),
          created_at: ctx.db.now(),
        });
      }
    }
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
    reply.code(201);
    return r;
  });

  app.get("/api/v1/approvals/pending", async (req) => {
    const me = ident(req);
    auth.requirePermission(me, "settings:read");
    return { items: ctx.approvals.listPending(me.orgId) };
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

  // ---------- workflow runs ----------
  app.post("/api/v1/workflows/:name/start", async (req, reply) => {
    const me = ident(req);
    auth.requirePermission(me, "task:dispatch");
    const { name } = req.params as { name: string };
    const defn = defaultWorkflowFor(name);
    if (!defn) throw new AppError("NOT_FOUND", `workflow '${name}' not registered`);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const run = ctx.workflows.start(me.orgId, {
      definition: defn,
      projectId: body.projectId ? String(body.projectId) : undefined,
    });
    reply.code(202);
    return run;
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

  app.get("/metrics", async () => {
    // Prometheus text format — no auth (contains no tenant data), standard scrape target.
    return metrics.render(ctx);
  });

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
    for (const e of ctx.bus.recent(20)) {
      if (e.orgId && e.orgId !== me.orgId) continue;
      reply.raw.write(`event: domain\ndata: ${JSON.stringify(e)}\n\n`);
    }
    const unsub = ctx.bus.subscribe((e) => {
      if (e.orgId && e.orgId !== me.orgId) return;
      try {
        reply.raw.write(`event: domain\ndata: ${JSON.stringify(e)}\n\n`);
      } catch {
        /* stream closed */
      }
    });
    const hb = setInterval(() => {
      try {
        reply.raw.write(`: keepalive\n\n`);
      } catch {
        /* ignore */
      }
    }, 15_000);
    req.raw.on("close", () => {
      clearInterval(hb);
      unsub();
    });
    await new Promise(() => { /* hold open until client disconnects */ });
  });

  ctx.log.info("routes registered");
  void auth;
  return app;
}

// ---------- shared helpers ----------

function enforceRateLimit(key: string, windowMs: number, max: number): void {
  const now = Date.now();
  const b = BUCKETS.get(key);
  if (!b || now - b.windowStart >= windowMs) {
    BUCKETS.set(key, { count: 1, windowStart: now });
    pruneBuckets(now);
    return;
  }
  b.count++;
  if (b.count > max) {
    throw new AppError("RATE_LIMITED", "rate limit exceeded", {
      details: { windowMs, max },
    });
  }
}
const BUCKETS = new Map<string, RateBucket>();
let lastPrune = 0;
function pruneBuckets(now: number): void {
  if (now - lastPrune < 60_000) return;
  lastPrune = now;
  for (const [k, v] of BUCKETS) {
    if (now - v.windowStart > 10 * 60_000) BUCKETS.delete(k);
  }
}

function featureFlags(ctx: AppContext): Record<string, boolean> {
  return {
    browserAutomation: ctx.config.FEATURE_BROWSER_AUTOMATION,
    agenticSoc: ctx.config.FEATURE_AGENTIC_SOC,
    a2a: ctx.config.FEATURE_A2A,
    hermes: ctx.config.FEATURE_HERMES,
    vectorKnowledge: ctx.config.FEATURE_VECTOR_KNOWLEDGE,
    github: Boolean(ctx.config.GITHUB_TOKEN),
  };
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

// late import avoidance: default workflow comes from orchestration package via context wiring
import { defaultWorkflowDefinition } from "@agency/orchestration";
function defaultWorkflowFor(name: string) {
  const d = defaultWorkflowDefinition();
  return d.name === name ? d : undefined;
}
