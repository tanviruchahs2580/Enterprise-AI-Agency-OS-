# Module 04 — Governance: The Red Rules

> Duration: ~75 min · Prerequisites: none (can run parallel to M01–M03) · Produces: signed firm policy

Seven rules. Each exists because a real firm has already been burned by its violation. Print, post, enforce.

---

## 🔴 Rule 1 — Confidentiality first

Client geometry, sites, briefs are confidential until published. Before ANY upload to any cloud generator:

- [ ] Verify your plan tier's training-use and retention posture (opt-out available? data deleted after window?)
- [ ] Prefer team/enterprise workspaces with contractual opt-outs
- [ ] NDA-heavy projects: upload redacted masses only — strip signage, logos, identifiable program, adjacent-building details unique to the site
- [ ] Never upload other consultants' drawings/models without checking their IP terms
- [ ] When policy forbids cloud entirely: local ControlNet-class stacks are the fallback (see M01 trade-off table)

## 🔴 Rule 2 — AI output ≠ measured drawing

Generated geometry is statistically plausible, never constructible. Renders communicate **intent**. Any visible dimension, area count, or detail must trace to the actual model or carry "indicative" labeling. Enforcement hook: QA gate item "geometry claims traceable?" (templates/qa-gate-checklist.md).

## 🔴 Rule 3 — Disclose the tool

Standard sentence (adapt to house voice):

> "Visualizations produced with AI-assisted rendering from the design model; imagery is indicative and subject to design development."

Disclose in proposals, board footers, and verbally when presenting. Rationale: concealment discovered later converts a tool story into a trust story. Align with your institute's generative-AI guidance (AIA, RIBA, and national bodies have published statements).

## 🔴 Rule 4 — License hygiene

- Know what your plan grants: commercial rights vary by tier/region; screenshot the terms page on subscription day, store in `00_GOVERNANCE/LICENSE_NOTES/`.
- Style references: use licensed/generic material. Do not clone a living architect's signature building and present as your direction without attribution.
- People: avoid generating recognizable individuals near identifiable projects.

## 🔴 Rule 5 — No structural promises

If asked "is that cantilever possible?", the answer is verbatim-class:

> "The visualization expresses design intent; engineering confirms feasibility."

Never let marketing momentum convert an image into a technical claim.

## 🔴 Rule 6 — Version integrity

Every delivered image reproduces from: frozen prompt copy + input files + generation id + log row, archived together in the project folder. **If you can't reproduce it, you don't deliver it.**

## 🔴 Rule 7 — Budget honesty

Credit spend is a project cost: tracked per project, reported monthly, escalated at threshold breach. Surprise invoices poison leadership's appetite for the entire initiative — protect the program by reporting boring numbers early.

---

## Lesson 4.1 — LAB: Write your firm's one-page policy (30 min)

Use `templates/firm-policy-onepager.md`. Fill every bracket; delete nothing silently. Required sign-offs: principal + (if exists) DPO/practice IT. File to `00_GOVERNANCE/AI-VIZ-POLICY.md`.

Policy must name: allowed tools list · confidentiality tiering (public/NDA/redacted-only) · standard disclosure sentence · license notes location · budget owner + thresholds · incident contacts · review date (quarterly).

### Escalation mini-table (include in policy)

| Event | Immediate action | Notify |
|---|---|---|
| Suspected confidential-input leak | disable seat, stop project uploads | DPO/client per contract |
| License/terms change noticed | freeze new uploads pending review | viz lead |
| Credit budget breach | halt non-billable generation | budget owner |
| Client refuses AI-assisted imagery | switch project to manual pipeline | principal |

## Lesson 4.2 — Discussion cases (15 min, team exercise)

1. Marketing wants a hero shot with people on a balcony that doesn't exist in the model. Which rules collide? Resolution?
2. A junior pins a famous architect's recent tower as style reference for a competition entry. Rule 4 analysis?
3. Client signs NDA mid-project; you've been uploading full context models. Retroactive steps?

*(Facilitator notes: 1→Rule 5 vs marketing need; offer mass-true alternative or label addition. 2→attribution + transformation test; prefer catalog systems. 3→Rule 1 incident path: stop, assess exposure, notify per contract.)*

---

## Gate 4

- [ ] Policy drafted, all brackets resolved, signed, filed
- [ ] Escalation table populated with real names
- [ ] Team discussion cases completed (min. 3 participants if firm > 1 person)
- [ ] Disclosure sentence inserted into proposal template

## Quiz

1. Which two rules does an unlabeled invented balcony violate simultaneously?
2. What four artifacts compose a reproduction bundle?

<details><summary>Answers</summary>
1. Rule 2 (untraceable geometry presented without indicative labeling) and Rule 3 (no disclosure).
2. Frozen prompt + inputs + generation id + log row.
</details>

**Next:** Module 05 — Prompt Engineering: The C.A.M.E.R.A. Framework.
