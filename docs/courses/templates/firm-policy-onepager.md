# AI Visualization Policy — One-Pager Template v1.0.0

> Firm: ______________ · Effective: ________ · Review due: ________ (quarterly)
> Sign-offs: Principal ________ · DPO/IT ________ · Viz Lead ________

## 1 · Scope & allowed tools

In scope: all client-facing and internal AI-generated architectural imagery.
Approved engines/platforms (update quarterly):

| Tool | Use scope | Plan/tier | License notes location |
|---|---|---|---|
| __________ | __________ | __________ | 00_GOVERNANCE/LICENSE_NOTES/ |

Unlisted tools require viz-lead approval before first use.

## 2 · Confidentiality tiers (Red Rule 1)

| Tier | Definition | Upload rule |
|---|---|---|
| T1 Public | published projects | full context allowed |
| T2 Standard | active non-NDA work | team workspace; plan-tier opt-outs verified |
| T3 NDA | NDA-covered | redacted masses only; strip signage/logos/identifiable program |
| T4 Restricted | cloud-forbidden contracts | local/on-prem stack only; no cloud upload of any input |

Before first upload per project: verify platform training-use + retention posture for current tier. Record check in project README.

## 3 · Disclosure (Red Rule 3) — standard sentence

> "Visualizations produced with AI-assisted rendering from the design model; imagery is indicative and subject to design development."

Placement: proposals (methods section) · boards (footer) · verbal at presentation start.

## 4 · Output status (Rules 2 & 5)

AI renders communicate design intent only. No dimension/area/feasibility claim may be answered from an image. Standing verbal script: *"The visualization expresses intent; engineering confirms feasibility."*

## 5 · Budget ownership (Rule 7)

Budget owner: ____________ · Monthly cap per team: ________ credits
Alert threshold: 80% · Breach action: halt non-billable generation; escalate same day.
Rollup source: generation logs (single accounting truth).

## 6 · Access & offboarding

Role-based seats; freelancers project-scoped only. Offboarding: seat removal + archive audit within ___ business days + policy acknowledgment on file.

## 7 · Incident escalation

| Event | Immediate action | Notify |
|---|---|---|
| Suspected confidential-input leak | disable seat; stop uploads | DPO/client per contract |
| Platform terms change noticed | freeze new uploads pending review | Viz Lead |
| Credit breach | halt non-billable runs | Budget owner |
| Client declines AI-assisted imagery | switch project to manual pipeline | Principal |

Incident files → `00_GOVERNANCE/incidents/`. Annual tabletop drill owner: ____________.

## 8 · Provenance rule (Rule 6)

If it cannot be reproduced from its bundle (frozen prompt + inputs + gen id + log row), it is not delivered. Non-negotiable.

---

*This policy is deliberately one page. If it grows, split appendices out; keep the signed page scannable.*
