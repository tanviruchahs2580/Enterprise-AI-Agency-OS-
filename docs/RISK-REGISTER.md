# RISK REGISTER

| ID | Risk | P | I | Mitigation | Status |
|---|---|---|---|---|---|
| RISK-001 | Docker absent on primary machine → sandbox/container paths unverifiable here | H | M | ProcessSandbox for dev with strict allow-lists; DockerSandbox implemented & unit-tested at interface level; production config fails fast if docker required but unreachable; compose provided for capable hosts | Accepted/documented |
| RISK-002 | Accidental HOME-level git repo confuses versioning | M | H | Fresh repo inside project dir; audit doc records the issue; user advised to remove HOME `.git` manually (out of our scope) | Mitigated |
| RISK-003 | Real LLM provider keys unavailable → routing untestable end-to-end with real models | H | L | MockModelProvider used in all tests; real provider is same code path behind env key; fallback/failure tests use injected faults | Mitigated |
| RISK-004 | Prompt injection via external content | M | H | DATA vs INSTRUCTIONS separation in agent contracts; untrusted content marked; tool layer enforces permissions regardless of model output; injection tests included | Mitigated |
| RISK-005 | Unbounded agent loops / spend | M | H | max_iterations/max_cost/max_duration/max_tool_calls per execution + budgets enforced at request→task→mission→project→org→daily→monthly | Implemented |
| RISK-006 | Secret leakage into logs/prompts/telemetry | M | H | Redaction list in logger, secret metadata-only storage, .gitignore, gitleaks CI, prompt-retention off by default | Implemented |
| RISK-007 | SQLite concurrency limits in production misuse | L | M | Driver abstraction + Postgres profile documented as production baseline; boot warns when sqlite used with `NODE_ENV=production` multi-writer flag | Documented |
| RISK-008 | Supply-chain: dependency compromise | L | H | Minimal dep surface, lockfile pinned, Dependabot, gitleaks, SBOM generation, digest-pinned base images | Implemented |
| RISK-009 | Audit chain tampering | L | H | Hash chain + verify endpoint + append-only enforcement in code review policy | Implemented |
| RISK-010 | GitHub Actions secrets exposure | L | H | Least-privilege `permissions:` blocks; no org secrets needed for CI; push uses ambient auth only at finalization | Implemented |
