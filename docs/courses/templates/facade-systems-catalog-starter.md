# Facade Systems Catalog — Starter v1.0.0

> Workflow B asset · grows via tested entries only (no untested wording enters the catalog)
> Schema per entry: `phrase` / `family` / `partners` / `failure_modes` / `camera_pair`
> Build-out labs: Module 07 lessons 7.4–7.7

---

## Family 1 · Layered / Screen

### 01 · perforated-metal-screen
- **phrase:** "perforated metal screen with gradient porosity, denser at eye level opening to sky views, silhouetted secondary structure visible behind, weathered matte finish"
- **partners:** weathering steel, anodized aluminum, powder-coated bronze
- **failure_modes:** porosity inverts under steep angles (worm's-eye) → add "openness visible through screen"; screen reads solid at distance → strengthen "gradient" wording
- **camera_pair:** street-eye-24mm

### 02 · double-skin-glass
- **phrase:** "double-skin facade with 600 mm ventilated cavity, walkable maintenance grating visible between layers, subtle reflections doubling at oblique angles"
- **partners:** low-iron outer glass, fritted inner layer
- **failure_modes:** cavity collapses into one pane on aerials → pair with bird-35mm and "visible cavity shadow line"
- **camera_pair:** across-street-50mm

### 03 · timber-louvre-veil
- **phrase:** "horizontal timber louvre veil wrapping the volume, louvre depth deepening on sun-exposed faces, warm wood grain visible at close range"
- **partners:** charred larch, oiled oak, galvanized substructure
- **failure_modes:** louvres fuse into stripes at aerial distance → restrict to pedestrian cameras
- **camera_pair:** street-eye-24mm

### 04 · mashrabiya-derived-units
- **phrase:** "contemporary mashrabiya-derived lattice units, geometric star-based pattern modulating privacy by storey, cast shadows patterning interior reveals"
- **partners:** GRC, ceramic-coated aluminum, dark-stained iroko
- **failure_modes:** pattern morphs toward generic arabesque without reference → pin rhythm reference strength moderate
- **camera_pair:** detail-85mm for identity + street-eye for context

## Family 2 · Grid / Frame

### 05 · expressed-exoskeleton
- **phrase:** "expressed structural exoskeleton wrapping the perimeter, diagonal bracing members casting rhythmic shadows, floor plates reading clearly behind the frame"
- **partners:** exposed steel, board-formed concrete, weathering steel
- **failure_modes:** braces multiply chaotically on tall masses → lock member count in anchors ("eight bays")
- **camera_pair:** low-worm-18mm

### 06 · punched-grid-stone
- **phrase:** "punched-window grid in honed stone facade, deep window reveals with shadow play, regular coursing interrupted by one double-height portal"
- **partners:** limestone, granite, precast concrete
- **failure_modes:** reveals shallow on overcast light → switch to west-raking preset
- **camera_pair:** across-street-50mm

### 07 · tile-and-mullion-curtain-wall
- **phrase:** "unitized curtain wall with visible mullion articulation, spandrel bands in dark ceramic, vision glass with slight green edge tint, slab-line alignment exact"
- **partners:** ceramic spandrels, anodized mullions
- **failure_modes:** mullions misalign with slabs → acceptance criterion mandatory; region-patch failures
- **camera_pair:** across-street-50mm

### 08 · loggia-banding
- **phrase:** "continuous recessed loggia bands wrapping each floor line, shaded colonnade depth, alternating solid piers and open bays"
- **partners:** white-minimal render, stone-civic, terracotta accents
- **failure_modes:** loggias inflate into balconies → negative: "no projecting balconies"
- **camera_pair:** street-eye-24mm

## Family 3 · Folded / Plate

### 09 · folded-metal-rainscreen
- **phrase:** "folded metal rainscreen with sharp origami creases, panels catching light differently facet by facet, crisp brake-line folds"
- **partners:** anodized aluminum, zinc, painted steel
- **failure_modes:** origami inflation (facets bulge) → cap fold density wording; verify against mass silhouette
- **camera_pair:** exterior-corner (Bank 1)

### 10 · shingle-cladding
- **phrase:** "overlapping metal shingle cladding in diamond modules, slight dimensional ripple across the field, patina beginning at lower courses"
- **partners:** zinc, copper, pre-weathered steel
- **failure_modes:** shingles read as scales/snakes at distance → reduce module emphasis, add "calm regularity"
- **camera_pair:** across-street-50mm

### 11 · origami-concrete-panels
- **phrase:** "massive folded concrete panels as monolithic origami planes, chamfered edges, tie-hole rhythm continuing across folds"
- **partners:** board-formed finish, oxide pigments
- **failure_modes:** panel weight ignored (floats) → anchor ground contact explicitly
- **camera_pair:** low-worm-18mm

### 12 · angled-fin-array
- **phrase:** "vertical solar fins arrayed at varying rotation angles responding to orientation, fin torsion creating wave-like rhythm along the elevation"
- **partners:** extruded aluminum, terracotta baguette profiles
- **failure_modes:** rotation logic randomizes → add "consistent solar-response logic east to south to west"
- **camera_pair:** exterior-corner

## Family 4 · Textured / Mass

### 13 · board-marked-concrete
- **phrase:** "board-marked concrete with legible plank grain and tie holes, rain streak patina beneath sills, soft arris wear"
- **partners:** bronze touch points, timber soffits
- **failure_modes:** texture vanishes past 30 m → reserve for pedestrian-range scenes or pair with west-raking
- **camera_pair:** street-eye-24mm

### 14 · brick-corbel-courses
- **phrase:** "hand-made brick facade with corbelled string courses and recessed brick screens at balconies, raked joints catching raking light"
- **partners:** precast caps, deep reveal windows
- **failure_modes:** corbels melt into wavy bands on aerials → pedestrian cameras only
- **camera_pair:** street-eye-24mm

### 15 · rammed-earth-panels
- **phrase:** "rammed earth walls with visible strata lines and aggregate sparkle, protective deep roof overhang above, lime-washed upper volumes contrasting"
- **partners:** timber pergolas, cortes base course
- **failure_modes:** strata direction randomizes → "horizontal strata consistent across panels"
- **camera_pair:** golden-hour presets flatter texture

### 16 · textured-precast
- **phrase:** "textured precast panels with ribbed relief pattern alternating with smooth polished fields, panel joints aligned to fenestration logic"
- **partners:** acid-etched glass, dark window frames
- **failure_modes:** ribs read as stripes from afar → vary relief depth wording
- **camera_pair:** across-street-50mm

---

## Entry template (copy for new entries)

```text
### NN · <system-name>
- **phrase:** "<tested wording>"
- **family:** layered | grid | folded | textured
- **partners:** [<materials>]
- **failure_modes:** [<break + fix>]
- **camera_pair:** <Bank 5 id>
- tested_by/date: <operator/project>
```

**Catalog rules**
1. No phrase enters without a live test batch logged.
2. Failure modes are mandatory — untested optimism is how catalogs rot.
3. Version bump on any batch of additions (patch) or removals/rewrites (minor).
