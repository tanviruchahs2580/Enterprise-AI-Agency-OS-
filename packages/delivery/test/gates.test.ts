import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { staticScan, contractCheck, runBenchmark } from "../src/gates.ts";
import type { DeliverySpec, FileArtifact } from "../src/types.ts";

const SPEC: DeliverySpec = {
  kind: "delivery",
  moduleName: "calc",
  ops: [{ name: "add", arity: 2 }],
};

const CLEAN_SRC: FileArtifact = {
  path: "src/calc.js",
  content: "export function add(a, b) {\n  return a + b;\n}\n",
};

test("STATIC GATE rules: clean source passes; each forbidden pattern is caught", () => {
  assert.equal(staticScan([CLEAN_SRC]).length, 0);

  const evil: FileArtifact[] = [
    { path: "src/a.js", content: "export const f = (s) => eval(s);" },
    { path: "src/b.js", content: "export const g = new Function('return 1');" },
    { path: "src/c.js", content: "import fs from 'node:fs';" },
    { path: "src/d.js", content: "const cp = require('child_process');" },
  ];
  const findings = staticScan(evil);
  assert.equal(findings.length, evil.length);
  for (const f of evil) assert.ok(findings.some((x) => x.path === f.path));

  // non-src files are out of gate scope
  assert.equal(staticScan([{ path: "README.md", content: "eval(eval(eval))" }]).length, 0);
});

test("CONTRACT CHECK: missing export / arity drift / undeclared export detected", () => {
  assert.equal(contractCheck(SPEC, [CLEAN_SRC]).ok, true);

  const noAdd = contractCheck(SPEC, [{ ...CLEAN_SRC, content: "export function mul(a,b){return a*b;}" }]);
  assert.equal(noAdd.ok, false);
  assert.ok(noAdd.problems.some((p) => p.includes("missing export: add")));

  const arityDrift = contractCheck(SPEC, [
    { ...CLEAN_SRC, content: "export function add(a) { return a; }" },
  ]);
  assert.equal(arityDrift.ok, false);
  assert.ok(arityDrift.problems.some((p) => p.includes("arity")));

  const extra = contractCheck(SPEC, [
    { ...CLEAN_SRC, content: CLEAN_SRC.content + "\nexport function sneaky(a){return a;}" },
  ]);
  assert.equal(extra.ok, false);
  assert.ok(extra.problems.some((p) => p.includes("undeclared export: sneaky")));
});

test("BENCHMARK: runs out-of-process over absolute URL and reports avgMs under budget", async () => {
  const dir = mkdtempSync(join(tmpdir(), "bench-"));
  const { mkdirSync } = await import("node:fs");
  mkdirSync(join(dir, "src"), { recursive: true });
  writeFileSync(join(dir, "src", "calc.js"), CLEAN_SRC.content);

  const res = await runBenchmark(dir, SPEC);
  assert.equal(res.pass, true, JSON.stringify(res.results));
  assert.equal(res.results[0]!.op, "add");
  assert.equal(res.results[0]!.iterations, 20000);
  assert.ok(res.results[0]!.avgMs < 5);

  rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
});
