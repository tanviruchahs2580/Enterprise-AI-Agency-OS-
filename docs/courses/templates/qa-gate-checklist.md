# Pre-Send QA Gate Checklist — v1.0.0

> Two reviewers on every client-bound package. R1 = producer self-check; R2 = independent reviewer who did NOT produce this package. Failures cite item numbers.

## Package header

| Field | Value |
|---|---|
| Project / package | ____________ |
| Items included | ____ images, ____ animation(s) |
| R1 (producer) / date | ____________ |
| R2 (independent) / date | ____________ |

## Checklist

| # | Item | Rule ref | R1 | R2 |
|---|---|---|----|----|
| 1 | Every geometry claim traces to model OR carries indicative labeling | Red Rule 2 | ☐ | ☐ |
| 2 | Disclosure line present, correctly placed (bottom-left, ≥60% opacity) | Red Rule 3 | ☐ | ☐ |
| 3 | Provenance bundles archived: frozen prompt + inputs + gen id + log row | Red Rule 6 | ☐ | ☐ |
| 4 | Set consistency passed at thumbnail scale (lighting family/population/grade) | M08.2 | ☐ | ☐ |
| 5 | Style references licensed/attribution noted | Red Rule 4 | ☐ | ☐ |
| 6 | Watermark/licensing clean for intended channel | Red Rule 4 | ☐ | ☐ |
| 7 | Credits logged for every generation in package | Red Rule 7 | ☐ | ☐ |
| 8 | Naming convention met across all files | naming-convention v1 | ☐ | ☐ |
| 9 | No recognizable real persons near identifiable projects | Red Rule 4 | ☐ | ☐ |
| 10 | Technical questions answered verbally with Rule 5 script (not implied by imagery) | Red Rule 5 | ☐ | ☐ |

## Reproduction spot-check (R2 performs once per package)

Pick one delivered image → regenerate from its bundle alone → acceptable similarity?
☐ PASS ☐ FAIL (blocker — fix provenance chain before send)

## Verdict

☐ **PASS — cleared to send**  ☐ **RETURN** (items: ____________)

Signatures: R1 ________ R2 ________ Date ________

*File completed checklist to `<project>/50_DELIVERABLES/qa/<package>_qa.md`.*
