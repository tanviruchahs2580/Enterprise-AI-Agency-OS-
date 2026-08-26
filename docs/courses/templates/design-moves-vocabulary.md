# Design Moves Vocabulary — v1.0.0

> Named geometric operations the model can execute on envelope/mass.
> Each move ships: prompt phrase, effect, failure mode, narrative template (client-facing rationale).
> Lesson: M07.11 · Extend only via tested PRs.

| # | Move | Prompt phrase (tested) | Effect | Failure watch |
|---|------|------------------------|--------|---------------|
| 01 | **Split** | "divide the upper volume's skin from the podium with a recessed glass band" | vertical distinction, weight separation | band widens uncontrollably on tall masses → cap with "one-storey height" |
| 02 | **Shift** | "translate the top two storeys 3 m westward as a cantilever" | dynamic silhouette, orientation drama | counterweight invented below → add "structure concealed within volume" |
| 03 | **Weave** | "interlace horizontal bands through vertical fins at alternating bays" | texture depth, crafted richness | mush at distance → pedestrian cameras |
| 04 | **Erode** | "carve a shaded loggia notch at the south-west corner" | climate cue, entry signal | notch migrates corners → name corner twice in anchors |
| 05 | **Double** | "wrap the volume in a second translucent skin set 600 mm off" | performance narrative, depth glow | skins merge → specify gap dimension + "visible air gap at parapet" |
| 06 | **Taper** | "taper the plan by cutting 45° corners ascending every four storeys" | skyline negotiation, wind story | taper becomes curve → "straight cut lines only" |
| 07 | **Lift** | "raise the ground-floor volume 4 m on slender pilotis, plaza flowing beneath" | public realm generosity | structure thickens → "slender round columns, max 900 mm" |
| 08 | **Fold-roof** | "fold the roof plane downward toward the north entrance as a canopy" | directional welcome, section interest | fold flattens → pair with west-raking light |
| 09 | **Punctuate** | "punch a single oversized circular opening through the facade's upper third" | icon moment, viewpoint framing | multiple holes appear → "exactly one opening" + acceptance item |
| 10 | **Terrace** | "step back successive floors on the south face creating planted terraces every two levels" | amenity narrative, massing softness | terraces become balconies → "recessed open decks with planting beds, not projecting" |
| 11 | **Ribbon** | "spiral a continuous ribbon window band around all four elevations, rising one storey per revolution" | dynamism, panoramic story | band breaks per-face → "band continuous around corners, no vertical interruption" |
| 12 | **Crown-frame** | "complete the top with a rectangular structural frame extending beyond and above the roof, glowing at dusk" | landmark identity, signage-free branding | frame gains cladding → "open frame, no infill" |

## Narrative templates (fill during MINE phase)

- Split: *"We separated crown from podium so the base reads civic while the top reads private."*
- Shift: *"The shifted crown protects {neighbor} daylight and signals arrival from {street}."*
- Erode: *"A carved notch shades the plaza edge and marks the entry without signage."*
- Double: *"The outer skin cuts solar gain ~{x}% before glass — performance you can see."*
- Lift: *"Raising the volume returns {area} of covered public ground to the city."*

*(Adapt numbers only from verified studies — Rule 5: renders never carry technical claims.)*

## Adding a move (PR checklist)

- [ ] Phrase tested on ≥2 different masses
- [ ] Failure mode documented with fix
- [ ] Narrative template drafted
- [ ] Contact sheet archived to `03_LIBRARY/MOVE_TESTS/`
- [ ] Catalog version bumped (patch)
