# Module 07 — Workflow B: IdeaForge Style Engine

> Duration: ~4 h · Prerequisites: M05, M06 · Produces: two certified sprints + growing catalogs
> Companion assets: `ideaforge-schema.json` · `ideaforge-sprint-worksheet.md` · `facade-systems-catalog-starter.md` · `design-moves-vocabulary.md`

## Learning objectives

1. Run the 4M ideation method (MASS → MATRIX → MUSE → MINE) under a 60-minute clock.
2. Build and reuse a facade-systems catalog and design-move vocabulary.
3. Blend references with discipline (triad formula).
4. Author JSON-structured prompts for team-consistent generation.

---

## Lesson 7.1 — StyleGen decoded: capabilities & limits (15 min)

| Excellent at | Poor at |
|---|---|
| facade articulation & fenestration studies | programmatic logic (windows wherever "looks good") |
| material identity & weathering | code compliance, egress sense |
| massing-scale silhouette options | thermal/constructability judgment |
| mood separation across candidates | dimension accuracy of any kind |

Sprint design consequence: optimize for **separation** — five directions must differ in *silhouette logic*, not color grading. Two brick options with different moves beat five beige towers.

## Lesson 7.2 — Setup & navigation (20 min)

Per-sprint Flow project: `<project>_IDEA_sprint<nn>`. One geometry ingredient only (the mass). Style references attach per matrix row, not globally — global refs bleed across directions and flatten separation.

## Lesson 7.3 — Preparing resources (15 min)

Reference board curation:

- 5–10 refs max per sprint; more dilutes steering
- Tag every ref: `system:` · `material:` · `mood:` (tags feed the matrix)
- Rights check per ref (Red Rule 4); store in `03_LIBRARY/STYLE_REFS/<sprint>/`

## Lessons 7.4–7.7 — Facade systems catalog build-out (4 × 20 min)

Open `templates/facade-systems-catalog-starter.md` (16 seeded entries across four families). Each lab adds/refines entries through live testing:

| Lab | Family focus | Test protocol |
|---|---|---|
| 7.4 | Layered/screen | render each entry once on your mass; grade fidelity; note failure modes |
| 7.5 | Grid/frame | test rhythm phrases against irregular masses; record drift |
| 7.6 | Folded/plate | stress-test silhouette moves; watch for origami-inflation |
| 7.7 | Textured/mass | verify strata/course wording survives distance views |

Catalog entry schema (maintained in the starter file):

```text
### <system name>
phrase: "<tested prompt wording>"
family: layered | grid | folded | textured
partners: [materials that flatter it]
failure_modes: [<known breaks + fixes>]
camera_pair: <best Bank 5 option>
```

Target by course end: ≥16 tested entries; enterprise target: 24+.

## Lessons 7.8–7.9 — Reference + material + facade blending (2 × 28 min)

**Triad formula** — one geometry source + one system + one material + one rhythm reference per generation:

```text
Using the attached mass model as exact geometry:
compose a facade in [SYSTEM from catalog] executed in [MATERIAL],
following the spatial rhythm of reference image [#n]
while keeping [ANCHOR: 2–3 features that must survive].
Style mood: [MOOD TAG]. Photorealistic study render, neutral daylight.
```

Blend discipline drills:

1. **Two-rhythm trap:** stack two rhythm references deliberately; observe mush; log as anti-exhibit.
2. **Anchor starvation:** run once without anchors on an L-shaped mass; count invented wings.
3. **Strength ladder:** same blend at weak/medium/strong reference strength; find your platform's sweet spot empirically.

## Lesson 7.10 — Using JSON (25 min)

JSON trades poetry for parseability. Read `templates/ideaforge-schema.json` fully; then:

Why teams adopt it:

- diffs cleanly in git (see *what changed* between sprints)
- fills programmatically from spreadsheet rows (matrix = sheet)
- survives translation for multilingual studios
- validates: missing fields fail loudly instead of silently delegating to the model

LAB: convert three prose triads from 7.8 into schema-valid JSON; validate; generate; compare separation vs prose versions.

## Lesson 7.11 — Design moves (30 min)

Open `templates/design-moves-vocabulary.md` (12 seeded moves). A move is a *named geometric operation* with a tested phrase — this is what converts outputs into defensible narratives ("we shifted the crown to protect neighboring courtyard daylight").

LAB: apply three moves to one mass; produce contact sheet; write one-line rationale per output using the move's narrative template.

## Lesson 7.12 — The 60-minute concept sprint (timed)

Run strictly from `templates/ideaforge-sprint-worksheet.md`:

```
00–08  MASS      hygiene check, pin ingredient, freeze anchors list
08–18  MATRIX    5 rows from catalog: system × material × move
18–45  GENERATE  one JSON per row, explore tier, 4-up;
                 KILL/KEEP triage between rows (no admiring)
45–55  MINE      select keepers; tag move + rationale each
55–60  PACKAGE   contact sheet + rationales → 50_DELIVERABLES/
```

Separation exit criterion: no two keepers share BOTH system AND move.

---

## Gate 7 — Workflow B certification

- [ ] Two completed sprints archived (worksheet + contact sheets + JSON instances)
- [ ] Facade catalog ≥16 tested entries with failure notes
- [ ] Design-move vocabulary extended with ≥1 original move (tested)
- [ ] One sprint completed under 60:00 with all artifacts reproducible

## Quiz

1. Why attach style refs per matrix row rather than globally?
2. Two keepers share system AND move. What happens?
3. What does the `lock` array guarantee — and what does it NOT?

<details><summary>Answers</summary>
1. Global refs bleed across directions, flattening separation.
2. Fails separation criterion; regenerate one row with a different move.
3. Guarantees steering intent toward preserved features; guarantees nothing about constructability or dimensions.
</details>

**Next:** Module 08 — Client-Ready Deliverables.
