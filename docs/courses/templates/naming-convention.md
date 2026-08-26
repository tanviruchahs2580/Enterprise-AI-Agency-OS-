# Naming Convention — v1.0.0

> File-to-file standard across the studio. Enforced at QA gate.

## Files

```
P<nnn>_<scene>_<view>_<style>_v<##>_<yyyymmdd>.<ext>
```

| Field | Rules | Examples |
|---|---|---|
| `P<nnn>` | project number, zero-padded | `P012` |
| `<scene>` | kebab-case scene name | `tower-north`, `lobby-main` |
| `<view>` | Bank 1/Bank 5 shorthand | `street-eye`, `worm-low`, `bird-35`, `night-elev` |
| `<style>` | Bank 3 id | `brick-contextual` |
| `v<##>` | instance/generation version | `v03` |
| date | ISO compact | `20260826` |

Examples:

```
P012_tower-north_street-eye_brick-contextual_v03_20260826.png
P012_tower-north_bird-35_glass-tower-premium_v01_20260827.png
P012_sprint01_contact_20260829.png
```

## Folders

```
10_BASE      clean exports only — never edited renders
20_FLOWS     Flow project links (.url/.md), one per scene
30_PROMPTS   frozen instances: <proj>_<scene>_<view>__rf<maj.min>.md (+ JSON)
40_RENDERS   WIP → SELECTS → FINAL (promotion is one-way)
50_DELIVERABLES  boards, decks, sprints/ subfolder per sprint
```

## IDs

- Generation id: `<proj>_<scene>_<view>_v<##>_g<nn>` (`P012_north_v03_g07`) — matches log rows
- Flow project name mirrors folder: `P012 Tower – North Studies`
- Sprint id: `P<nnn>-IDEA-sprint<nn>` (matches schema pattern)

## Rules

1. No spaces, no uppercase in slugs (except extension).
2. Frozen instances are immutable; new attempt = new `v##`.
3. FINAL promotion requires QA gate pass recorded in log.
4. Retroactive renaming forbidden after QA sign-off — fork instead.
