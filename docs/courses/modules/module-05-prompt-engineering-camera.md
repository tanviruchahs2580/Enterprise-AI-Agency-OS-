# Module 05 — Prompt Engineering: The C.A.M.E.R.A. Framework

> Duration: ~100 min · Prerequisites: M03 · Produces: one criteria-passing structured render with single-slot patch history

## Learning objectives

1. Diagnose naive-prompt failures by symptom → slot mapping.
2. Construct any architectural prompt as six ordered slots.
3. Refine via SHOOT → REVIEW → PATCH → RE-SHOOT with one-slot discipline.
4. Split constants (custom instructions) from variables (slots).

---

## Lesson 5.1 — Why prompts fail (15 min)

Failure is rarely random. Symptom table:

| Symptom | Root cause | Failing slot |
|---|---|---|
| Building doesn't match my model | weak input anchoring | **A**rchitecture anchors |
| Mood shifts between runs | unspecified environment | **E**nvironment |
| Materials read plastic/unreal | missing physical qualifiers | **M**aterials |
| Camera feels arbitrary | no lens/height/vantage spec | **C**omposition |
| Video-game screenshot look | no photographic register | **R**ender style |
| "Great except…" forever | acceptance criteria absent | second **A**djustments |

The table's power: you stop *rewording* and start *locating*. One symptom, one slot, one patch.

## Lesson 5.2 — The six slots (40 min)

Fill top-to-bottom; an empty slot is a decision delegated to the model.

### [C] COMPOSITION & CAMERA
Vantage, height, lens, framing, foreground strategy. Specify all four; models default to flattering-but-wrong cameras.

```text
street-level two-point perspective, camera at 1.6 m eye height,
24 mm equivalent, subject centered-left with sidewalk leading line
entering bottom-right, one-third sky
```

Verticals note: request "architectural two-point perspective correction" whenever humans stand near the frame edge.

### [A] ARCHITECTURE ANCHORS
The sacred list — what must survive exactly. Phrase as preserve + forbid:

```text
preserve the modeled massing exactly: 8-storey slab, recessed ground-floor
colonnade, north circulation core. Do not add floors, balconies, or rooftop
structures.
```

Keep it to 2–4 items; anchoring everything anchors nothing.

### [M] MATERIALS & TEXTURES
Palette + physical behavior. Bare nouns render plastic; behavior verbs render real:

```text
board-formed concrete with visible tie holes and rain patina,
low-iron glazing with ceramic frit gradient on levels 2–7,
anodized aluminum fins, warm oak soffits at the colonnade
```

Behavior vocabulary bank: `tie holes, rain patina, efflorescence, brushed/anodized, ceramic frit, low-iron, honed/flamed stone, brushed grain, oxide streaking, weathering (corten) bloom`.

### [E] ENVIRONMENT & LIGHTING
Time + sky + ground condition + life density:

```text
overcast morning, soft shadowless light, wet pavement with reflective sheen,
sparse deciduous trees, few pedestrians in natural motion blur
```

Match lighting to communication goal (see M06.4): golden-hour flatters mass; overcast reveals facade rhythm.

### [R] RENDER STYLE
Photographic register and fidelity bar:

```text
photorealistic architectural photography, full-frame DSLR look,
natural color grading, sharp throughout, editorial realism —
not CGI-looking, no HDR halos
```

### [A] ADJUSTMENTS & RULES
Negatives + acceptance criteria — the slot everyone skips:

```text
keep mullion spacing regular and aligned with slab edges; no warped lines;
no text or watermark; horizon level.
```

Writing criteria here pre-commits you before you see results — the anti-moving-goalposts device.

### Worked example

Full assembled block lives in the master syllabus §5.2 and compiles automatically in RenderForge (`templates/renderforge-master-v1.md`).

## Lesson 5.3 — Refinement protocol (30 min)

```
SHOOT   4-up explore batch
REVIEW  grade vs slot-6 criteria BEFORE admiring pixels
PATCH   change exactly ONE slot per iteration; log which
RE-SHOOT craft tier only after two consecutive rounds ≥75% criteria
```

Patch taxonomy:

| Type | Mechanism | Use when |
|---|---|---|
| Word patch | edit one slot, full re-run | systematic miss across all 4 outputs |
| Region patch | inpaint failing region only | 1–2 outputs fail on same small zone |
| Extension patch | outpaint | composition crop regret |
| Anchor patch | re-pin/strengthen ingredient | identity drift of building itself |
| Tier patch | same text, higher quality draw | design approved, fidelity short |

One-slot rule rationale: multi-slot changes destroy cause→effect learning; your log becomes noise exactly when you need signal.

## Lesson 5.4 — Constants vs variables (15 min)

Where the platform offers persistent custom instructions / project memory:

- **Memory holds constants:** house photography style, banned words ("lens flare sunset", "fisheye drama"), fidelity language, disclosure footer reminders.
- **Prompts carry variables:** scene-specific banks, materials, weather, population.

Audit exercise: list your last ten prompts; every phrase appearing ≥8 times is a constant begging for migration into memory.

---

## Gate 5

- [ ] One render meets ALL self-written slot-6 criteria
- [ ] Log shows ≥4 iterations with single-slot patch annotations
- [ ] At least three different patch types exercised once each
- [ ] Custom-instruction audit completed; constants migrated where supported

## Quiz

1. Outputs look great except melted balustrades on all four frames. Patch type?
2. Why grade against written criteria *before* viewing?
3. Where do "no lens flare" preferences live? Where does "wet asphalt after monsoon" live?

<details><summary>Answers</summary>
1. Region patch (small zone, all outputs) — not a word patch yet.
2. Pre-commitment prevents post-hoc rationalization of failures as features.
3. Memory/custom instructions (constant); Bank 6 weather slot (variable).
</details>

**Next:** Module 06 — Workflow A: RenderForge Studio.
