# Instant Renders, Infinite Concepts
## Enterprise AI Visualization & Ideation Pipelines for Architecture

**A professional course for architects, visualization leads, and design-technology teams**

> **Provenance note.** This document is an original, independently authored curriculum covering the same professional domain as the Flora Faculty course *"Render Instantly & Ideate Endlessly: AI Visualization & Idea Generation, Powered by Custom Workflows"* (Architect Shamim Azad). No gated lesson content was accessed or reproduced. All workflows, frameworks, templates, and examples below are original to this document and are designed for enterprise deployment.

> **📦 Expanded package available.** This master syllabus is now delivered as a full package: per-module lesson files in [`modules/`](./modules/) and operational assets (RenderForge dropdown master, IdeaForge JSON schema, sprint worksheets, catalogs, checklists) in [`templates/`](./templates/). Start at [`README.md`](./README.md) for the package map and delivery schedule.

---

## Table of Contents

1. [Course Charter](#1-course-charter)
2. [Module 0 — Orientation & Operating Contract](#module-0--orientation--operating-contract)
3. [Module 1 — The AI Visualization Landscape](#module-1--the-ai-visualization-landscape)
4. [Module 2 — Get Organized: The Studio OS](#module-2--get-organized-the-studio-os)
5. [Module 3 — Google Flow Deep Dive](#module-3--google-flow-deep-dive)
6. [Module 4 — Governance: The Red Rules](#module-4--governance-the-red-rules)
7. [Module 5 — Prompt Engineering: The C.A.M.E.R.A. Framework](#module-5--prompt-engineering-the-camera-framework)
8. [Module 6 — Workflow A: RenderForge Studio](#module-6--workflow-a-renderforge-studio)
9. [Module 7 — Workflow B: IdeaForge Style Engine](#module-7--workflow-b-ideaforge-style-engine)
10. [Module 8 — Client-Ready Deliverables](#module-8--client-ready-deliverables)
11. [Module 9 — Enterprise Operations & Scale](#module-9--enterprise-operations--scale)
12. [Module 10 — Capstone, Assessment & Certification](#module-10--capstone-assessment--certification)
13. [Appendix A — Master Template Library](#appendix-a--master-template-library)
14. [Appendix B — Checklists](#appendix-b--checklists)
15. [Appendix C — Troubleshooting Matrix](#appendix-c--troubleshooting-matrix)
16. [Appendix D — Glossary](#appendix-d--glossary)

---

## 1. Course Charter

### 1.1 Mission

Take any SketchUp (or equivalent) base model from **mass to photoreal render in minutes**, and from **mass model to five defensible design concepts in under an hour** — using two repeatable, dropdown-driven custom workflows built entirely inside Google Flow, with zero new CAD software and zero manual prompt-writing at production speed.

### 1.2 Who this is for

| Audience | Entry profile | Outcome |
|---|---|---|
| Architecture students (3rd yr+) | Basic 3D modeling | Portfolio-grade AI renders + a personal workflow |
| Practicing architects | Production experience | Same-day concept packages for client meetings |
| Visualization leads | Team responsibility | Standardized pipeline, QA gates, prompt libraries |
| Design-tech / BIM managers | Firm-level mandate | Rollout SOPs, governance, cost controls |

### 1.3 Prerequisites

- Basic English reading/writing (interface labels, template fields)
- A free Google account (paid Google AI plan recommended — credit throughput matters in production)
- One base 3D model (SketchUp, Revit export, Rhino mass, even a foam-block massing study photographed on white)
- **No** prior AI/prompting experience required

### 1.4 Time budget

| Track | Pace | Total effort |
|---|---|---|
| Sprint | 1 module/day | ~10 working days |
| Studio | 2 evenings/week | ~6 weeks |
| Self-paced | — | ≈ 14 hours core + labs + capstone |

### 1.5 The two workflows you will build

| Workflow | Codename | Job-to-be-done | Speed target |
|---|---|---|---|
| **A — Render Pipeline** | `RenderForge Studio` | Base model → photoreal client-ready render with controlled camera, materials, lighting, weather | ≤ 10 min per finished frame after setup |
| **B — Ideation Engine** | `IdeaForge Style Engine` | Mass model → 5+ distinct, presentable design directions via style matrix + reference blending | ≤ 60 min per concept sprint |

Both are **prompt systems, not prompts**: structured, versioned documents with fixed slots (dropdowns), so anyone on the team produces consistent results without writing prompts from scratch.

---

## Module 0 — Orientation & Operating Contract

**Objectives**
- Understand what AI visualization can and cannot do professionally.
- Adopt the operating contract that governs every exercise in this course.

**Lesson 0.1 — How this course works (15 min)**

Every module follows the same rhythm:

```
CONCEPT → DEMO → LAB → GATE (checklist) → ARTEFACT (saved to your library)
```

You finish each module with an artefact (a template, a rendered set, a checklist). By Module 9 these artefacts *are* your firm's pipeline documentation.

**Lesson 0.2 — The three truths of AI rendering (15 min)**

1. **The model is the truth; the image is an interpretation.** Diffusion models re-imagine your geometry. Every render is a *proposal* about how your building could look — not evidence that it will.
2. **Control is bought with structure.** Freeform prompting gives lottery results. Slot-based prompting (this course's method) gives repeatability.
3. **Speed changes process, not liability.** Rendering faster does not lower your duty of care. Module 4 covers where the legal/ethical lines are.

**Lesson 0.3 — Set up your studio (Lab, 30 min)**

Create the folder skeleton you'll use for the entire course:

```
AI-VIZ-STUDIO/
├── 00_GOVERNANCE/          # red rules, disclosure policy, license notes
├── 01_PROJECTS/
│   └── P001_<client>_<project>/
│       ├── 10_BASE/        # clean exports from SketchUp/Revit/Rhino
│       ├── 20_FLOWS/       # Flow project links, one folder per scene
│       ├── 30_PROMPTS/     # frozen .md copies of every prompt used
│       ├── 40_RENDERS/
│       │   ├── WIP/
│       │   ├── SELECTS/
│       │   └── FINAL/
│       └── 50_DELIVERABLES/ # boards, decks, before-after sheets
├── 02_WORKFLOWS/           # RenderForge + IdeaForge master templates
├── 03_LIBRARY/
│   ├── STYLE_REFS/         # licensed/reference imagery, tagged
│   ├── FACADE_SYSTEMS/     # your facade catalog (Module 7)
│   └── MATERIAL_SWATCHES/
└── 99_ARCHIVE/
```

Naming convention (non-negotiable): `P<nnn>_<scene>_<view>_<style>_<v##>_<yyyymmdd>`
Example: `P012_tower_north-persp_brutalist-warm_v03_20260826.png`

✅ **Gate 0:** Folder tree exists; naming convention saved in `00_GOVERNANCE/NAMING.md`.

---

## Module 1 — The AI Visualization Landscape

**Objectives**
- Map the current generation of AI visual tools by *capability class*, not brand hype.
- Choose a primary tool deliberately, using a scorecard instead of vibes.

**Lesson 1.1 — Capability classes, not brands (25 min)**

Every current tool reduces to one or more of five classes:

| Class | What it does | Arch-viz role | Examples (as of 2026) |
|---|---|---|---|
| C1 · Text-to-image | Prompt → image from nothing | Moodboards, early ideation | Midjourney, Imagen, Firefly |
| C2 · Image-to-image | Your image + instruction → new image | **Core of this course**: model → render | Gemini image models inside Google Flow, Nano Banana-class editors |
| C3 · Controlled generation | Geometry/depth/edge-conditioned output | Fidelity-critical renders | ComfyUI + ControlNet stacks, Veras, LookX |
| C4 · Video/animation | Frames → motion | Cinematic walkthroughs | Veo-class models inside Flow, Runway |
| C5 · Inpaint/outpaint | Edit regions / extend canvas | Fixes, aspect-ratio rescue, context extension | Built into most C2 tools now |

**Key insight:** the professional stack is usually **one C2/C3 tool as the engine + one organizer**. This course uses Google Flow as both because it hosts image *and* video generation, project folders, and ingredient-based reuse in one place.

**Lesson 1.2 — Model behavior fundamentals (20 min)**

Understand these four behaviors once, and every future troubleshooting session becomes obvious:

1. **Latent space, not lookup.** Models interpolate between everything they've seen. "Brutalist tropical" exists because both concepts exist — but rare combinations drift toward the more common neighbor. Expect to *anchor* rare combos with references (Module 7).
2. **Words are weak; images are strong.** A reference image outweighs ten adjectives. This is why Workflow B is reference-driven.
3. **Models hallucinate structure.** Windows multiply, balustrades melt, columns split. Never treat geometry as buildable fact (Module 4).
4. **Determinism is limited.** The same prompt can yield different seeds/results. Repeatability comes from *process* (fixed slots, fixed references), not from luck.

**Lesson 1.3 — Choosing your first tool (Lab, 20 min)**

Score candidate tools 1–5 on each axis; pick the highest weighted total:

| Axis | Weight | Question |
|---|---|---|
| Image-to-image fidelity to input geometry | ×3 | Does my massing survive the render? |
| Architectural vocabulary response | ×2 | Does it know "recessed balcony band" vs "balcony"? |
| Iteration cost | ×2 | Credits per iteration; monthly ceiling |
| Project/asset organization | ×2 | Can I keep scenes, ingredients, outputs organized? |
| Animation path | ×1 | Is there a credible stills→motion route? |
| Data/confidentiality posture | ×3 | Training-use opt-outs? Team workspace? (see Module 4) |

**Lesson 1.4 — Where the money goes (15 min)**

Credit economics: budget renders in tiers —

- **Explore tier:** low-fidelity fast passes (thumbnail batches) — spend ~70% of credits here
- **Craft tier:** full-quality passes on shortlisted frames — ~25%
- **Polish tier:** inpaint/outpaint fixes on finals — ~5%

Rule of thumb: if >50% of credits go to Craft before any frame is shortlisted, your Explore loop is broken.

✅ **Gate 1:** Completed scorecard for ≥3 tools; chosen primary tool documented with rationale in `00_GOVERNANCE/TOOL-DECISION.md`.

---

## Module 2 — Get Organized: The Studio OS

**Objectives**
- Run many parallel generations without losing track.
- Build the prompt library habit that makes Workflow A/B possible.

**Lesson 2.1 — Tab discipline (20 min)**

Production pattern for browser tabs while generating:

```
[Tab 1] Flow project — active scene        ← the only tab you generate in
[Tab 2] Prompt master doc                  ← the frozen slot template
[Tab 3] Reference board                    ← style refs for this scene only
[Tab 4] Log sheet                          ← one row per generation (below)
```

Never generate in more than one scene tab at a time; parallel tabs produce orphaned outputs nobody logged.

**Lesson 2.2 — The generation log (15 min)**

One spreadsheet, one row per generation. Minimum columns:

| col | purpose |
|---|---|
| gen_id | `P012-north-v03-g07` |
| timestamp | when |
| prompt_snapshot | link to frozen `.md` copy in `30_PROMPTS/` |
| inputs | which base image(s)/ingredients used |
| credits | cost of the pass |
| verdict | KEEP / KILL / PATCH (what kind) |
| file | final path if kept |

This log is what turns "I got lucky once" into "we can reproduce that."

**Lesson 2.3 — Prompt organizer system (25 min)**

Structure your prompt library in three layers:

1. **Masters** (`02_WORKFLOWS/`) — versioned templates with `{{slots}}`. Only you (or the viz lead) edit these. Semantic versioning: `RenderForge v1.4.0`.
2. **Scene instances** (`30_PROMPTS/`) — masters with slots filled for one scene/view. Frozen after use; never edited retroactively.
3. **Snippets** (`03_LIBRARY/PROMPT_SNIPPETS.md`) — tested phrases for recurring elements ("overcast softbox sky", "wet asphalt specular", "people in motion blur"). Tagged by category.

**Lesson 2.4 — Base-model hygiene (Lab, 30 min)**

Checklist before any model enters Flow:

- [ ] Exported at the widest view the composition needs (outpainting later costs quality)
- [ ] Background cleaned to neutral; no stray geometry floating
- [ ] Camera height set to intended eye level (~1.6 m for street views) *in the 3D model*, not left at default
- [ ] Sun position roughly matched to the lighting mood you plan to request
- [ ] File named per convention; placed in `10_BASE/`
- [ ] A `README.txt` beside it noting scale, north, and program (future-you will thank you)

✅ **Gate 2:** Log sheet created; one master template stub saved as `RenderForge v1.0.0`; one base model passing hygiene checklist.

---

## Module 3 — Google Flow Deep Dive

**Objectives**
- Operate Flow fluently: projects, frames, ingredients, outputs.
- Understand the credit system well enough to forecast cost per deliverable.

> ⚠️ **Accuracy note:** Flow's UI evolves quickly (feature names, button locations). The concepts below are stable; verify exact labels against the live interface during the lab.

**Lesson 3.1 — Interface orientation (25 min)**

Mental map of Flow:

- **Projects** = folders. One project per scene-set (e.g., `P012 Tower – North Elevation Studies`). Everything generated inside inherits the project context — this is your organizational unit.
- **Prompt box + settings** = where slots get filled. Settings (aspect ratio, model variant, outputs-per-run) map directly onto RenderForge's dropdown philosophy.
- **Ingredients / asset references** = attach your own images to steer identity of subject/style. This is the single most important feature for architectural work — it's how your building stays *your* building.
- **Frames & Scenebuilder-style sequencing** = storyboard continuity; relevant for animation lessons.
- **Output history** = per-generation results; download selects immediately into `40_RENDERS/WIP/`.

**Lesson 3.2 — Credits, plans, and forecasting (20 min)**

Flow consumption is metered by generation type and quality tier. Practical governance:

1. Run one calibration session (Module 6 Lab A) and record average credits per: explore pass, craft pass, outpaint, animation second.
2. Forecast: `credits_per_deliverable = explores×avg_explore + crafts×avg_craft + fixes`.
3. Set a per-project cap (e.g., 2× forecast) and log burn daily (Lesson 2.2 sheet).

**Lesson 3.3 — Input quality levers (20 min)**

Ranked by impact on output fidelity:

1. **Base image quality** (clean, high-res, correct angle) — biggest lever
2. **Ingredient choice** (which references you pin)
3. **Slot completeness** (empty slots = model guessing)
4. **Model/tier selection** (quality vs draft modes)
5. **Wording polish** — smallest lever; stop over-tuning adjectives

**Lesson 3.4 — First generation end-to-end (Lab, 45 min)**

Guided run: import the Module 2 base model screenshot, write a naive one-line prompt, generate. Then fill a minimal C.A.M.E.R.A. skeleton (next module preview) and regenerate. Compare side-by-side and record observations in the log. This contrast is the pedagogical spine of the whole course.

✅ **Gate 3:** One project created; calibration numbers recorded; before/after comparison saved to `50_DELIVERABLES/training/`.

---

## Module 4 — Governance: The Red Rules

**Objectives**
- Internalize the non-negotiable rules that keep AI visualization safe, legal, and honest in practice.

These rules exist because each one has already burned real firms. Print them. Post them.

### 🔴 Rule 1 — Confidentiality first
Client geometry, site data, and briefs are confidential. Before uploading any model/image to any cloud generator:
- Confirm the platform's training-use and retention policy for your plan tier.
- Prefer team/enterprise workspaces with opt-out guarantees.
- For NDA-heavy projects, use redacted masses (strip signage, logos, identifiable program) or local/on-prem alternatives.
- Never upload another consultant's drawings without checking their IP terms.

### 🔴 Rule 2 — AI output ≠ measured drawing
Generated geometry is statistically plausible, not constructible. Renders may be used for **intent communication only**. Any dimension, area, or detail visible in a render must be traceable to the actual model or be explicitly labeled "indicative".

### 🔴 Rule 3 — Disclose the tool
State AI assistance in proposals, boards, and client conversations ("visualizations produced with AI-assisted rendering from the design model"). Disclosure protects trust; concealment discovered later destroys it. Follow your local institute's guidance (e.g., AIA/RIBA statements on generative AI).

### 🔴 Rule 4 — License hygiene
- Know what your plan grants: commercial-use rights vary by tier and region.
- Style references: use images you have rights to, or genuinely generic styles. Do not clone a living architect's signature building and present it as direction without attribution.
- People in renders: avoid generating recognizable real individuals near real projects.

### 🔴 Rule 5 — No structural promises
Never let a render answer a technical question. If a client asks "is that cantilever possible?", the answer is "the visualization expresses intent; engineering confirms feasibility."

### 🔴 Rule 6 — Version integrity
Every delivered image must be reproducible: frozen prompt copy + input files + generation id, archived together. If you can't reproduce it, you don't deliver it.

### 🔴 Rule 7 — Budget honesty
Track and report credit spend per project like any other project cost. Surprise invoices erode the credibility of the whole initiative.

**Lesson 4.1 — Write your firm's one-page policy (Lab, 30 min)**
Template provided in Appendix B-4. Fill it with your firm's specifics; get principal sign-off.

✅ **Gate 4:** Signed one-page policy in `00_GOVERNANCE/AI-VIZ-POLICY.md`.

---

## Module 5 — Prompt Engineering: The C.A.M.E.R.A. Framework

**Objectives**
- Move from adjective-soup to structured prompts.
- Master the six-slot architecture underlying both workflows.
- Diagnose failures systematically.

**Lesson 5.1 — Why prompts fail (15 min)**

Naive prompt failure modes, diagnosed:

| Symptom | Root cause | Fix slot |
|---|---|---|
| Building doesn't match my model | Weak input anchoring | Architecture anchors (A) |
| Random mood shifts between runs | Unspecified environment | Environment (E) |
| Materials look plastic/unreal | Missing physical qualifiers | Materials (M) |
| Camera feels arbitrary | No lens/height/vantage spec | Composition (C) |
| Looks like a video-game screenshot | No photographic register | Render style (R) |
| Great except one element | Acceptance criteria absent | Adjustments (A) |

**Lesson 5.2 — The C.A.M.E.R.A. framework (core lesson, 40 min)**

Six ordered slots. Fill them top to bottom; never skip a slot — an empty slot is a decision delegated to the model.

```
[C] COMPOSITION & CAMERA   → vantage, height, lens, framing, foreground strategy
[A] ARCHITECTURE ANCHORS   → what must remain EXACTLY as modeled (the sacred list)
[M] MATERIALS & TEXTURES   → envelope palette + physical behavior (roughness, patina…)
[E] ENVIRONMENT & LIGHTING → time, weather, sky, ground condition, vegetation, people density
[R] RENDER STYLE           → photographic register, film/lens character, fidelity bar
[A] ADJUSTMENTS & RULES    → negative constraints, preservation commands, acceptance criteria
```

**Worked example — filled C.A.M.E.R.A. block:**

```text
[C] Street-level two-point perspective, camera at 1.6 m eye height,
    24 mm equivalent, subject centered-left, one-third sky, sidewalk
    leading line entering from bottom-right.
[A] Preserve the modeled massing exactly: 8-storey slab, recessed
    ground-floor colonnade, vertical circulation core on north face.
    Do not add floors, balconies, or rooftop structures.
[M] Board-formed concrete with visible tie holes and rain patina,
    low-iron glazing with ceramic frit gradient on levels 2–7,
    anodized aluminum fins, warm oak soffits at the colonnade.
[E] Overcast morning, soft shadowless light, wet pavement with
    reflective sheen, sparse deciduous trees, few pedestrians in
    natural motion blur, parked bicycles.
[R] Photorealistic architectural photography, full-frame DSLR look,
    natural color grading, sharp throughout, editorial realism —
    not CGI-looking, no HDR halos.
[A] Keep all window mullion spacing regular and aligned with slab
    edges; no warped lines; no text, watermarks, or lens flare.
```

**Why order matters:** models weight early tokens more heavily in many architectures, and reading order groups semantics — camera intent first prevents the model from inventing its own vantage before reaching your material list.

**Lesson 5.3 — Refinement protocol: SHOOT → REVIEW → PATCH → RE-SHOOT (30 min)**

1. **SHOOT** — generate a 4-up batch at explore tier.
2. **REVIEW** — grade each output against the acceptance criteria written in slot A2 *before* looking (prevents moving goalposts).
3. **PATCH** — change **exactly one slot** per iteration; note which slot in the log. Multi-slot changes destroy your ability to learn cause→effect.
4. **RE-SHOOT** — craft tier only after two consecutive explore rounds meet ≥75% of criteria.

Patch taxonomy (use the right patch type):

| Patch type | Mechanism |
|---|---|
| Word patch | edit slot text, re-run full |
| Region patch | inpaint the failing region only |
| Extension patch | outpaint to recover composition |
| Anchor patch | strengthen/re-pin an ingredient reference |
| Seed/tier patch | same text, different draw or higher tier |

**Lesson 5.4 — Custom instructions & standing rules (15 min)**

Where the platform offers persistent custom instructions (project-level memory), move *stable* preferences there: house photography style, forbidden words, default fidelity language. Keep per-scene variation in the slots. Principle: **memory holds constants; prompts carry variables.**

✅ **Gate 5:** One C.A.M.E.R.A.-structured render meeting all self-written acceptance criteria; log shows single-slot patch history across ≥4 iterations.

---

## Module 6 — Workflow A: RenderForge Studio

**Objectives**
- Assemble the dropdown-driven mega-prompt that turns any base model into a controlled render without manual prompt writing.
- Command camera, materials, lighting, weather, external elements, extensions, and animation through slot selection alone.

### 6.0 Architecture of the workflow

RenderForge is a **master template with 8 dropdown banks**. Each bank has pre-tested options; users select, never type. The filled selections compile into one C.A.M.E.R.A. block automatically.

```
BANK 1 SCENE TYPE      : exterior-street / exterior-aerial / courtyard /
                         interior-lobby / interior-unit / rooftop / night-elevation
BANK 2 SURROUNDINGS    : urban-core / suburban / waterfront / desert /
                         tropical-green / mountain / mixed-use street life
BANK 3 MATERIAL SET    : (from firm's approved palettes — see 6.2)
BANK 4 LIGHTING PRESET : dawn / morning-overcast / golden-hour /
                         harsh-noon / blue-hour / night-urban glow
BANK 5 CAMERA PACKAGE  : street-eye-24mm / low-worm-18mm /
                         bird-35mm-drone / top-down-plan-oblique /
                         interior-wide-16mm / close-detail-85mm
BANK 6 WEATHER & FX    : clear / wet-after-rain / fog-light / snow-dust /
                         monsoon-haze / windy-vegetation
BANK 7 POPULATION      : empty / sparse-life / active-street / event-density
BANK 8 OUTPUT SPEC     : 16:9 hero / 4:5 social / A3-board crop /
                         animation-ready still
```

### Lesson 6.1 — First look (10 min)
Walkthrough of a fully compiled RenderForge prompt; identify each bank's contribution in the output.

### Lesson 6.2 — Installing the workflow into your account (25 min)
- Save master template (`Appendix A-1`) into `02_WORKFLOWS/renderforge.master.v1.md`.
- Create a blank Flow project per scene; pin base image as ingredient.
- Compile bank selections into the prompt box using the compiler snippet (Appendix A-2).
- Freeze a copy of every compiled instance into `30_PROMPTS/` **before** generating.

### Lesson 6.3 — Scene, surroundings & materials (35 min)
Bank interplay rules:
- Surroundings sets context objects (street furniture, planting, adjacent-massing hints) — choose the *real* site condition, not the flattering one.
- Material sets are physical-behavior bundles: each option includes roughness/patina/reflection qualifiers, because "concrete" alone renders as plastic.
- Exercise: render the same scene in three material sets; log credit cost and verdicts.

### Lesson 6.4 — Lighting & camera overrides (45 min)
- Lighting presets encode sun angle + sky condition + shadow softness as one token bundle.
- Overrides: append `OVERRIDE:` lines to any preset (e.g., `OVERRIDE: raking light from west at 15° elevation`) — use sparingly; overrides fight presets when contradictory.
- Golden hour flatters massing but hides envelope detail; overcast reveals facade rhythm. Match preset to *communication goal*.

### Lesson 6.5 — Camera angles I: low/worm's-eye (20 min)
- 18 mm worm's-eye communicates monumentality and canopy depth; expect vertical convergence — request "architectural two-point perspective correction" in Bank 8.
- Failure watch: ground-plane textures smear at extreme angles → fix with anchor patch (pin a paving reference).

### Lesson 6.6 — Camera angles II: bird's-eye (20 min)
- Drone-height bird views situate the project in context; pair with Bank 2 surroundings for believable adjacency.
- Top-down obliques read as diagrams — excellent for boards, wrong for marketing heroes.
- Failure watch: roof equipment invented → add to A-slot negatives ("no rooftop plant unless modeled").

### Lesson 6.7 — External elements (15 min)
People, vehicles, planting, birds, street vendors — population banks include behavioral qualifiers ("commuters mid-stride", "café seating occupied"). Rules:
- Population adds scale AND distracts; for facade-study deliveries use `empty`.
- Vehicles must match market (left/right-hand drive) — clients notice.

### Lesson 6.8 — Built-in outpaint & multishot (20 min)
- **Outpaint** recovers compositions: extend sky for board headers, widen for ultrawide crops. Protocol: extend ≤30% beyond original edge per pass; re-run rather than stacking passes.
- **Multishot**: same compiled prompt, multiple draws — the exploration engine. Batch size discipline: 4 draws explore-tier, select, then 2 draws craft-tier.

### Lesson 6.9 — Custom instructions for fine control (15 min)
Register firm-level standing rules (house grading style, banned clichés like "lens flare sunset", mandatory watermark position) into platform-level custom instructions so every team member inherits them.

### Lesson 6.10 — Animation (30 min)
Stills→motion protocol:
1. Select the approved final still (never animate unapproved frames).
2. Motion prompt = camera move + scene dynamics + duration cap:
   `slow dolly-in along the colonnade, pedestrians continue walking naturally, leaves subtle movement, 5 s, no cuts`
3. Guardrails: one camera move per shot; architectural lines must stay rigid — reject clips with warping facades immediately (do not attempt repair; re-shoot).

### Lesson 6.11 — Improving an existing render (20 min)
The rescue ladder — always climb in this order:
1. Region inpaint (smallest intervention)
2. Anchor patch (re-pin ingredient)
3. Single-slot word patch + re-run
4. Tier upgrade re-run
5. Full recompose (last resort)

### Lesson 6.12 — Wrap-up & recap quiz (10 min)

✅ **Gate 6 (Workflow A certification):**
- RenderForge master installed and version-tagged
- Three scenes rendered (exterior day / aerial / night), each: compiled prompt frozen, log complete, ≥1 rescue executed, finals in `SELECTS/`
- One 5-second animation from an approved still
- Total credit spend within 2× forecast

---

## Module 7 — Workflow B: IdeaForge Style Engine

**Objectives**
- Generate 5+ distinct, presentable design directions from a mass model in under 60 minutes.
- Build a reusable facade-system catalog and design-move vocabulary.
- Use JSON-structured prompts for maximum control and team consistency.

### 7.0 The 4M Ideation Method

```
MASS   → clean mass model, geometry locked (form fixed, skin open)
MATRIX → define the style grid (systems × materials × moves)
MUSE   → blend curated references to push directions apart
MINE   → review batch, tag keepers, extract rationale for the client narrative
```

The discipline that makes this professional rather than slot-machine: **you curate the matrix before generating**, so every output is a considered combination, not noise.

### Lesson 7.1 — StyleGen decoded: capabilities & limits (15 min)
- Excellent at: facade articulation, material identity, massing-scale fenestration studies, mood separation across candidates.
- Poor at: programmatic logic (it will put windows wherever looks good), code compliance, thermal sense. Treat outputs as *direction*, verified later against real constraints.
- The 5-concept sprint optimizes for **separation** — directions must differ in silhouette logic, not just color.

### Lesson 7.2 — Setup & navigation (20 min)
Separate Flow project per sprint (`P012-IDEA-sprint01`). Mass image pinned as the sole geometry ingredient; style references attached per matrix row.

### Lesson 7.3 — Preparing resources (15 min)
Reference board curation rules:
- 5–10 refs max per sprint; more dilutes steering.
- Tag each ref: `system:` (e.g., brise-soleil) · `material:` (e.g., terracotta baguette) · `mood:` (e.g., civic-warm).
- Rights check per ref (Rule 4).

### Lessons 7.4–7.7 — Facade systems catalog (4 × ~20 min)

Build `03_LIBRARY/FACADE_SYSTEMS/catalog.md` progressively. Starter taxonomy:

| Family | Systems (examples) | Typical matrix partners |
|---|---|---|
| **Layered/screen** | perforated metal screen, double-skin glass, timber louvre veil, mashrabiya-derived units | warm metals, deep shadows, cultural-context projects |
| **Grid/frame** | expressed structural exoskeleton, punched-grid stone, tile-and-mullion curtain wall, loggia banding | institutional gravitas, urban blocks |
| **Folded/plate** | folded metal rainscreen, shingle cladding (zinc/copper/slate), origami concrete panels | bold silhouettes, museums, pavilions |
| **Textured/mass** | board-marked concrete, brick corbel courses, rammed-earth panels, textured precast | contextual infill, housing, civic warmth |

Each catalog entry stores: description phrase (tested wording), 3 partner materials, 2 known failure modes, best camera pairing. You will grow this to ~24 entries through the four lessons.

### Lessons 7.8–7.9 — Reference + material + facade blending (2 × ~28 min)
The triad blend formula:

```text
Using the attached mass model as exact geometry:
compose a facade in [SYSTEM from catalog] executed in [MATERIAL],
following the spatial rhythm of reference image [#n]
while keeping [ANCHOR: the 2–3 features that must survive].
Style mood: [MOOD TAG]. Photorealistic study render, neutral daylight.
```

Blend discipline: **one geometry source + one system + one material + one rhythm reference per generation.** Stacking multiple rhythm references produces mush.

### Lesson 7.10 — Using JSON (25 min)

JSON prompts trade poetry for parseability — ideal for teams and automation:

```json
{
  "task": "facade_style_study",
  "geometry_source": {"image": "P012_mass_north.png", "lock": ["massing", "floor_count", "setbacks"]},
  "facade": {
    "system": "perforated_metal_screen",
    "pattern": "gradient_density",
    "material": "weathering_steel"
  },
  "rhythm_reference": {"image": "ref_kolumba_rhythm.jpg", "strength": "moderate"},
  "environment": {"time": "overcast_noon", "context": "urban_core"},
  "render": {"style": "photoreal_study", "aspect": "16:9", "batch": 4},
  "negative": ["added_floors", "rooftop_structures", "text", "watermark"]
}
```

Benefits: diffs cleanly in git, fills programmatically from a spreadsheet, survives translation for multilingual teams. Store schema at `02_WORKFLOWS/ideaforge.schema.json`.

### Lesson 7.11 — Design moves (30 min)

A **design move** is a named geometric operation the model can execute on the envelope. Build a shared vocabulary card:

| Move | Prompt phrase (tested) | Effect |
|---|---|---|
| Split | "divide the upper volume's skin from the podium with a recessed glass band" | vertical distinction |
| Shift | "translate the top two storeys 3 m westward as a cantilever" | dynamic silhouette |
| Weave | "interlace horizontal bands through vertical fins at alternating bays" | texture depth |
| Erode | "carve a shaded loggia notch at the south-west corner" | climate response cue |
| Double | "wrap the volume in a second translucent skin set 600 mm off" | performance narrative |

Moves are how ideation outputs become *defensible*: each keeper gets tagged with the move that produced it, giving you language for the client narrative ("we shifted the crown to protect the neighboring courtyards' light").

### Lesson 7.12 — The 60-minute concept sprint (timed lab, 60 min)

```
00–08  MASS      finalize mass image, hygiene check, pin ingredient
08–18  MATRIX    pick 5 rows: system × material × move (from catalogs)
18–45  GENERATE  one JSON per row, explore tier, 4-up batches;
                 immediate KILL/KEEP triage between rows
45–55  MINE      select 5 keepers; tag move + rationale per concept
55–60  PACKAGE   contact-sheet export + one-line rationale each → 50_DELIVERABLES
```

Exit criterion: 5 concepts pairwise-distinct (no two share system AND move), each reproducible via its stored JSON.

✅ **Gate 7 (Workflow B certification):** Two completed sprints; facade catalog ≥16 entries; one sprint executed under 60 minutes with all artifacts archived.

---

## Module 8 — Client-Ready Deliverables

**Objectives**
- Turn raw generations into professional, honest, board-standard packages.

**Lesson 8.1 — Deliverable taxonomy (15 min)**

| Package | Contents | Turnaround |
|---|---|---|
| **Concept teaser** | 5-concept contact sheet + one-liners | same day |
| **Direction deck** | 2–3 developed renders + move rationale + precedent strip | 1–2 days |
| **Marketing hero set** | 4–6 finals, multi-view, graded consistently | 2–4 days |
| **Board kit** | print-res crops, diagram overlays, section-perspective blends | project-dependent |

**Lesson 8.2 — Consistency grading (20 min)**
A set must feel like one shoot: identical lighting family, grading, population level, and aspect logic. Re-render stragglers rather than photoshopping mismatched frames — regeneration keeps provenance intact (Rule 6).

**Lesson 8.3 — Honesty layer (15 min)**
Every package carries:
- Disclosure line (Rule 3)
- "Indicative imagery — design development ongoing" footer on anything showing unresolved details
- A before/after thumbnail (base model vs render) on request — this builds enormous client trust and takes 2 minutes.

**Lesson 8.4 — The presentation script (20 min)**
Present renders as decisions, not pictures: lead with the move ("this option weaves shading fins into the western face because…"), show the render as evidence. Five-concept meetings end with the client *choosing a direction*, which is the actual business goal.

✅ **Gate 8:** One Direction deck assembled end-to-end with honesty layer included.

---

## Module 9 — Enterprise Operations & Scale

**Objectives**
- Convert a personal skill into a firm capability: standards, QA, budgets, security, onboarding.

**Lesson 9.1 — Standardization assets (20 min)**
Firm maintains exactly three sources of truth, version-controlled:
1. `workflows/` — RenderForge & IdeaForge masters (semver, changelog)
2. `library/` — facade catalog, snippets, material palettes, style refs
3. `governance/` — policy, naming, disclosure templates

Change control: viz lead merges PRs to masters; contributors propose via snippet/library PRs. (Yes, prompts in git — they are production assets.)

**Lesson 9.2 — QA gate for client-bound renders (15 min)**

Two-reviewer checklist before any external send (Appendix B-2):
- Geometry claims traceable? Disclosure present? Provenance archived?
- Consistency pass (8.2)? Watermark/licensing clean? Credit spend logged?

**Lesson 9.3 — Cost governance (15 min)**
- Monthly credit budget per team, tracked in the log rollup.
- Alert threshold at 80% burn; breach escalates same day (mirrors finops discipline).
- Quarterly calibration rerun — model pricing and quality shift; forecasts rot.

**Lesson 9.4 — Security & confidentiality ops (15 min)**
- Workspace access = role-based; freelancers get project-scoped seats only.
- Offboarding checklist includes seat removal + archive audit.
- Incident path: suspected confidential-input leak → disable seat, notify DPO/client per policy (links to firm incident-response runbook).

**Lesson 9.5 — Onboarding new designers (20 min)**
Day 1: Modules 0–4 (governance first!). Day 2–3: Modules 5–6 supervised. Week 2: first solo sprint, output QA'd by viz lead. Certification = Gate 6 + Gate 7 passed on a real (internal) project.

**Lesson 9.6 — KPI dashboard (15 min)**

| KPI | Definition | Healthy range |
|---|---|---|
| Time-to-first-concept-package | brief → 5-concept sheet | < 1 business day |
| Render acceptance rate | keepers ÷ total generations | > 25% explore, > 75% craft |
| Cost per delivered hero | credits ÷ finals shipped | trending down quarterly |
| Reproducibility audit pass | sampled finals regenerable | 100% |
| Rework rate | delivered items needing re-render | < 10% |

✅ **Gate 9:** Draft firm rollout memo (1 page): standards locations, QA flow, budget, onboarding plan.

---

## Module 10 — Capstone, Assessment & Certification

**Capstone brief (choose one):**
- **A. Pitch sprint:** a real upcoming competition/pitch — mass model → 5-concept sprint → direction deck → hero set, full governance trail.
- **B. Retrofit story:** existing building photo/model → improvement study via Workflow A rescue ladder + Workflow B facade options.

**Deliverables:** project folder per convention, sprints logs, direction deck, hero set, credit report, retrospective (what the pipeline slowed down / where the next bottleneck is).

**Certification rubric (pass ≥ all "meets"; "exceeds" ≥ 3 axes):**

| Axis | Meets | Exceeds |
|---|---|---|
| Process fidelity | all gates artefacts present | logs enable perfect reproduction |
| Visual quality | coherent, presentable set | portfolio/marketing-grade |
| Separation of concepts | 5 distinct directions | distinct + narratively defensible |
| Governance | policy followed, disclosure present | policy improved by proposal |
| Efficiency | within time/credit targets | ≥30% under target with equal quality |

---

## Appendix A — Master Template Library

### A-1 · RenderForge master (excerpt — full banks in §6.0)

```text
ROLE: You are an architectural visualization engine.
INPUT: The attached image is my 3D model render. Treat its geometry as fixed truth.

[C] {{BANK5_CAMERA_PACKAGE}}
[A] Preserve exactly: {{ANCHOR_LIST}}. Add nothing structural beyond the model.
[M] {{BANK3_MATERIAL_SET}}
[E] {{BANK4_LIGHTING_PRESET}}, {{BANK6_WEATHER_FX}}, {{BANK2_SURROUNDINGS}},
    population: {{BANK7_POPULATION}}
[R] Photorealistic architectural photography, natural grade, editorial realism.
[A] Negative: warped lines, melted details, added floors, text, watermark, HDR halos.
    Output: {{BANK8_OUTPUT_SPEC}}. Acceptance: mullion alignment true to model;
    material boundaries crisp; horizon level.
{{OVERRIDE_LINES}}
```

### A-2 · Compiler snippet (spreadsheet → prompt)

```text
=TEXTJOIN(CHAR(10), TRUE,
 "[C] "&cam&".",
 "[A] Preserve exactly: "&anchors&".",
 "[M] "&materials&".",
 "[E] "&light&", "&weather&", "&surroundings&", population: "&pop&".",
 "[R] "&style&".",
 "[A] Negative: "&negatives&". Output: "&output_spec&".")
```

### A-3 · IdeaForge JSON schema — see §7.10.

---

## Appendix B — Checklists

**B-1 · Base model hygiene** — see Module 2.4.

**B-2 · Pre-send QA (two reviewers)**
☐ Geometry claims traceable ☐ Disclosure line present ☐ Provenance archived (prompt+inputs+id) ☐ Set consistency pass ☐ Licensing/watermarks clean ☐ Credits logged ☐ Naming convention met

**B-3 · Sprint retro (5 questions)**
Which matrix rows produced keepers? Which patch type dominated rescues? Credit delta vs forecast? What enters the library this week? What rule broke?

**B-4 · Firm one-page policy skeleton**
Scope & tools allowed → confidentiality rules (Rule 1 specifics) → disclosure wording (standard sentence) → licensing summary → budget owner & thresholds → incident contacts → review date.

---

## Appendix C — Troubleshooting Matrix

| Symptom | Likely slot | First-line fix |
|---|---|---|
| Facade ignores massing | A (anchors) | re-pin ingredient; raise lock phrasing; lower ref strength |
| Plastic materials | M | add physical qualifiers (patina, roughness); pin swatch ref |
| Mood drifts per run | E | lock time+weather tokens verbatim across runs |
| Verticals converge badly | C | request two-point perspective correction; check base cam |
| Windows misaligned with slabs | A | explicit "mullions align with slab edges"; region-inpaint |
| Rooftop inventions | A-negative | add explicit exclusion; mask roof in inpaint |
| Outpaint seam visible | extension patch | reduce extension %; feather overlap; re-run |
| Animation warps facade | — | reject clip; simplify camera move; shorter duration |
| Concept outputs too similar | MATRIX | force system AND move diversity per row; drop shared ref |
| Credit burn spikes | process | audit log; return to 4-up explore discipline |

---

## Appendix D — Glossary

**Anchor** — pinned feature/reference the model must preserve. **Batch** — one multi-output generation. **Compiler** — script/formula assembling slots into a prompt. **Design move** — named geometric operation applied to the envelope. **Explore/Craft/Polish tiers** — credit-spending phases. **Frozen prompt** — immutable copy of an instance actually used. **Ingredient** — user-supplied image steering generation identity. **Keeper** — output promoted to SELECTS. **Matrix** — curated combinatorial grid of styles/systems/moves. **Outpaint/Inpaint** — canvas extension / regional editing. **Provenance chain** — prompt+inputs+log entry proving reproduction. **Slot** — fixed variable field in a master template.

---

*Version 1.0.0 · Authored 2026-08-26 · Review cycle: quarterly (model landscape moves)*
*License: internal training use. Adapt freely within your organization; retain provenance note.*
