# Module 02 — Get Organized: The Studio OS

> Duration: ~90 min · Prerequisites: M00, M01 · Produces: log sheet in use + RenderForge stub + passing base model

## Learning objectives

1. Run parallel generation sessions without orphaned outputs.
2. Operate the three-layer prompt library (masters → instances → snippets).
3. Prepare base models that survive AI rendering with minimal rescue.

---

## Lesson 2.1 — Tab discipline (20 min)

Generation sessions fail organizationally before they fail technically. Standard session:

```
[Tab 1] Flow project — active scene      ← ONLY tab where you generate
[Tab 2] Prompt master doc                ← frozen slot template (renderforge-master)
[Tab 3] Reference board                  ← style refs for THIS scene only
[Tab 4] Generation log                   ← one row per generation, no exceptions
```

Rules:

- One active scene at a time. Two scenes = two half-logged sessions = zero reproducibility.
- Download selects from output history into `40_RENDERS/WIP/` immediately; platform history is not an archive.
- End-of-session ritual (2 min): fill verdict column for every row; export frozen prompt copies.

**Why it matters:** every unlogged generation is a future unanswerable question ("which settings made that?").

## Lesson 2.2 — The generation log (15 min)

Template ships as `templates/generation-log-template.csv`. Columns:

| Column | Content | Why |
|---|---|---|
| gen_id | `P012_north_v03_g07` | unique, sortable, embeds scene+version |
| timestamp | ISO date-time | burn-rate analysis |
| scene / view / style | dropdown values used | reconstruct intent without opening files |
| inputs | base image + ingredients (filenames) | provenance chain |
| prompt_snapshot | link to frozen copy in `30_PROMPTS/` | Rule 6 compliance |
| tier | explore/craft/polish | budget analytics |
| credits | cost | forecasting calibration |
| verdict | KEEP / KILL / PATCH(type) | acceptance-rate KPI |
| patch_type | word/region/extension/anchor/tier | rescue-pattern analysis |
| file_path | final location if kept | retrieval |

Weekly rollup (5 min, Monday): acceptance rate, credits by tier, dominant patch type. These three numbers run the whole operation (M09 KPIs).

## Lesson 2.3 — Three-layer prompt library (25 min)

```
Layer 1 MASTERS    02_WORKFLOWS/*.md        versioned, semver, changelog block,
                                            edited only by owner/viz lead
Layer 2 INSTANCES  <project>/30_PROMPTS/    master + filled slots for ONE scene;
                                            frozen before generating; never retro-edited
Layer 3 SNIPPETS   03_LIBRARY/PROMPT_SNIPPETS.md  tested phrases by category
```

Versioning discipline:

- Master change that alters outputs ⇒ minor bump (`v1.4.0 → v1.5.0`) + changelog line.
- Option additions to a bank without changing defaults ⇒ patch bump.
- Instance filenames reference master version used: `P012_north_v03__rf1.4.md`.

Anti-patterns to ban on sight:
- "Quick fix" edits to a frozen instance (fork a new instance instead)
- Snippets pasted into prompts without a trial batch first (snippets are *tested* phrases or they aren't snippets)
- Masters duplicated across personal folders (one source of truth, git-tracked — see M09.1)

## Lesson 2.4 — LAB: Base-model hygiene (30 min)

Run `templates/naming-convention.md` checklist against one real model. Full protocol:

1. **Export wide.** Frame the widest view you may need; outpainting later costs quality and credits.
2. **Neutral background.** Kill stray geometry, helper objects, dimension tags; plain sky/void backdrop.
3. **Set eye level in-model.** Street views ~1.6 m camera height *before export* — don't leave SketchUp's default.
4. **Rough sun match.** Point shadows toward your intended lighting preset family (golden-hour vs overcast).
5. **Scale anchor.** Include one door/bollard/person-height element so relative scale survives interpretation.
6. **README.txt beside file:** scale, north direction, program summary, date.
7. **Name per convention**, place in `10_BASE/`.

Then render one hygiene-passing frame vs one deliberately sloppy frame (default camera, cluttered background) — archive both comparisons; this contrast becomes your team-training exhibit.

---

## Gate 2

- [ ] Log sheet live; ≥3 rows already recorded from trials
- [ ] `RenderForge v1.0.0` stub saved in `02_WORKFLOWS/`
- [ ] One base model passes hygiene checklist; comparison pair archived

## Quiz

1. What's the difference between a master and an instance?
2. Which three log columns feed the weekly rollup KPIs?
3. Why set camera height in the 3D model rather than trusting the generator?

<details><summary>Answers</summary>
1. Master = versioned template with {{slots}}, editable by owner only; instance = frozen filled copy tied to one scene/view, never retro-edited.
2. Verdict (acceptance rate), credits×tier (burn), patch_type (rescue patterns).
3. Vantage is geometry-critical intent; generators invent cameras freely unless anchored by input framing.
</details>

**Next:** Module 03 — Google Flow Deep Dive.
