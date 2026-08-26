# RenderForge Studio — Master Template v1.0.0

> Workflow A engine: converts 8 dropdown selections into a compiled C.A.M.E.R.A. prompt.
> Owner: viz lead only · Semver · Changelog at bottom · Companion lesson: `modules/module-06-workflow-a-renderforge.md`

## Usage protocol

1. Copy this master → fill one copy per scene/view (an **instance**) → save instance to `<project>/30_PROMPTS/` **before generating**.
2. Select exactly one option per bank. Empty bank = do not generate.
3. Overrides (§9) append after compilation; max two per prompt.
4. Instance filename: `<proj>_<scene>_<view>__rf<major.minor>.md`.

---

# BANK 1 — SCENE TYPE

*Sets vantage family + composition skeleton. Feeds slot [C].*

| Option | Compiled phrase |
|---|---|
| `exterior-street` | street-level exterior view, pedestrian perspective, two-point perspective corrected |
| `exterior-corner` | corner view capturing two facades, diagonal approach emphasis, depth layering |
| `exterior-aerial` | elevated context view, drone-height vantage, project within urban fabric |
| `courtyard` | enclosed courtyard interior-exterior view, surrounding elevations wrapping frame edges |
| `interior-lobby` | ground-floor lobby interior, double-height space emphasis, entry threshold visible |
| `interior-unit` | typical floor unit interior, window wall as light source, furniture-scale cues |
| `rooftop-terrace` | rooftop amenity view, skyline backdrop, parapet and pergola foreground logic |
| `night-elevation` | straight-on elevation at night, interior glow through fenestration, dark sky |

# BANK 2 — SURROUNDINGS

*Context bundle: adjacent fabric + ground plane + planting character. Feeds slot [E].*

| Option | Compiled phrase |
|---|---|
| `urban-core` | dense downtown context, mid-rise neighbors implied at frame edges, wide sidewalks, street trees in grates |
| `urban-highstreet` | active retail high-street frontage, shopfront rhythm, awnings, signage bands left blank |
| `suburban` | low-rise residential context, front gardens, driveways, mature canopy trees |
| `waterfront` | promenade edge, open water horizon, railing line, salt-weather cues on lower surfaces |
| `park-edge` | landscaped park adjacency, lawn foreground, scattered canopy trees, soft ground shadows |
| `desert` | arid context, sand-toned ground, sparse xeriscape planting, heat-haze distance falloff |
| `tropical-green` | lush subtropical planting, palm and broadleaf layers, humid atmosphere haze |
| `mountain-valley` | terraced valley context, distant ridgelines in atmospheric perspective layers |
| `industrial-district` | converted industrial context, brick sheds, rail lines, hardy pioneer vegetation |
| `mixed-use-infill` | tight infill plot, party walls touching frame edges, narrow slot views of sky |

# BANK 3 — MATERIAL SETS (approved palettes)

*Envelope palette + physical behavior qualifiers. Feeds slot [M]. Add firm palettes via PR; keep behavior phrases.*

| Option | Compiled phrase |
|---|---|
| `concrete-brutalist` | board-formed concrete with tie holes and rain patina, bush-hammered base course, deep reveal shadow gaps |
| `glass-tower-premium` | low-iron glazing with ceramic frit gradient, anodized aluminum fins, brushed stainless base, crisp silicone joints |
| `brick-contextual` | hand-made clay brick with slight color variance, raked joints, precast concrete lintel banding, lime-mortar softness |
| `timber-mass` | exposed cross-laminated timber soffits, charred larch cladding with visible brush texture, galvanized steel details |
| `stone-civic` | honed limestone courses with subtle fossil figuring, fluted pier elements, bronze touch-point accents oxidizing |
| `metal-shingle` | standing-seam zinc shingles with rolling mill texture, copper bay accents beginning to verdigris, matte black reveals |
| `terracotta-baguette` | glazed terracotta baguette screens in warm gradient tones, unglazed clay spandrels, soft ceramic reflectivity |
| `white-minimal` | rain-screen composite panels in warm white, shadow-gap precision, frosted glass balustrades, pale travertine base |
| `perforated-screen` | weathering-steel perforated screen with gradient porosity, silhouetted structure behind, rust bloom variation |
| `rammed-earth` | rammed-earth walls with strata lines and aggregate sparkle, timber shade pergola, lime-wash upper volumes |
| `marble-luxury` | book-matched marble lobby wall with veining continuity, fluted marble shafts, brass inlay reveals, mirror-polish elevator doors |
| `facade-adaptive` | kinetic louvre array mid-adjustment, mixed opaque/glazed panels responding to orientation, visible sensor-line logic |

# BANK 4 — LIGHTING PRESETS

*Sun geometry + sky condition + shadow character as one token bundle. Feeds slot [E].*

| Option | Compiled phrase |
|---|---|
| `dawn` | dawn light, sun 5° above horizon casting long cool shadows, pink-to-blue gradient sky |
| `morning-overcast` | overcast morning, soft shadowless diffusion, even envelope illumination revealing facade rhythm |
| `golden-hour` | golden hour, low warm raking sunlight, long dramatic shadows, amber bounce into recesses |
| `harsh-noon` | harsh midday sun, high contrast, short black shadows, saturated clear sky |
| `blue-hour` | blue hour, deep cobalt ambient light, interior lights glowing warm through glazing |
| `night-urban-glow` | night, urban light pollution dome, illuminated signage bokeh in distance, facade accent lighting active |
| `west-raking` | late-afternoon west light raking at 15° elevation, texture-relief exaggeration on surfaces |
| `storm-light` | pre-storm dramatic light, dark cloud breaks with god-ray shafts, wet reflective anticipation |

