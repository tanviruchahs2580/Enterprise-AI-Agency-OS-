import { test } from "node:test";
import { strict as assert } from "node:assert";
import {
  MissionCompiler,
  CapabilityRouter,
  computeReachability,
  WorkGraph,
  validateHandoff,
  verificationPolicyFor,
  unbackedCompletionClaims,
  hashContent,
  verifyRecord,
  summarize,
  CAPABILITY_IDS,
  qualifyingAgents,
  reachableCapabilitiesFor,
  AGENT_ROSTER,
  ROSTER_PROFILES,
  defaultWorkflowDefinition,
  type AgentHandoff,
} from "@agency/orchestration";

const rosterProfiles = () => ROSTER_PROFILES.map((a) => ({ name: a.name, skills: a.skills }));

// ---------- mission compiler ----------

test("mission compiler classifies simple objective as low risk / deterministic", () => {
  const plan = new MissionCompiler().compile({ objective: "fix typo in README" });
  assert.equal(plan.complexity, "simple");
  assert.equal(plan.risk, "low");
  assert.equal(plan.recommendedVerification, "deterministic");
});

test("mission compiler flags enterprise scope and high risk keywords", () => {
  const plan = new MissionCompiler().compile({
    objective: "roll out enterprise SSO auth across the platform",
    scope: "auth; sso; oidc; identity; gateway; rollout; audit; hardening",
    constraints: ["production deployment", "PCI data on path"],
    acceptanceCriteria: ["a", "b", "c", "d", "e", "f", "g", "h"],
  });
  assert.equal(plan.complexity, "enterprise");
  assert.equal(plan.risk, "high");
  assert.equal(plan.recommendedVerification, "deterministic+review+evidence");
  assert.ok(plan.requiredCapabilities.includes("threat-modeling"));
  assert.ok(plan.requiredCapabilities.includes("adversarial-validation"));
  assert.ok(plan.requiredCapabilities.includes("release-management"));
});

test("mission compiler is deterministic for identical inputs", () => {
  const input = {
    objective: "add integration with stripe payment flow",
    scope: "webhook; refund; subscription",
    constraints: ["deploy to staging"],
  };
  const a = new MissionCompiler().compile(input);
  const b = new MissionCompiler().compile(input);
  assert.deepEqual(a, b);
});

test("empty objective returns a low-confidence placeholder, never throws", () => {
  const plan = new MissionCompiler().compile({ objective: "  " });
  assert.equal(plan.complexity, "simple");
  assert.deepEqual(plan.requiredCapabilities, []);
});

// ---------- capability directory / router ----------

test("capability directory routes to every roster agent (24/24 reachable)", () => {
  const roster = rosterProfiles();
  const names = new Set(AGENT_ROSTER.map((a) => a.name));
  assert.equal(names.size, 24);
  const stranded = AGENT_ROSTER.filter((a) => reachableCapabilitiesFor(a.name, roster).length === 0).map((a) => a.name);
  assert.deepEqual(stranded, []);
});

test("skill-conferred capabilities resolve via qualifyingAgents", () => {
  const roster = rosterProfiles();
  const srsAgents = qualifyingAgents("srs-authoring", roster);
  assert.ok(srsAgents.includes("product-manager"));
  assert.ok(srsAgents.includes("requirements-engineer"));
});

test("router picks the best-qualified primary and explains why", () => {
  const decision = new CapabilityRouter().route({
    requiredCapabilities: ["backend-implementation"],
    requiredTools: ["git.commit", "tests.run"],
    risk: "low",
  });
  assert.equal(decision.primaryAgentId, "backend-engineer");
  assert.ok(decision.candidates.some((c) => c.agentId === "staff-engineer"));
  assert.ok(decision.candidates.length >= 2);
  assert.match(decision.whyAgentSelected, /highest score/);
  assert.equal(decision.policyVersion, 1);
});

test("router prefers the caller-named agent when it qualifies", () => {
  const decision = new CapabilityRouter().route({
    requiredCapabilities: ["qa-validation"],
    preferredAgent: "qa-engineer",
  });
  assert.equal(decision.primaryAgentId, "qa-engineer");
  assert.ok(decision.candidates[0]!.reasons.some((r) => r.includes("preferred")));
});

test("router returns empty primary (not a throw) when no agent qualifies", () => {
  const decision = new CapabilityRouter().route({
    requiredCapabilities: ["mission-planning", "cited-research"],
    roster: [{ name: "backend-engineer", allowedTools: [], forbiddenTools: [], modelTier: "STANDARD", budgetUsd: 6, skills: [] }],
  });
  assert.equal(decision.primaryAgentId, "");
  assert.equal(decision.candidates.length, 0);
});

