# Prompt Snippets Library — v1.0.0

> Layer-3 asset: tested phrases by category. A phrase becomes a snippet only after a logged trial batch.
> Usage: copy into the matching C.A.M.E.R.A. slot. One snippet per slot position; do not stack synonyms.
> Add via PR with test-batch reference (gen_id).

## [C] Camera & composition

| Snippet | Notes |
|---|---|
| `architectural two-point perspective correction` | append to any street scene with people near frame edges |
| `subject centered-left with sidewalk leading line entering bottom-right` | reliable hero composition |
| `one-third sky margin reserved for masthead text` | marketing crops |
| `verticals kept parallel` | interiors; fights wide-angle melt |

## [A] Anchors & negatives

| Snippet | Notes |
|---|---|
| `preserve the modeled massing exactly; add no floors or rooftop structures` | default anchor opener |
| `no rooftop plant unless modeled` | aerials |
| `exactly one <feature>; all others forbidden` | punctuation moves |
| `mullion spacing regular and aligned with slab edges` | curtain-wall acceptance |
| `horizon level; verticals true` | universal acceptance pair |

## [M] Materials behavior bank

| Snippet | Notes |
|---|---|
| `visible tie holes and rain patina` | concrete realism |
| `ceramic frit gradient on upper levels` | glass realism + bird-safety story |
| `slight color variance between units, raked joints` | brick realism |
| `patina beginning at lower courses only` | weathering metals — age logic |
| `honed finish with fossil figuring` | civic stone |
| `soft ceramic reflectivity, no mirror glare` | terracotta screens |

## [E] Environment & atmosphere

| Snippet | Notes |
|---|---|
| `wet asphalt with specular reflections, beaded surfaces` | post-rain signature |
| `distance falloff in layers` | fog depth |
| `pedestrians in natural motion blur` | kills mannequin look |
| `trees bending consistently in one direction` | wind coherence |
| `leaves scattered on pavement and benches` | autumn anchoring |

## [R] Render style

| Snippet | Notes |
|---|---|
| `full-frame DSLR look, natural color grading, sharp throughout` | house base style |
| `editorial realism, not CGI-looking` | register setter |
| `shallow depth of field on material junction` | detail studies |

## Banned phrases (house list)

- `lens flare sunset`, `epic golden glow`, `fisheye drama`
- `hyperrealistic 8K masterpiece` — quality-token noise
- `photorealistic!!!` — exclamation marks degrade register

## Contribution format

```text
### <category>
| `<phrase>` | <one-line note> | tested: P0XX_gYY |
```
