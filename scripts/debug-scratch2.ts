import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildContext } from "../apps/control-plane/src/context.ts";

const dataDir = mkdtempSync(join(tmpdir(), "dbg-"));
const ctx = buildContext({
  NODE_ENV: "test",
  DATABASE_URL: join(dataDir, "t.sqlite"),
  ADMIN_BOOTSTRAP_KEY: "k1",
  PORT: "0",
  LOG_LEVEL: "error",
});

try {
  const res = await ctx.router.complete(
    { messages: [{ role: "user", content: "ping" }], maxTokens: 512 },
    { tier: "FAST" }
  );
  console.log("OK:", res.content, res.estimatedCostUsd);
} catch (e) {
  console.log("FAILED:", e);
  if (e instanceof Error && e.cause) console.log("CAUSE:", e.cause);
}