test("router re-ranks when a required tool is only allowed by some agents", () => {
  const decision = new CapabilityRouter().route({
    requiredCapabilities: ["backend-implementation"],
    requiredTools: ["tests.e2e"],
  });
  // frontend-engineer allows tests.e2e; backend-engineer (canonical for the
  // capability) does not → eligibility outranks canonicality.
  assert.equal(decision.primaryAgentId, "frontend-engineer");
  const be = decision.candidates.find((c) => c.agentId === "backend-engineer");
  assert.ok(be, "backend-engineer still eligible but ranked lower");
  assert.ok(be!.reasons.some((r) => r.includes("missing")));
  assert.ok(be!.score < decision.candidates[0]!.score);
});

test("router flags a forbidden-tool conflict in the reason trail", () => {
  const decision = new CapabilityRouter().route({
    requiredCapabilities: ["backend-implementation"],
    requiredTools: ["deploy.production"],
  });
  const be = decision.candidates.find((c) => c.agentId === "backend-engineer");
  assert.ok(be!.reasons.some((r) => r.includes("forbidden")));
});

// ---------- reachability ----------

test("reaching every agent through a validated path", () => {
  const rep = computeReachability({
    skills: new Set(["srs-authoring", "acceptance-criteria", "adr-writing", "threat-model-stride", "tdd-red-green-refactor", "coverage-gate-80-60", "diataxis-map", "cited-research"]),
  });
  assert.equal(rep.total, 24);
  assert.deepEqual(rep.unreachable, []);
  const cap = rep.items.find((i) => i.agentId === "principal");
  assert.ok(cap!.via.some((v) => v === "capability:mission-planning"));
  const qa = rep.items.find((i) => i.agentId === "qa-engineer");
  assert.ok(qa!.via.some((v) => v === "workflow:enterprise-feature:qa"));
  const be = rep.items.find((i) => i.agentId === "backend-engineer");
  assert.ok(be!.via.some((v) => v === "skill:tdd-red-green-refactor"));
});

test("reachability does not count paths named by a template that does not exist", () => {
  const rep = computeReachability({ workflowTemplates: [] });
  // a path can only be a skill or capability here; agentRole paths absent
  const principalVia = rep.items.find((i) => i.agentId === "principal")!.via;
  assert.ok(principalVia.every((v) => !v.startsWith("workflow:ghost")));
});

// ---------- work graph ----------

test("work graph compiles and executes a diamond with parallel levels", async () => {
  const g = new WorkGraph();
  const compiled = g.compile([
    { id: "a" },
    { id: "b", dependsOn: ["a"] },
    { id: "c", dependsOn: ["a"] },
    { id: "d", dependsOn: ["b", "c"] },
  ]);
  assert.deepEqual(compiled.cycles, []);
  assert.equal(compiled.levels.length, 3);
  assert.deepEqual(compiled.levels[0], ["a"]);
  assert.deepEqual(compiled.levels[1]!.sort(), ["b", "c"].sort());
  assert.deepEqual(compiled.levels[2], ["d"]);

  const ran: string[] = [];
  const nodes = [
    { id: "a" },
    { id: "b", dependsOn: ["a"] },
    { id: "c", dependsOn: ["a"] },
    { id: "d", dependsOn: ["b", "c"] },
  ];
  const { results, snapshot } = await g.execute({
    nodes,
    handlers: { run: async (id) => { ran.push(id); return { id }; } },
  });
  assert.equal(results.filter((r) => r.status === "completed").length, 4);
  assert.equal(ran.length, 4);
  assert.ok(snapshot.levels);
});

test("work graph detects cycles and missing dependencies", () => {
  const g = new WorkGraph();
  const compiled = g.compile([
    { id: "a", dependsOn: ["b"] },
    { id: "b", dependsOn: ["a"] },
    { id: "c", dependsOn: ["ghost"] },
  ]);
  assert.equal(compiled.cycles.length, 1);
  assert.deepEqual(compiled.missingDependencies, [{ node: "c", missing: ["ghost"] }]);
});

