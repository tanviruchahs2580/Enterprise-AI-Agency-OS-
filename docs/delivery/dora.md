# DORA Automation — W5

| | |
|---|---|
| **Document** | `docs/delivery/dora.md` |
| **Version** | v1.0 |
| **Owner** | Orchestrator |

## Automation

- **Deploy frequency / lead time / MTTR / CFR** computed from `git log --oneline + CI runs + incidents` via `scripts/dora.mjs`.
- Rendered in **every** `docs/delivery/rag-*.md` (weekly).

## CI check

```yaml
- name: DORA check
  run: node scripts/dora.mjs --fail-under 1/week
```

Every alert must link a runbook, or pipeline fails [evidence: `docs/delivery/dora.md`].

## Change log

- v1.0 — DORA auto (W5)
