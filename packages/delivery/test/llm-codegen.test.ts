import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LlmCodegen } from "../src/llm-codegen.ts";
import { runBenchmark, validatePerfBudget } from "../src/gates.ts";
import type { DeliverySpec } from "../src/types.ts";

const SPEC: DeliverySpec = {
  kind: "delivery",
  moduleName: "greeter",
  codegen: "llm",
  ops: [
    {
      name: "greetNums",
      arity: 2,
      semantics: {
        description: "concatenate the two numbers as strings",
        examples: [{ args: [1, 2], returns: "12" }, { args: [7, 8], returns: "78" }],
      },
    },
  ],
};

const GOOD_MODULE = "export function greetNums(a, b) {\n  return String(a) + String(b);\n}\n";
const BROKEN_MODULE = "export function greetNums(a, b) {\n  return a - b;\n}\n";
const fence = (code: string) => "```js\n" + code + "\n```";

test("B3 LLM CODEGEN generate: fenced extraction, exports validated, tests FROM examples", async () => {
  const llm = new LlmCodegen(async () => fence(GOOD_MODULE));
  const gen = await llm.generate(SPEC);
  assert.ok(gen.files.some((f) => f.path === "src/greeter.js"));
  const testFile = gen.files.find((f) => f.path === "test/greeter.test.js")!;
  assert.match(testFile.content, /greetNums\(1, 2\) === "12"/);
  assert.match(testFile.content, /greetNums\(7, 8\) === "78"/);
});

test("B3 LLM REPAIR: broken variant fed back with diagnosis info → fixed module", async () => {
  let promptSeen = "";
  const llm = new LlmCodegen(async (messages) => {
    promptSeen = messages.map((m) => m.content).join("\n");
    return fence(GOOD_MODULE);
  });
  const failure = {
    testOutput: "greetNums(1, 2) === \"12\"",
    failingTest: "greetNums",
    expected: undefined,
    actual: undefined,
    operandHintA: 1,
    operandHintB: 2,
    file: "src/greeter.js",
  } as never as Parameters<LlmCodegen["repair"]>[2];
  const rep = await llm.repair(
    SPEC,
    [
      { path: "src/greeter.js", content: BROKEN_MODULE },
      { path: "test/greeter.test.js", content: "import { greetNums } from '../src/greeter.js';" },
    ],
    failure
  );
  assert.equal(rep.changed, true);
  assert.match(rep.diagnosis, /llm repair applied/);
  assert.match(promptSeen, /Failing test: greetNums/);
  // fixed source present in returned files
  const fixed = rep.files.find((f) => f.path === "src/greeter.js")!;
  assert.equal(fixed.content, GOOD_MODULE);
});

test("B3 LLM malformed output → clean VALIDATION_ERROR from generate", async () => {
  const bad = new LlmCodegen(async () => "prose without fences, sorry");
  await assert.rejects(
    () => bad.generate(SPEC),
    (e: unknown) => (e as { code?: string }).code === "VALIDATION_ERROR"
  );
});

test("B5 PERF BUDGET: validator rejects out-of-range; tight fails slow op; loose passes", async () => {
  assert.equal(validatePerfBudget(undefined).ok, true);
  const rej = validatePerfBudget({ avgMsPerOp: 0.0001 });
  assert.equal(rej.ok, false);
  if (rej.ok) throw new Error("unreachable");
  assert.match(rej.reason, /avgMsPerOp/);

  const dir = mkdtempSync(join(tmpdir(), "perf-"));
  mkdirSync(join(dir, "src"), { recursive: true });
  writeFileSync(
    join(dir, "src", "slowop.js"),
    "export function slowop(a, b) {\n  const t0 = performance.now();\n  while (performance.now() - t0 < 2) {}\n  return a + b;\n}\n"
  );
  const spec: DeliverySpec = { ...SPEC, moduleName: "slowop", ops: [{ name: "slowop", arity: 2 }] };

  const tight = await runBenchmark(dir, { ...spec, perfBudget: { avgMsPerOp: 0.01, iterations: 100 } });
  assert.equal(tight.pass, false, JSON.stringify(tight));
  assert.equal(tight.budget.avgMsPerOp, 0.01);

  const loose = await runBenchmark(dir, { ...spec, perfBudget: { avgMsPerOp: 1000, iterations: 100 } });
  assert.equal(loose.pass, true);

  rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
});
