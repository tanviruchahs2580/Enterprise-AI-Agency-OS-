/**
 * Agency OS MCP Server
 *
 * Line-delimited JSON-RPC 2.0 over stdio (MCP stdio transport).
 * Exposes SAFE read/write operations of the control plane to coding agents
 * (OpenCode etc.). No destructive or administrative tools are exposed.
 *
 * Configuration (environment):
 *   AGENCYOS_URL      control-plane base URL (default http://127.0.0.1:3000)
 *   AGENCYOS_API_KEY  bearer API key (required)
 */
interface RpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

const BASE = process.env.AGENCYOS_URL ?? "http://127.0.0.1:3000";
const KEY = process.env.AGENCYOS_API_KEY ?? "";

function out(msg: unknown): void {
  process.stdout.write(JSON.stringify(msg) + "\n");
}

async function api<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}/api/v1${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      authorization: `Bearer ${KEY}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const err = (data as { error?: { message?: string } }).error ?? {};
    throw new Error(err.message ?? `HTTP ${res.status}`);
  }
  return data as T;
}

const TOOLS = [
  {
    name: "get_status",
    description: "Agency OS health and readiness (database, queue dead letters, sandbox provider, features).",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "list_projects",
    description: "List all projects in the organization.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_project_context",
    description: "Get project details plus its requirements and ready-to-dispatch tasks.",
    inputSchema: {
      type: "object",
      properties: { projectId: { type: "string" } },
      required: ["projectId"],
    },
  },
  {
    name: "create_task",
    description: "Create a task inside a project. Optionally declare dependencies on other task ids.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        title: { type: "string" },
        description: { type: "string" },
        dependsOn: { type: "array", items: { type: "string" } },
        priority: { type: "number", minimum: 1, maximum: 5 },
      },
      required: ["projectId", "title"],
    },
  },
  {
    name: "get_ready_tasks",
    description: "Tasks whose dependencies are satisfied and can be dispatched now.",
    inputSchema: {
      type: "object",
      properties: { projectId: { type: "string" } },
      required: ["projectId"],
    },
  },
  {
    name: "search_knowledge",
    description: "Full-text search across persisted project knowledge (decisions, handoffs, failures).",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    },
  },
  {
    name: "request_approval",
    description: "Open a human approval gate for a high-risk action (e.g. deploy:production).",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string" },
        resourceType: { type: "string" },
        resourceId: { type: "string" },
        reason: { type: "string" },
        riskLevel: { type: "string", enum: ["medium", "high", "critical"] },
        projectId: { type: "string" },
      },
      required: ["action", "resourceType", "resourceId", "reason", "riskLevel"],
    },
  },
  {
    name: "verify_audit",
    description: "Verify the hash-chain integrity of the audit log.",
    inputSchema: { type: "object", properties: {} },
  },
];

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case "get_status":
      return api("GET", "/ready");
    case "list_projects":
      return api("GET", "/projects");
    case "get_project_context": {
      const projectId = String(args.projectId);
      const [project, requirements, ready] = await Promise.all([
        api("GET", `/projects/${projectId}`),
        api("GET", `/projects/${projectId}/requirements`),
        api("GET", `/projects/${projectId}/tasks/ready`),
      ]);
      return { project, requirements, readyTasks: ready };
    }
    case "create_task": {
      const body: Record<string, unknown> = {
        projectId: String(args.projectId),
        title: String(args.title),
      };
      if (args.description !== undefined) body.description = String(args.description);
      if (Array.isArray(args.dependsOn)) body.dependsOn = args.dependsOn.map(String);
      if (args.priority !== undefined) body.priority = Number(args.priority);
      return api("POST", "/tasks", body);
    }
    case "get_ready_tasks":
      return api("GET", `/projects/${String(args.projectId)}/tasks/ready`);
    case "search_knowledge":
      return api("GET", `/knowledge/search?q=${encodeURIComponent(String(args.query))}`);
    case "request_approval":
      return api("POST", "/approvals", {
        action: String(args.action),
        resourceType: String(args.resourceType),
        resourceId: String(args.resourceId),
        reason: String(args.reason),
        riskLevel: String(args.riskLevel),
        ...(args.projectId !== undefined ? { projectId: String(args.projectId) } : {}),
      });
    case "verify_audit":
      return api("GET", "/audit/verify");
    default:
      throw new Error(`unknown tool: ${name}`);
  }
}

async function handle(req: RpcRequest): Promise<void> {
  if (req.method === "initialize") {
    out({
      jsonrpc: "2.0",
      id: req.id,
      result: {
        protocolVersion: "2025-03-26",
        capabilities: { tools: {} },
        serverInfo: { name: "agencyos-mcp", version: "0.1.0" },
      },
    });
    return;
  }
  if (req.method === "notifications/initialized") return; // notification: no reply
  if (req.method === "tools/list") {
    out({ jsonrpc: "2.0", id: req.id, result: { tools: TOOLS } });
    return;
  }
  if (req.method === "tools/call") {
    const name = String((req.params?.name as string) ?? "");
    const args = (req.params?.arguments as Record<string, unknown>) ?? {};
    try {
      const result = await callTool(name, args);
      out({
        jsonrpc: "2.0",
        id: req.id,
        result: {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          isError: false,
        },
      });
    } catch (e) {
      out({
        jsonrpc: "2.0",
        id: req.id,
        result: {
          content: [{ type: "text", text: `Error: ${(e as Error).message}` }],
          isError: true,
        },
      });
    }
    return;
  }
  if (req.method === "ping") {
    out({ jsonrpc: "2.0", id: req.id, result: {} });
    return;
  }
  if (req.id !== undefined && req.id !== null) {
    out({
      jsonrpc: "2.0",
      id: req.id,
      error: { code: -32601, message: `method not found: ${req.method}` },
    });
  }
}

let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk: string) => {
  buffer += chunk;
  let idx: number;
  while ((idx = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (!line) continue;
    try {
      void handle(JSON.parse(line) as RpcRequest);
    } catch (e) {
      out({
        jsonrpc: "2.0",
        id: null,
        error: { code: -32700, message: `parse error: ${(e as Error).message}` },
      });
    }
  }
});
process.stdin.on("end", () => process.exit(0));

if (!KEY) {
  // Fail fast but keep the channel clean: stderr only.
  console.error("AGENCYOS_API_KEY is required");
  process.exit(1);
}
