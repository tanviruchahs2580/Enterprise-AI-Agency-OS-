# Module 03 — Google Flow Deep Dive

> Duration: ~110 min · Prerequisites: M00–M02 · Produces: calibrated credit numbers + before/after exhibit

> ⚠️ **Accuracy note:** Flow's UI evolves quickly (labels, button placement, plan features). Concepts below are stable; verify exact names against the live interface during labs. Where this document says "ingredient," your build may say "asset/element/reference" — same job.

## Learning objectives

1. Navigate Flow's project/frame/ingredient/output model fluently.
2. Forecast deliverable cost using personally measured averages.
3. Rank input-quality levers and exploit the top two deliberately.

---

## Lesson 3.1 — Interface orientation (25 min)

Mental model — five subsystems:

| Subsystem | Job | Course mapping |
|---|---|---|
| **Projects** | folder + context container | one Flow project per scene-set (`P012 Tower – North Studies`) |
| **Prompt box + run settings** | where slots compile into instructions; aspect/model/output-count | Bank 8 OUTPUT SPEC lives here |
| **Ingredients / asset references** | attach your images to steer identity of subject & style | THE critical feature for architecture — keeps *your* building *yours* |
| **Frames / sequencing** | storyboard continuity for motion work | Module 6.10 animation |
| **Output history** | per-run results grid | download selects immediately (Tab discipline) |

Setup lab steps:

1. Create project `P001_TRAINING_<you>_flowtests`.
2. Import your hygiene-passing base render as an ingredient; pin it as primary subject.
3. Generate once with defaults just to see the machinery run; log the row.

## Lesson 3.2 — Credits, plans, forecasting (20 min)

Consumption varies by model variant, quality mode, output count, and feature (motion costs more than stills). You will measure YOUR numbers rather than trust forum folklore:

### Calibration protocol (do once, re-run quarterly)

| Probe | Procedure | Record |
|---|---|---|
| cE explore cost | 3 × 4-up draft batches, same prompt family | avg credits/batch |
| cC craft cost | 2 × full-quality single frames | avg credits/pass |
| cF fix cost | 1 inpaint + 1 outpaint | avg credits/edit |
| cA anim cost | 1 × 5-second clip | credits/second |

Forecast: `deliverable_cost ≈ E·cE + C·cC + F·cF (+ A·cA)`, cap = 2× forecast, log burn daily.

Plan-selection guidance: free tiers suffice through Module 5; production work (Module 6+) wants paid throughput because iteration count — not inspiration — determines outcomes.

## Lesson 3.3 — Input quality levers (20 min)

Ranked by measured impact on fidelity:

1. **Base image quality** — resolution, clean background, intended camera. Biggest lever by far; a good export renders well even with mediocre text.
2. **Ingredient choice** — which references pinned, their strength. Second lever; this is Workflow B's entire engine.
3. **Slot completeness** — empty slots are decisions delegated to the model. C.A.M.E.R.A. exists to make emptiness impossible.
4. **Model/quality tier selection** — draft vs max; match to exploration stage.
5. **Wording polish** — real but smallest. Teams over-invest here; stop adjective-tuning, start anchor-fixing.

Exercise: take one failed output and walk the ladder top-down — improve base export first, regenerate, then adjust ingredients, then slots. Note how rarely step 5 is reached.

## Lesson 3.4 — LAB: First generation end-to-end (45 min)

The pedagogical spine of the course:

1. **Naive run:** import base image; prompt like a civilian ("make this building look realistic nice lighting"). 4-up draft batch. Log it.
2. **Structured run:** same base; fill a minimal C.A.M.E.R.A. block (preview of M05 — template provided below). 4-up draft batch. Log it.
3. **Compare:** score both batches against five self-written criteria (mullion alignment, material realism, sky plausibility, camera intent, overall credibility).
4. Archive side-by-side sheet → `50_DELIVERABLES/training/M03_before_after.png`.

Minimal structured block (fill before running):

```text
[C] street-level two-point perspective, camera 1.6 m, 24 mm equivalent
[A] preserve modeled massing exactly; add no floors or rooftop items
[M] {{your envelope palette with physical qualifiers}}
[E] overcast morning, wet pavement, sparse pedestrians
[R] photorealistic architectural photography, natural grade
[A] negatives: warped lines, added text/watermark; output 16:9
```

Expected result: structured batch meets ≥3 more criteria than naive. If not, diagnose which slot was under-filled — that diagnosis skill is the module's real product.

---

## Gate 3

- [ ] Project created; ingredient pinned
- [ ] All four calibration probes recorded (cE/cC/cF/cA)
- [ ] Before/after exhibit archived with scoring notes
- [ ] ≥6 log rows total

## Quiz

1. Which subsystem keeps your building recognizable across generations?
2. Craft-tier spend is high but nothing is shortlisted. Which lesson applies?
3. Your wording is polished but facades melt. Fix rank order?

<details><summary>Answers</summary>
1. Ingredients / asset references.
2. Tier economics health rule (M01.4) — broken explore loop.
3. Base image quality → ingredients → slots; wording last.
</details>

**Next:** Module 04 — Governance: The Red Rules.
