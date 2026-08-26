# AUTONOMOUS DELIVERY LOOP — Architecture & Operator Guide

This document describes the **closed-loop autonomous delivery engine** added in
v0.5.0 (`packages/delivery`). It is the system that turns a *requirement*
into a *merged, reviewed, tested commit* without human code edits.

## Lifecycle (wired end-to-end)

```
Task { description: DeliverySpec JSON }
  ↓  POST /api/v1/delivery/runs {taskId, injectFault?, maxRepairAttempts}
  ↓  execution row (queued) + job (type=deliver_task, idempotency key)
  ↓  delivery-worker claims job (atomic conditional UPDATE)
execution=running
  ↓  ensureProjectRepo(project)  — data/repos/<slug>-<id6> (clean main)
  ↓  GitWorktreeService.create(repo, taskId)  — branch agency/task-<id>
Generation (pluggable CodegenEngine)
  ↓  TemplateCodegen.generate(spec)  or  LlmCodegen via ModelRouter
  ↓  [demo/self-heal proof] optionally flip one operator (injectFault)
  ↓  writeFiles(worktree, files)
Test → Self-heal loop (maxRepairAttempts, default 2)
  ↓  runTests(worktree)  — spawn `node --test` with NODE_TEST_CONTEXT stripped
  ↓  if RED and repair possible:
       parseFailure(output) → {failingTest, expected, actual, file,
                               operandHintA/B}
       Codegen.repair(spec, files, failure) → targeted operator correction
       writeFiles(worktree, repaired) → re-test
Review gate (deterministic)
  ↓  reviewDiff(files)  — secret-leak, TODO markers, debug code,
     path safety, scope limits → APPROVE / REQUEST_CHANGES / BLOCK
  ↓  REQUEST_CHANGES or BLOCK  → delivery blocked (no commit)
Commit → Merge
  ↓  GitWorktreeService.commitAll(worktree, message)
  ↓  git merge --ff-only <branch> in main workspace
Cleanup
  ↓  remove worktree (branch retained as merged history)
  ↓  execution=succeeded, quality_receipt (hash-chained), handoff
     knowledge document, audit events (delivery.completed),
     metrics counters advance, dashboard polls /delivery/runs/:id
```

## How to use

### 1. Create a delivery task

Task `description` must be valid `DeliverySpec` JSON:

```json
{
  "kind": "delivery",
  "moduleName": "calculator",
  "ops": [{ "name": "add", "arity": 2 }, { "name": "mul", "arity": 2 }]
}
```

```sh
curl -s -X POST $BASE/api/v1/tasks \
  -H "authorization: Bearer $KEY" -H "content-type: application/json" \
  -d '{"projectId":"<id>","title":"Implement calculator","description":"<spec json>"}'

curl -s -X POST $BASE/api/v1/tasks/<taskId>/transition \
  -H "authorization: Bearer $KEY" -H "content-type: application/json" \
  -d '{"to":"ready"}'
```

### 2. Dispatch delivery (optionally prove self-healing)

```sh
curl -s -X POST $BASE/api/v1/delivery/runs \
  -H "authorization: Bearer $KEY" -H "content-type: application/json" \
  -d '{"taskId":"<taskId>","injectFault":true}'
# → { executionId, traceId, status:"queued" }
```

### 3. Poll for result

```sh
curl -s $BASE/api/v1/delivery/runs/<executionId> -H "authorization: Bearer $KEY"
# execution: {status:"succeeded"|"failed", output_summary, ...}
# task:      {quality_receipt: "<json>", status:"review"}
```

### 4. Verify on disk

The managed repo lives at `data/repos/<slug>-<projectId6>/`. After a
successful run its main branch contains the committed module:

```sh
cat data/repos/*.js/src/calculator.js
git -C data/repos/... log --oneline -3
```

## Configuration

| Env | Meaning | Default |
|---|---|---|
| `DELIVERY_CODEGEN` | `template` (offline) or `llm` | `template` |
| `MODEL_PROVIDER_API_KEY / BASE_URL` | enables LlmCodegen via ModelRouter | none |
| `maxRepairAttempts` (per run) | repair budget | 2 |
| `testsTimeoutMs` (per run body) | timeout for each node --test attempt | 120000 |
| `idempotencyKey` (per run body) | client key; duplicate dispatches replay the original execution | none |
| `WEBHOOK_OUTBOUND_URL` + `_SECRET` | when set, worker emits signed `delivery.completed`/`delivery.blocked` | off |
| DeliverySpec op `cases` | explicit test vectors `[a,b,expected][]` overriding canonical defaults | auto |

Template mode is used for the CI/demo harness and air-gapped deployments and
produces REAL executable code + REAL tests with a genuine repair loop.

## Security & limits

- Worktrees are isolated under `data/repos/<slug>-<id>/`; the agent never
  writes outside that tree (path-traversal guard in reviewer).
- `maxRepairAttempts` transitions to `BLOCKED` rather than looping forever.
- Secret-leak findings `BLOCK` the run (no commit).
- Task status must be `ready` before delivery can start (state-machine gated).
- Execution rows are append-only; receipts are hash-chained via `AuditLog`.

## Demo script

```sh
# boots a fresh control plane against data/demo.sqlite and runs the full
# lifecycle with an injected fault to prove self-healing:
node scripts/demo-delivery.mjs http://127.0.0.1:3000 $ADMIN_KEY
# Evidence: .demo-evidence.json + exit code (0 = SUCCESS)
```

## Extending

Implement `CodegenEngine` (`packages/delivery/src/types.ts`) and pass it to
`runDeliveryPipeline({ codegen: new MyCodegen() })`. The `LlmCodegen` example
in `packages/delivery/src/codeng.ts` shows ModelRouter integration: prompt as
JSON-mode returning `[{path,content}]`, validated against the file schema.
