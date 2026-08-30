import { test } from "node:test";
import { strict as assert } from "node:assert";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { loadConfig } from "@agency/core";
import { initTracing, withSpan } from "../src/tracing.ts";

function startCollector(): Promise<{ port: number; bodies: string[]; waitFor: (n: number, ms: number) => Promise<void>; close: () => Promise<void> }> {
  return new Promise((resolve, reject) => {
    const bodies: string[] = [];
    const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
      if (req.method === "POST" && req.url?.startsWith("/v1/traces")) {
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(chunk as Buffer);
        bodies.push(Buffer.concat(chunks).toString());
        res.writeHead(200, { "content-type": "application/json" });
        res.end("{}");
        return;
      }
      res.writeHead(404);
      res.end();
    });
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") return reject(new Error("no port"));
      resolve({
        port: addr.port,
        bodies,
        waitFor: (n, ms) =>
          new Promise((ok) => {
            const deadline = Date.now() + ms;
            const poll = () => {
              if (bodies.length >= n) return ok();
              if (Date.now() > deadline) return ok();
              setTimeout(poll, 25);
            };
            poll();
          }),
        close: () => new Promise<void>((r) => server.close(() => r())),
      });
    });
    server.on("error", reject);
  });
}

test("T-F tracing disabled unless OTEL_ENABLED + endpoint configured (was blocked)", () => {
  const cfg = loadConfig({ NODE_ENV: "test", OTEL_ENABLED: "false" } as NodeJS.ProcessEnv);
  const handle = initTracing(cfg);
  assert.equal(handle.enabled, false);
});

test("T-F withSpan exports a span to the OTLP/HTTP collector", async () => {
  const collector = await startCollector();
  try {
    const cfg = loadConfig({
      NODE_ENV: "test",
      OTEL_ENABLED: "true",
      OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: `http://127.0.0.1:${collector.port}/v1/traces`,
    } as NodeJS.ProcessEnv);
    const handle = initTracing(cfg);
    assert.equal(handle.enabled, true);

    await withSpan(handle, "test.span", { scope: "t-f", depth: 1 }, async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    // BatchSpanProcessor flush on shutdown is deterministic; also poll the
    // collector defensively for stragglers.
    await handle.shutdown();
    await collector.waitFor(1, 3000);

    assert.ok(collector.bodies.length >= 1, "collector received at least one export");
const parsed = JSON.parse(collector.bodies[0]!) as {
    resourceSpans?: Array<{ resource?: { attributes?: Array<{ key: string; value?: { stringValue?: string } }> }; scopeSpans?: Array<{ spans?: Array<{ name: string; attributes?: Array<{ key: string; value?: { stringValue?: string; intValue?: number; doubleValue?: number; boolValue?: boolean } }> }> }> }>;
  };
    const span = parsed.resourceSpans?.[0]?.scopeSpans?.[0]?.spans?.find((s) => s.name === "test.span");
    assert.ok(span, "exported span with name test.span");
    const serviceName = parsed.resourceSpans?.[0]?.resource?.attributes?.find((a) => a.key === "service.name")?.value?.stringValue;
    assert.equal(serviceName, "agency-os-control-plane");
    const attr = span.attributes?.find((a) => a.key === "depth")?.value;
    const depth = attr?.stringValue ?? String(attr?.intValue ?? "");
    assert.equal(depth, "1");
  } finally {
    await collector.close();
  }
});