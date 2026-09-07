# Eval Harness v1.0 — 24 Agents (SY-02)

| | |
|---|---|
| **Document** | `evals/README.md` |
| **Version** | v1.0 |
| **Owner** | QA + Research (eval-gated) |

## Golden sets

- Per agent: `evals/<agent>/golden.jsonl` — input `messages[]` + expected `content` tokens / `tool` calls.
- **24/24 agents** covered [evidence: `evals/` dir, CI runs `node evals/run.mjs`].

## CI gate

```yaml
# .github/workflows/ci.yml (W4)
- name: eval harness
  run: node evals/run.mjs --agent all --threshold 0.85
```

Regression (>15% drift) → `BLOCKED`.

## Process (R7 Prompts are code)

- All 24 `systemPrompt` in `agents.ts:62` versioned, PR-reviewed.
- Prompt change → evals must be re-run; `evals/` diff required in PR.

## Change log

- v1.0 — harness stub, 24-agent coverage