test("work graph cascades skips and blocks dependents of failures", async () => {
  const g = new WorkGraph();
  const { results } = await g.execute({
    nodes: [
      { id: "a", condition: "off" },
      { id: "b", dependsOn: ["a"] },
      { id: "f" },
      { id: "g", dependsOn: ["f"] },
    ],
    conditions: { off: () => false },
    handlers: { run: async (id) => {
      if (id === "f") throw new Error("boom");
      return {};
    } },
  });
  const a = results.find((r) => r.id === "a")!;
  const b = results.find((r) => r.id === "b")!;
  const f = results.find((r) => r.id === "f")!;
  const gNode = results.find((r) => r.id === "g")!;
  assert.equal(a.status, "skipped");
  assert.equal(b.status, "skipped");
  assert.equal(f.status, "blocked");
  assert.equal(gNode.status, "blocked");
  assert.match(gNode.reason ?? "", /dependency/);
});

test("work graph body, straight line, single level", async () => {
  const g = new WorkGraph();
  const { results } = await g.execute({
    nodes: [{ id: "only" }],
    handlers: { run: async () => ({ n: 1 }) },
  });
  assert.equal(results.length, 1);
  assert.equal(results[0]!.status, "completed");
});

// ---------- handoff ----------

test("validateHandoff passes a complete contract", () => {
  const h: AgentHandoff = {
    sender: "captain",
    receiver: "backend-engineer",
    intent: "implementation",
    payload: { task: "wire /health" },
    evidence: [],
    confidence: 0.7,
    assumptions: ["DB available"],
    unresolvedQuestions: [],
  };
  assert.deepEqual(validateHandoff(h), []);
});

test("validateHandoff rejects missing/invalid fields", () => {
  const errors = validateHandoff({} as Partial<AgentHandoff>);
  assert.ok(errors.some((e) => e.startsWith("sender")));
  assert.ok(errors.some((e) => e.startsWith("receiver")));
  assert.ok(errors.some((e) => e.startsWith("intent")));
  assert.ok(errors.some((e) => e.startsWith("confidence")));
  assert.ok(errors.some((e) => e.startsWith("payload")));
  assert.ok(errors.some((e) => e.startsWith("evidence")));
  assert.ok(errors.some((e) => e.startsWith("assumptions")));
  assert.ok(errors.some((e) => e.startsWith("unresolvedQuestions")));
});

test("validateHandoff rejects confidence outside [0,1]", () => {
  const base: AgentHandoff = {
    sender: "a", receiver: "b", intent: "review",
    payload: { x: 1 }, evidence: [], confidence: 1.4,
    assumptions: [], unresolvedQuestions: [],
  };
  assert.ok(validateHandoff(base).some((e) => e.startsWith("confidence")));
});

test("verificationPolicyFor thresholds", () => {
  assert.equal(verificationPolicyFor(0.95), "standard");
  assert.equal(verificationPolicyFor(0.7), "review");
  assert.equal(verificationPolicyFor(0.4), "escalate");
  assert.equal(verificationPolicyFor(0.7, { reviewBelow: 0.5, escalateBelow: 0.2 }), "standard");
});

// ---------- evidence ----------

test("hashContent + verifyRecord detect tampering", () => {
  const content = "tests: 42 passed";
  const h = hashContent(content);
  const intact = verifyRecord({ id: "evt_1", content, contentHash: h });
  assert.equal(intact.intact, true);
  const tampered = verifyRecord({ id: "evt_1", content: "tests: 41 passed", contentHash: h });
  assert.equal(tampered.intact, false);
  const inferred = verifyRecord({ id: "evt_2", content });
  assert.equal(inferred.inferredContent, true);
});

test("unbackedCompletionClaims flags claims with no matching evidence type", () => {
  const missing = unbackedCompletionClaims(
    ["tests passed", "build succeeded", "deploy completed"],
    ["test-result", "build-log"]
  );
  assert.deepEqual(missing, ["deploy completed"]);
  const none = unbackedCompletionClaims(["tests passed"], ["test-result"]);
  assert.deepEqual(none, []);
});

test("summarize groups by type and source", () => {
  const s = summarize([
    { type: "test-result", source: "ci" },
    { type: "test-result", source: "ci" },
    { type: "build-log", source: "ci" },
  ]);
  assert.equal(s.count, 3);
  assert.equal(s.byType["test-result"], 2);
  assert.equal(s.bySource.ci, 3);
});

test("capability directory exposes ids used by mission compiler", () => {
  assert.ok(CAPABILITY_IDS.includes("threat-modeling"));
  assert.ok(CAPABILITY_IDS.includes("delegation-orchestration"));
  assert.ok(CAPABILITY_IDS.includes("adversarial-validation"));
});

test("default workflow binds roles that reachability uses", () => {
  const wf = defaultWorkflowDefinition();
  assert.ok(wf.stages.some((s) => s.agentRole === "qa-engineer"));
  assert.ok(wf.stages.some((s) => s.agentRole === "devops-engineer"));
});