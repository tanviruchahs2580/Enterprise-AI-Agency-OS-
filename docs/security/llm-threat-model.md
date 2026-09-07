# LLM Threat Model — OWASP LLM Top 10 (SY-01)

| | |
|---|---|
| **Document** | `docs/security/llm-threat-model.md` |
| **Version** | v1.0 |
| **Owner** | Security Eng |

Mapped per agent flow (tool results, output handling, excessive agency):

| LLM Top 10 | Agent flow | Mitigation (TOOL_RISK runtime) |
|---|---|---|
| **LLM01 Prompt Injection** (tool results as instructions) | `execute_task` system prompt + `web.fetch` results | `runStep` harness treats external content as DATA ONLY [evidence: workers.ts:60 system prompt] |
| **LLM02 Insecure Output Handling** | `knowledge.write` from LLM | Output encoding + `AppError` envelope, never direct `eval` |
| **LLM03 Training Data Poisoning** | Model supply chain | SBOM per release + CodeQL, pin `modelUsed` in `artifacts.metadata` |
| **LLM04 Model DoS** | `router.complete` | Budget cap `tierBudget` + `BUDGET_EXCEEDED` 402 + runaway kill-switch (SY-04) |
| **LLM05 Supply Chain** | `model-router` | SBOM `sbom-v*.json`, `providerFailure` 502 |
| **LLM06 Sensitive Disclosure** | `secrets.read` | `TOOL_RISK: critical` + vault + PII redaction middleware (SY-05) |
| **LLM07 Insecure Plugin** | `shell.write`, `db.migrate` | `TOOL_RISK: high` → approval checkpoint + sandbox + allowlist |
| **LLM08 Excessive Agency** | `captain` `task-dispatch` | `verificationPolicyFor` + human approval G5 + `maxIterations` caps |
| **LLM09 Overreliance** | `research-agent` cited-research | Eval harness SY-02: golden I/O per agent, CI blocks on regression |
| **LLM10 Model Theft** | `knowledge_documents` | RBAC + encrypted `workflow_runs.state_json` |

## Runtime enforcement (SY-01 + TOOL_RISK)

- High-risk tools (`shell.write`, `db.migrate`, `deploy.*`, `secrets.*`) require `approval:request` + sandboxed `ProcessSandbox` + egress allowlist [evidence: `agents.ts:173 TOOL_RISK` 25/25].
- Negative test: `tests.e2e` that calls `shell.write` without approval must be `403 FORBIDDEN` [evidence: CI 34078973482].

## Change log

- v1.0 — LLM Top 10 mapped (W4)
