# WORKFLOWS

Workflows are deterministic state machines — LLMs propose, the engine executes.

## Built-in: `enterprise-feature`

```yaml
workflow:
  name: enterprise-feature
  stages:
    - { name: discovery }
    - { name: requirements, agentRole: requirements-engineer }
    - { name: architecture, agentRole: architect }
    - { name: planning,     agentRole: captain }
    - { name: implementation, agentRole: backend-engineer, retry: { maxAttempts: 3 } }
    - { name: review,       agentRole: code-reviewer }
    - { name: security,     agentRole: security-engineer }
    - { name: qa,           agentRole: qa-engineer }
    - { name: deployment,   agentRole: devops-engineer, approvalRequired: true, approvalAction: deploy:staging }
    - { name: monitoring,   agentRole: sre }
```

## Runtime semantics

- **Checkpointing** — after each stage the run persists `completedStages` +
  merged stage outputs into `workflow_runs.state_json`. Crash-safe.
- **Blocking on missing handlers** — a stage without a registered handler marks
  the run `blocked` (visible on dashboards) instead of failing silently.
  Register the handler later and `resume()`.
- **Approvals** — stages with `approvalRequired` pause into
  `waiting_approval`; `POST /approvals/:id/decide` + `resume()` continue.
- **Failure** — handler exception → run `failed`; resume after fix continues
  from the failed stage (completed work is never repeated).

## API

| Action | Endpoint |
|---|---|
| start | `POST /api/v1/workflows/enterprise-feature/start {projectId?}` |
| inspect | `GET /api/v1/workflows/runs/:id` |
| advance | engine-driven (worker); `WorkflowEngine.advance(runId)` |
| resume | `WorkflowEngine.resume(runId)` |

## Registering stage handlers (application layer)

```ts
workflows.registerHandler("enterprise-feature", "requirements", async (_stage, state) => {
  const plan = await router.complete({ messages: [/* … */] }, { tier: "STANDARD" });
  return { requirementsDraft: plan.content };
});
```

Handlers receive the full typed state and return a partial patch to merge.
