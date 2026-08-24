import { test, before, after } from "node:test";
import { strict as assert } from "node:assert";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { join } from "node:path";

/**
 * Contract test: boots the MCP server as a real child process and speaks
 * line-delimited JSON-RPC to it — the exact transport OpenCode uses.
 */
let child: ChildProcessWithoutNullStreams;
let buffer = "";
const pending = new Map<number, (v: unknown) => void>();
let nextId = 1;

function rpc(method: string, params?: Record<string, unknown>): Promise<Record<string, unknown>> {
  const id = nextId++;
  return new Promise((resolve) => {
    pending.set(id, resolve as (v: unknown) => void);
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
  });
}

before(async () => {
  const serverPath = join(import.meta.dirname, "..", "src", "index.ts");
  child = spawn(process.execPath, [serverPath], {
    env: {
      ...process.env,
      AGENCYOS_API_KEY: "dummy-key-for-listing",
      AGENCYOS_URL: "http://127.0.0.1:59999",
    },
    stdio: ["pipe", "pipe", "pipe"],
  });
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    buffer += chunk;
    let idx: number;
    while ((idx = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line) continue;
      try {
        const msg = JSON.parse(line) as { id?: number; result?: unknown };
        if (msg.id !== undefined && msg.id !== null && pending.has(msg.id)) {
          const resolve = pending.get(msg.id)!;
          pending.delete(msg.id);
          resolve(msg.result);
        }
      } catch { /* ignore */ }
    }
  });
});

after(() => {
  child?.kill("SIGKILL");
});

test("MCP handshake and tool listing over stdio", async () => {
  const init = await rpc("initialize", {
    protocolVersion: "2025-03-26",
    capabilities: {},
    clientInfo: { name: "opencode-test", version: "0.0.0" },
  }) as { serverInfo?: { name?: string }; capabilities?: Record<string, unknown> };

  assert.equal(init.serverInfo?.name, "agencyos-mcp");
  assert.ok(init.capabilities?.tools !== undefined);

  const tools = await rpc("tools/list") as { tools?: { name: string }[] };
  const names = (tools.tools ?? []).map((t) => t.name);
  for (const expected of ["get_status", "list_projects", "create_task", "request_approval"]) {
    assert.ok(names.includes(expected), `missing tool ${expected}`);
  }

  // tools/call against unreachable API surfaces an isError result (never crashes)
  const call = await rpc("tools/call", { name: "get_status", arguments: {} }) as {
    isError?: boolean;
    content?: { text?: string }[];
  };
  assert.equal(call.isError, true); // fetch failed → error content
});
