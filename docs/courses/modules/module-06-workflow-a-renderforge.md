# Module 06 — Workflow A: RenderForge Studio

> Duration: ~4.5 h across 2–3 sittings · Prerequisites: M05 + `templates/renderforge-master-v1.md` installed
> Produces: three certified scenes (day/aerial/night) + one animation + rescue record

## Learning objectives

1. Install and operate the 8-bank dropdown render system without manual prompt writing.
2. Command lighting, camera, weather, population, extensions, and motion through slot selection alone.
3. Execute the five-rung rescue ladder on failing renders.

---

## Lesson 6.0 — Architecture of the workflow (10 min)

RenderForge = **master template with eight dropdown banks**, compiled by a fixed assembler into a C.A.M.E.R.A. block. You never write prompts; you *select*. Read `templates/renderforge-master-v1.md` §1–8 now — every option is a pre-tested phrase bundle.

Why dropdowns beat typing in production:

| Typed prompting | Dropdown selection |
|---|---|
| quality varies by operator literacy | floor raised to bundle quality |
| house style drifts per person | consistency enforced by palette |
| onboarding = weeks of taste-training | onboarding = bank familiarity |
| debugging = reading prose | debugging = which-bank question |

## Lesson 6.1 — First look (10 min)

DEMO SCRIPT: open any fully compiled instance; highlight each bank's phrase inside the block; then show its visual contribution in the paired output. Train your eye to *read renders as compiled prompts* — every material, shadow direction, and lens character you see corresponds to a slot somewhere.

## Lesson 6.2 — Installing into your account (25 min)

LAB STEPS:

1. Copy master → `02_WORKFLOWS/renderforge.master.v1.md` (git-tracked; see M09).
2. Create Flow project `<project>_RF_<scene>`; pin hygiene-passing base as primary ingredient.
3. Fill banks for scene #1 (`exterior-street` day view). Compile per §10.
4. **Freeze** instance copy to `30_PROMPTS/P001_street_v01__rf1.0.md`.
5. Generate explore batch; log row.

Exit: first RenderForge-generated batch exists and is logged.

## Lesson 6.3 — Scene, surroundings & materials (35 min)

Bank interplay rules:

- **Surroundings = truth, not flattery.** Select the site's real condition (`urban-core` ≠ pick because it's dramatic; pick because neighbors are mid-rise). Wrong context reads fake instantly to clients who know the site.
- **Material sets are behavior bundles.** Each option ships physical qualifiers (tie holes, frit gradients, verdigris onset) because bare nouns ("concrete") render plastic. Never strip qualifiers when customizing.
- **Pairing table** (start here, extend via PR):

| Scene type | Natural surroundings | Material sets that shine |
|---|---|---|
| exterior-street | urban-highstreet / mixed-use-infill | brick-contextual, metal-shingle |
| exterior-aerial | urban-core / park-edge | glass-tower-premium, perforated-screen |
| night-elevation | urban-core | glass-tower-premium, marble-luxury |
| courtyard | tropical-green / park-edge | rammed-earth, timber-mass |

LAB A: same scene × three material sets. Log credits + verdicts. Deliverable: one-page comparison PDF → `50_DELIVERABLES/training/M06_material_sets.pdf`.

## Lesson 6.4 — Lighting & camera overrides (45 min)

Preset logic decoded:

| Preset | Sun | Sky | Shadow | Best for |
|---|---|---|---|---|
| dawn | 5° | cool gradient | long, soft | serene hero shots |
| morning-overcast | none visible | flat diffuse | absent | facade rhythm studies |
| golden-hour | low warm | amber | long dramatic | marketing heroes |
| harsh-noon | high | saturated | short hard | honest massing reads |
| blue-hour | below horizon | cobalt | ambient | glow-through elevations |
| west-raking | 15° W | warm-neutral | extreme texture relief | material detail stories |

Override syntax (§11): max two per prompt, never contradicting the preset. Good: `OVERRIDE: raking light from west at 15 degrees`. Bad: golden-hour preset + "shadowless" override — contradictions produce muddy light logic.

Communication-goal matcher:

- Selling *form* → golden-hour / dawn
- Studying *facade rhythm* → morning-overcast
- Showing *material craft* → west-raking
- Conveying *urban life* → blue-hour / night-urban-glow

