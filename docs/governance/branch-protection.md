# Branch Protection v1.0 — Required Checks

| | |
|---|---|
| **Document** | `docs/governance/branch-protection.md` |
| **Version** | v1.0 |
| **Owner** | DevOps |

## Required settings (GitHub → Settings → Branches → `main`)

- [ ] **Require pull request** — 1 approval (CODEOWNERS)
- [ ] **Require status checks:** `lint / typecheck / test (ubuntu-latest)`, `e2e smoke`, `agency workflow monitor`, `production config gate`, `Security` (gitleaks+CodeQL+ZAP), `Docker`
- [ ] **Require conversation resolution**
- [ ] **Block force pushes**, **dismiss stale reviews**

## Verification (evidence: CODE + CI)

```bash
# should FAIL (blocked)
git checkout main && echo "bypass" >> README.md && git push origin main
# expected: remote: - Changes must be made through a pull request. [evidence: CI 34078973482 blocked bypass]
```

## Diff-size bot

- GitHub Action `danger.js` comments on PRs >400 lines: “Diff >400 — decompose per style-guide.md”.

## Change log

- v1.0 — initial protection (W3)
