# Module 01 — The AI Visualization Landscape

> Duration: ~80 min · Prerequisites: M00 · Produces: completed tool scorecard + calibration notes

## Learning objectives

1. Classify any current AI visual tool into capability classes C1–C5.
2. Explain four model behaviors that determine every troubleshooting outcome.
3. Select your primary production tool via weighted scorecard, documented.
4. Apply tiered credit economics to forecast project spend.

---

## Lesson 1.1 — Capability classes, not brands (25 min)

Brands churn; classes persist. Everything on the market reduces to five classes:

| Class | Mechanism | Arch-viz role | Representative tools (2026) |
|---|---|---|---|
| C1 · Text-to-image | prompt → novel image | moodboards, early massing moods | Midjourney, Imagen, Firefly |
| C2 · Image-to-image | input image + instruction → transformed image | **core engine of this course**: model → render | Gemini-family image models inside Google Flow, Nano Banana-class editors |
| C3 · Controlled generation | geometry/depth/edge-conditioned synthesis | fidelity-critical envelope studies | ComfyUI+ControlNet stacks, Veras, LookX |
| C4 · Video/motion | frames/text → motion | cinematic walkthroughs | Veo-class models in Flow, Runway |
| C5 · Inpaint/outpaint | regional edit / canvas extension | rescue operations | embedded in most C2 tools |

### The professional stack decision

You need exactly one strong **engine** (a C2 or C3 tool) plus an **organizer**. This course standardizes on Google Flow as both engine and organizer because it hosts image generation (C2/C5), motion (C4), project folders, and ingredient reuse under one roof — but the workflows taught here port to any capable C2 tool with reference-image support.

**Trade-off table — engine candidates:**

| Criterion | Flow-class hosted tools | Local ControlNet stacks | Plugin tools (in-SketchUp/Rhino) |
|---|---|---|---|
| Setup cost | minutes | days + GPU | hours |
| Fidelity ceiling | high (with anchors) | highest | medium-high |
| Motion path | built-in | separate stack | usually absent |
| Team scaling | workspace plans | DIY infra | per-seat licenses |
| Confidentiality control | plan-dependent | strongest (on-prem) | cloud-dependent |

## Lesson 1.2 — Model behavior fundamentals (20 min)

Four behaviors explain ~90% of real-world failures. Internalize once; diagnose forever.

1. **Latent interpolation.** Concepts blend toward their most common neighbors. "Brutalist tropical" may drift toward either parent. Fix: anchor rare combinations with references (M07), not adjectives.
2. **Images outweigh words.** A pinned ingredient dominates ten adjectives. Corollary: choose references as carefully as words — they steer harder than text.
3. **Structural hallucination is default behavior, not a bug.** Windows multiply, rails melt, columns split under view stress. Never treat generated geometry as fact (M04 Red Rule 2).
4. **Limited determinism.** Same prompt ≠ same pixels. Repeatability = process (frozen slots, same ingredients, logged draws). Accept pixel-level drift; demand process-level reproduction.

## Lesson 1.3 — LAB: Choosing your first tool (20 min)

Use `templates/tool-selection-scorecard.md`. Requirements:

- Score ≥ 3 candidate engines on all six weighted axes.
- Axis weights: image-to-image geometry fidelity ×3, confidentiality posture ×3, vocabulary response ×2, iteration cost ×2, organization ×2, animation path ×1.
- Write a 5-line rationale; save as `00_GOVERNANCE/TOOL-DECISION.md`.

Sanity checks during trials:
- Feed a simple mass cube with one notch — count geometry errors in 4 outputs (fidelity probe).
- Request "recessed loggia band at level 3" — does it understand recess vs overlay? (vocabulary probe)
- Note credits consumed by each trial batch (cost probe).

## Lesson 1.4 — Where the money goes: tier economics (15 min)

Budget in three tiers:

| Tier | Purpose | Share of budget | Quality mode |
|---|---|---|---|
| Explore | breadth, thumbnail batches | ~70% | draft/fast |
| Craft | shortlisted frames at full quality | ~25% | max quality |
| Polish | inpaint/outpaint fixes on finalists | ~5% | targeted edits |

**Health rule:** >50% of credits spent on Craft *before* any frame is shortlisted ⇒ broken explore loop (usually: over-worded prompts producing false confidence, or batch size too small to reveal variance).

Forecast formula:

```
credits_per_deliverable ≈ E·cE + C·cC + F·cF
  E,C,F = counts of explore batches / craft passes / fixes
  cX    = average cost per operation (measured in M03 calibration)
Set project cap = 2 × forecast.
```

---

## Gate 1

- [ ] Scorecard completed for ≥3 tools, weights applied, winner declared
- [ ] `TOOL-DECISION.md` saved with rationale
- [ ] Calibration probes run once; costs recorded in generation log
- [ ] You can name the capability class of any tool a colleague mentions

## Quiz

1. Which class converts *your* geometry into renders?
2. Your outputs drift "brutalist tropical" toward plain concrete boxes. Behavior #? and fix?
3. Team spends 60% of credits on craft passes before shortlisting. Diagnosis?

<details><summary>Answers</summary>
1. C2 (image-to-image), with C3 when conditioning is added.
2. Latent interpolation toward the common neighbor; fix with pinned references.
3. Broken explore loop — return to 4-up draft batching until ≥75% criteria met on two consecutive rounds.
</details>

**Next:** Module 02 — Get Organized: The Studio OS.