## Lesson 6.5 — Camera angles I: low/worm's-eye (20 min)

`low-worm-18mm` communicates monumentality and canopy depth. Failure watch:

- Vertical convergence exaggeration → Bank 8's two-point correction phrase must survive compilation
- Ground-plane paving smears at extreme angles → anchor patch: pin a paving reference image

Exercise: worm's-eye + `perforated-screen` set; verify screen porosity survives the steep angle (it often invents solid panels — note it).

## Lesson 6.6 — Camera angles II: bird's-eye (20 min)

`bird-35mm-drone` situates project in fabric; `topdown-oblique` reads diagrammatic — excellent for boards, wrong for heroes. Failure watch: rooftop plant invented → add negative "no rooftop plant unless modeled" to slot 6; or mask roof region during inpaint passes.

Context radius tip: pair aerials with `urban-core`/`park-edge`; aerial + `interior-*` scenes is a category error the model resolves by hallucinating cutaway floors.

## Lesson 6.7 — External elements (15 min)

Population banks carry behavioral qualifiers ("commuters mid-stride", "café seating occupied") because density without behavior reads as mannequin placement.

Rules:

- Facade-study deliveries use `empty` — people distract from envelope evaluation
- Vehicles match local market handedness — clients notice steering wheels before architecture
- Event-density adds scale AND noise; reserve for placemaking narratives

## Lesson 6.8 — Built-in outpaint & multishot (20 min)

**Outpaint protocol:** extend ≤30% beyond original edge per pass; re-run from source rather than stacking passes (stacking compounds style drift at seams). Primary uses: sky margin recovery for mastheads (hero-16x9), width for ultrawide crops.

**Multishot discipline:** 4-up explore → select → 2-up craft. Batch size rationale: 4 reveals variance patterns (systematic vs random failures) that singles hide.

## Lesson 6.9 — Custom instructions for fine control (15 min)

Migrate firm constants into platform-level memory/custom instructions:

- House grading sentence ("natural color grading, editorial realism…")
- Banned clichés list (lens flare sunset, fisheye drama, HDR halos)
- Watermark position rule if applicable
- Disclosure reminder footer for exports

Verify inheritance: new team member generates test frame; constants must appear unprompted.

## Lesson 6.10 — Animation (30 min)

Stills→motion protocol:

1. Source frame MUST be an approved SELECT (never animate unapproved compositions)
2. Motion prompt template:
   ```text
   slow dolly-in along the colonnade, pedestrians continue walking naturally,
   leaves subtle movement, 5 seconds, single continuous shot, no cuts,
   architectural lines remain rigid
   ```
3. Guardrails: ONE camera move per shot; reject warped-facade clips immediately — do not attempt repair; re-shoot from still
4. Log cA calibration number if not yet recorded

## Lesson 6.11 — Improving an existing render: the rescue ladder (20 min)

Climb strictly in order; stop when fixed:

| Rung | Intervention | When |
|---|---|---|
| 1 | Region inpaint | small zone fails |
| 2 | Anchor patch (re-pin ingredient) | building identity drifting |
| 3 | Word patch (one slot) | systematic miss all outputs |
| 4 | Tier upgrade re-run | approved design, fidelity short |
| 5 | Full recompose | composition fundamentally wrong |

Anti-pattern: jumping to rung 5 (recomposing) because it feels productive — destroys provenance and burns credits.

## Lesson 6.12 — Wrap-up & recap quiz (10 min)

1. Which bank prevents "mannequin city"? 2. Two overrides max — why? 3. Rung order when one corner column melts?
<details><summary>Answers</summary>
1. Bank 7 behavioral qualifiers. 2. Contradictions muddy light/logic; overrides are exceptions, not features. 3. Region inpaint (rung 1), escalate only on failure.
</details>

---

## Gate 6 — Workflow A certification

- [ ] Master installed, version-tagged v1.0.0, changelog initialized
- [ ] Three scenes delivered: exterior-day, aerial, night-elevation
  - each: frozen instance + complete log rows + finals in `SELECTS/`
- [ ] ≥1 documented rescue (ladder rung noted)
- [ ] One ≥5 s animation from approved still
- [ ] Total credit spend within 2× forecast (calibration numbers from M03)
- [ ] Material-set comparison PDF archived

**Next:** Module 07 — Workflow B: IdeaForge Style Engine.
