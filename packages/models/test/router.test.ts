import { test } from "node:test";
import { strict as assert } from "node:assert";
import { MockModelProvider } from "../src/providers/mock.ts";
import { ModelRouter } from "../src/router.ts";
import { CircuitBreaker } from "../src/breaker.ts";
import { AppError, systemClock } from "@agency/core";
import type { BudgetGuard, RouterRecord } from "../src/router.ts";
import { estimateTokens, estimateCost } from "../src/types.ts";

test("router picks cheapest matching candidate and records success", async () => {
  const mock = new MockModelProvider();
  const records: RouterRecord[] = [];
  const router = new ModelRouter({
    providers: [mock],
    onRecord: (r) => records.push(r),
  });

  const res = await router.complete(
    { messages: [{ role: "user", content: "hello" }] },
    { tier: "FAST", requiredCapabilities: ["json"] }
  );
  assert.ok(res.content.startsWith("[mock-fast]"));
  assert.equal(res.fallbackCount, 0);
  assert.equal(res.retryCount, 0);
  assert.ok(res.estimatedCostUsd >= 0);
  assert.equal(records.length, 1);
  assert.equal(records[0]!.status, "succeeded");
});

test("router falls back across candidates and never switches silently", async () => {
  // primary fails; reasoning model still healthy
  const failing = new MockModelProvider({
    models: [
      {
        id: "primary-x",
        alias: "primary-x",
        modelId: "primary-x",
        tier: "STANDARD",
        capabilities: ["chat"],
        contextWindow: 8_000,
        inputCostPer1k: 0.0001,
        outputCostPer1k: 0.0001,
      },
    ],
  });
  failing.failNextCalls(99); // always fail
  const healthy = new MockModelProvider();

  const records: RouterRecord[] = [];
  const router = new ModelRouter({
    providers: [failing, healthy],
    policy: { retry: { maxRetries: 1, baseDelayMs: 1 }, maxFallbacks: 3 },
    onRecord: (r) => records.push(r),
  });

  const res = await router.complete(
    { messages: [{ role: "user", content: "hi" }] },
    {} // no tier constraint → both providers eligible
  );
  assert.ok(res.fallbackCount > 0, "should have fallen back");
  const rec = records[records.length - 1]!;
  assert.equal(rec.status, "succeeded");
  assert.notEqual(rec.selectedModel, "primary-x");
  assert.ok(rec.fallbackReason !== null);
});

test("budget guard blocks spend before any provider call", async () => {
  let spent = 0;
  const budget: BudgetGuard = {
    allowSpend: () => false,
    recordSpend: (a) => {
      spent += a;
    },
  };
  const mock = new MockModelProvider();
  const router = new ModelRouter({ providers: [mock], budget });

  await assert.rejects(
    () => router.complete({ messages: [{ role: "user", content: "x" }] }),
    (e: unknown) => e instanceof AppError && e.code === "BUDGET_EXCEEDED"
  );
  assert.equal(mock.callCount, 0);
  assert.equal(spent, 0);
});

test("circuit breaker transitions closed→open→half_open", () => {
  let now = 1_000;
  const clockFn = () => now;
  const b = new CircuitBreaker(2, 10_000, clockFn);

  b.acquire();
  b.onFailure();
  b.acquire();
  b.onFailure();
  assert.equal(b.currentState, "open");
  assert.throws(() => b.acquire(), /circuit_open/);

  now += 10_001;
  assert.equal(b.currentState, "half_open");
  b.acquire();
  b.onSuccess();
  assert.equal(b.currentState, "closed");
});

test("token/cost estimation helpers are sane", () => {
  assert.equal(estimateTokens("abcd"), 1);
  assert.equal(estimateTokens("a".repeat(40)), 10);
  const m = {
    id: "m", alias: "m", modelId: "m", tier: "FAST" as const,
    capabilities: [], contextWindow: 1000,
    inputCostPer1k: 1, outputCostPer1k: 2,
  };
  const c = estimateCost(m, { tokensIn: 1000, tokensOut: 500 });
  assert.ok(Math.abs(c - 2) < 1e-9); // 1*1 + 0.5*2
  void systemClock;
});

test("context overflow: request larger than every candidate window fails safely", async () => {
  const tiny = new MockModelProvider({
    models: [
      {
        id: "tiny", alias: "tiny", modelId: "tiny", tier: "FAST",
        capabilities: ["chat"], contextWindow: 50,
        inputCostPer1k: 0.0001, outputCostPer1k: 0.0001,
      },
    ],
  });
  const router = new ModelRouter({ providers: [tiny] });

  await assert.rejects(
    () =>
      router.complete({
        messages: [{ role: "user", content: "x".repeat(400) }], // ~100 tokens > 50
      }),
    (e: unknown) =>
      e instanceof AppError && e.code === "VALIDATION_ERROR" && /context window/.test(e.message)
  );
  assert.equal(tiny.callCount, 0); // never reached the provider
});
