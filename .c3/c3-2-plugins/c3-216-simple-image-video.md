---
id: c3-216
c3-seal: 625a9daf0c262d275fce4e862943bbbf5c07752adee23c0c7eb9eeb7214ac6d5
title: simple-image-video
type: component
category: feature
parent: c3-2
goal: Animate one supplied still image into a long, seamlessly-looping video with music via sine-driven Remotion effects (halos, auras, particles, breathing).
uses:
    - ref-plugin-layout
    - rule-bash-strict-mode
---

## Goal

Animate one supplied still image into a long, seamlessly-looping video with music via sine-driven Remotion effects (halos, auras, particles, breathing).

## Parent Fit

| Field | Value |
| --- | --- |
| Container | c3-2 plugins — Claude Code runtime content |
| Category | Feature — media production |
| Role in parent | Skill + full Remotion TypeScript template + setup/calibrate/assemble scripts + reference props/lessons |
| Depends on siblings | None |

## Purpose

Owns the still-image→looping-video pipeline: effect vocabulary, mathematically seamless loop construction, and the render/assemble toolchain. Non-goals: text-to-video generation and editing existing footage (explicitly out of scope).

## Foundational Flow

| Aspect | Detail | Reference |
| --- | --- | --- |
| Precondition | One still image + a music track supplied by the user; Node toolchain for Remotion | N.A - see SKILL.md description |
| Inputs | Image, song, desired duration/vibe; effect parameters as props | N.A - see references/example-props.json |
| State | A scaffolded Remotion project from the template; rendered segments assembled into the final video | N.A - see scripts/setup_remotion.sh, scripts/assemble.sh |
| Shared dependencies | Plugin layout | ref-plugin-layout |

## Business Flow

| Aspect | Detail | Reference |
| --- | --- | --- |
| Outcome | A long (e.g. 1-hour) seamlessly-looping ambient video with music | N.A - see SKILL.md description |
| Primary path | setup_remotion.sh scaffolds template → configure ImageLoop.tsx props (sine-driven effects guarantee loop closure) → render → assemble.sh tiles the loop to target length | ref-plugin-layout |
| Alternates | calibrate_grid.sh for positioning effect anchors on the specific image | N.A - see scripts/calibrate_grid.sh |
| Failure behavior | Loop-seam artifacts are the known failure mode; lessons doc records pitfalls and fixes | N.A - see references/effects-and-lessons.md |

## Governance

| Reference | Type | Governs | Precedence | Notes |
| --- | --- | --- | --- | --- |
| ref-plugin-layout | ref | Directory shape | binding | Template + scripts stay repo-side; skill dir is symlinked |
| rule-bash-strict-mode | rule | setup/calibrate/assemble scripts | binding | — |

## Contract

| Surface | Direction | Contract | Boundary | Evidence |
| --- | --- | --- | --- | --- |
| Skill trigger | IN | Fires on "make it move / animate this picture / looping video" with a supplied image | Claude Code skill system | SKILL.md frontmatter |
| Remotion template props | IN | Effects parameterized via typed props (example provided) | Root.tsx/ImageLoop.tsx | references/example-props.json |
| Final video file | OUT | Mathematically seamless loop at requested duration with audio | filesystem | scripts/assemble.sh |

## Change Safety

| Risk | Trigger | Detection | Required Verification |
| --- | --- | --- | --- |
| Loop seam becomes visible | Editing effect math in ImageLoop.tsx | Frame N vs frame 0 mismatch at the loop point | Render a short loop via plugins/simple-image-video/skills/simple-image-video/scripts/assemble.sh and inspect the wrap frame |
| Template drift vs skill instructions | Updating Remotion version/template | setup script scaffolds a broken project | Run plugins/simple-image-video/skills/simple-image-video/scripts/setup_remotion.sh clean and render the default comp |

## Derived Materials

| Material | Must derive from | Allowed variance | Evidence |
| --- | --- | --- | --- |
| Effects-and-lessons reference doc | Change Safety section (loop-seam and template-drift risks it records) | Grows with experience | plugins/simple-image-video/skills/simple-image-video/references/effects-and-lessons.md |
