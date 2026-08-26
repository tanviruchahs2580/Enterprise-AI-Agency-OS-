# Module 00 — Orientation & Operating Contract

> Duration: ~60 min · Prerequisites: none · Produces: studio folder tree + naming doc

## Learning objectives

By the end of this module you can:

1. Explain what AI visualization can and cannot do in professional practice.
2. Deploy the standard studio folder tree and naming convention.
3. State the three operating truths that govern every later exercise.

---

## Lesson 0.1 — How this course works (15 min)

Every module runs the same rhythm:

```
CONCEPT → DEMO → LAB → GATE (pass/fail checklist) → ARTEFACT (saved to library)
```

Artefacts compound: by Module 9, the files you produced in Modules 0–7 *are* your firm's pipeline documentation. This is deliberate — the course doesn't teach you to render; it teaches you to build **a rendering system that other people can run**.

### How to study

- Do every lab with a real project you care about; motivation dies on toy examples.
- Keep the generation log open from Module 2 onward (template: `templates/generation-log-template.csv`).
- When a lesson says "freeze" a prompt, it means: copy the exact compiled text into `30_PROMPTS/` before generating. No exceptions, ever.

### Course map

| Phase | Modules | You become able to… |
|---|---|---|
| Foundations | 00–04 | operate safely, organized, and informed |
| Engine | 05 | construct any architectural prompt systematically |
| Workflows | 06–07 | produce renders and concepts without manual prompts |
| Practice | 08–10 | deliver to clients and scale across a team |

---

## Lesson 0.2 — The three truths of AI rendering (15 min)

### Truth 1 — The model is the truth; the image is an interpretation

Diffusion-based generators re-imagine your geometry statistically. Your SketchUp model says "this window is here"; the model says "windows like this tend to look like this." Every output is therefore a *proposal about appearance*, carrying zero information about dimension, feasibility, or code. Professionals exploit this (fast beauty) while containing it (governance, Module 4).

**Practical consequence:** every client-facing image carries an "indicative imagery" qualifier unless geometry has been verified frame-by-frame against the model.

### Truth 2 — Control is bought with structure

Freeform prompting is a lottery because you re-negotiate the entire scene description every run. Structured prompting — fixed slots, fixed anchors, frozen instances — moves variance out of the language and into the *draw*, where it belongs (you want variation between candidates, not within your intent).

This course's structure: the **C.A.M.E.R.A. framework** (Module 5) inside two workflow systems:

| System | File | Purpose |
|---|---|---|
| `RenderForge Studio` | `templates/renderforge-master-v1.md` | controlled photoreal rendering from your model |
| `IdeaForge Style Engine` | `templates/ideaforge-schema.json` | separated concept generation from a mass |

### Truth 3 — Speed changes process, not liability

Rendering 20 options in an hour does not lower your duty of care — it *raises the stakes of curation*. If you show a client 20 images, you are implicitly endorsing 20 directions. Hence: triage discipline (Module 7), QA gates (Module 9), disclosure rules (Module 4).

---

## Lesson 0.3 — LAB: Set up your studio (30 min)

Create this tree at a location backed up by your firm's normal file policy:

```
AI-VIZ-STUDIO/
├── 00_GOVERNANCE/
├── 01_PROJECTS/P001_<client>_<project>/{10_BASE,20_FLOWS,30_PROMPTS,
│                                        40_RENDERS/{WIP,SELECTS,FINAL},
│                                        50_DELIVERABLES}
├── 02_WORKFLOWS/
├── 03_LIBRARY/{STYLE_REFS,FACADE_SYSTEMS,MATERIAL_SWATCHES,PROMPT_SNIPPETS}
└── 99_ARCHIVE/
```

Then:

1. Copy `templates/naming-convention.md` into `00_GOVERNANCE/NAMING.md`.
2. Copy `templates/generation-log-template.csv` into `03_LIBRARY/`.
3. Create project folder `P001_TRAINING_<yourname>` for all course exercises.

---

## Gate 0 (pass/fail)

- [ ] Folder tree exists exactly as specified
- [ ] `NAMING.md` saved in `00_GOVERNANCE/`
- [ ] Generation log CSV opened, headers verified
- [ ] Training project `P001_TRAINING_<yourname>` created

## Quiz (answers at bottom)

1. A render shows a balcony your model doesn't contain. What class of statement is that image making?
2. Why do we freeze prompt copies *before* generating?
3. Which truth explains why showing clients more images demands *more* discipline?

<details><summary>Answers</summary>

1. An unverified proposal about appearance — treat as indicative only.
2. Provenance/reproducibility (Red Rule 6): if you can't reproduce it, you don't deliver it.
3. Truth 3 — speed raises curation stakes and implicit endorsement.
</details>

**Next:** Module 01 — The AI Visualization Landscape.