# BANK 5 — CAMERA PACKAGES

*Vantage + height + lens + framing. Feeds slot [C]. Pairs with Bank 1.*

| Option | Compiled phrase |
|---|---|
| `street-eye-24mm` | camera 1.6 m eye height, 24 mm equivalent, architectural two-point perspective correction, subject centered-left |
| `low-worm-18mm` | worm's-eye view from 0.8 m height looking up, 18 mm equivalent, monumentality emphasis, canopy underside visible |
| `bird-35mm-drone` | drone bird's-eye at 12th-storey height, 35 mm equivalent, context radius visible, gentle downward tilt |
| `topdown-oblique` | top-down plan-oblique at 60° tilt, diagrammatic clarity, roofscape readable |
| `interior-wide-16mm` | interior wide-angle 16 mm equivalent, one-point perspective down room axis, verticals kept parallel |
| `detail-85mm` | close detail study, 85 mm equivalent, shallow depth of field on material junction, background softly defocused |
| `across-street-50mm` | positioned across street at 1.6 m, 50 mm natural perspective, full elevation framed with margin |
| `pedestrian-seq` | walking-pace perspective mid-sidewalk, slight motion energy, view opening toward entry |

# BANK 6 — WEATHER & FX

*Atmosphere + ground state + particulates. Feeds slot [E].*

| Option | Compiled phrase |
|---|---|
| `clear` | clear dry conditions, crisp visibility, clean surfaces |
| `wet-after-rain` | recent rain, wet asphalt specular reflections, beaded surfaces, fresh-washed air clarity |
| `fog-light` | light morning fog, distance falloff in layers, softened context edges, dewy surfaces |
| `snow-dust` | light snow dusting on horizontal surfaces, ploughed pavement edges, breath-cold air clarity |
| `monsoon-haze` | monsoon humidity haze, saturated wet greens, diffuse bright sky, glistening surfaces |
| `windy-vegetation` | windy day, trees bending consistently, flags extended, grass ripples indicating direction |
| `heat-shimmer` | heat shimmer distortion rising from pavement, bleached distance, glare management on glass |
| `autumn-fall` | autumn leaf scatter on ground and benches, amber understory tones, low sun cooperation |

# BANK 7 — POPULATION

*Life density + behavioral qualifiers. Feeds slot [E].*

| Option | Compiled phrase |
|---|---|
| `empty` | no people, pristine stage set, architecture as sole subject |
| `sparse-life` | few pedestrians in natural motion blur, one cyclist at distance, unhurried scale reference |
| `active-street` | active street life, commuters mid-stride, café seating occupied, delivery cyclist crossing |
| `event-density` | event-day density, clustered groups, market stalls with blank awnings, lively but orderly |
| `workday-flow` | office-hour flow, badge-lanyard pedestrians streaming toward entries, shuttle bus at kerb |

# BANK 8 — OUTPUT SPEC

*Format + technical requirements. Feeds run settings + slot [A].*

| Option | Compiled phrase |
|---|---|
| `hero-16x9` | 16:9 hero composition, generous sky margin for masthead text, sharp throughout |
| `social-45` | 4:5 portrait crop optimized for social feeds, subject fills upper two-thirds |
| `board-a3crop` | A3 landscape board crop safe area respected, 12 mm quiet margin, print-grade detail |
| `ultrawide-219` | 21:9 cinematic ultrawide, outpaint-ready margins, epic scale emphasis |
| `animation-ready` | animation-ready still, strong depth layering, clear motion corridor entering frame center |
| `elevation-flat` | flattened elevation presentation, minimal perspective, orthographic intent preserved |

---

## 10 · Compiler output format

Assemble selected options into this block (order fixed):

```text
ROLE: You are an architectural visualization engine.
INPUT: The attached image is my 3D model render. Treat its geometry as fixed truth.

[C] {{BANK5 phrase}}. {{BANK1 phrase}}.
[A] Preserve the modeled massing exactly: {{ANCHOR_LIST}}. Add nothing structural beyond the model.
[M] {{BANK3 phrase}}.
[E] {{BANK4 phrase}}, {{BANK6 phrase}}, {{BANK2 phrase}}, population: {{BANK7 phrase}}.
[R] Photorealistic architectural photography, natural color grading, editorial realism, not CGI-looking, no HDR halos.
[A] Negative: warped lines, melted details, added floors, rooftop structures unless modeled, text, watermark. Output: {{BANK8 phrase}}. Acceptance: mullion alignment true to model, material boundaries crisp, horizon level.
{{OVERRIDE_LINES}}
```

`ANCHOR_LIST` = 2–4 items typed per scene (the only free-text fields besides overrides).

## 11 · Override syntax

Append below the block; prefix `OVERRIDE:`; max two; never contradict a preset:

```text
OVERRIDE: raking light from west at 15 degrees elevation
OVERRIDE: extend paving pattern continuity across full frame width
```

## 12 · Batch discipline

- Explore: 4-up × draft tier until ≥75% acceptance twice consecutively
- Craft: 2-up × max tier on shortlist
- Log every row; verdicts mandatory

## Changelog

| Version | Date | Change |
|---|---|---|
| v1.0.0 | 2026-08-26 | Initial release: 8 banks (8/10/12/8/8/8/5/6 options), compiler, override syntax |
