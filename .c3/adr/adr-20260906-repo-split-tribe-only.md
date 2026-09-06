---
id: adr-20260906-repo-split-tribe-only
c3-seal: ef7f71dd615bf9cbb3d700e092a635355d61bbd5f69e3fb31c497dd85069fe8c
title: repo-split-tribe-only
type: adr
goal: |-
    Retire the seven plugin components that leave this repo, and re-aim the remaining model at a
    repo whose only product is the Tribe. `plugins/` now holds `tribe` and `verify-shipped` only;
    check-diff-coverage, explaining, refactor-for-testability, research-to-blog, simple-image-video,
    splitting-plans and workflow-journal moved to `hieplam/agent-plugins` as a fresh copy. The C3
    model must stop claiming components whose code is no longer here, and every fact that counted
    plugins ("9 installable plugins", "8 plugins, one install code path", "all 8 plugins today") must
    state the new number.
status: accepted
date: "2026-09-06"
---

## Goal

Retire the seven plugin components that leave this repo, and re-aim the remaining model at a
repo whose only product is the Tribe. `plugins/` now holds `tribe` and `verify-shipped` only;
check-diff-coverage, explaining, refactor-for-testability, research-to-blog, simple-image-video,
splitting-plans and workflow-journal moved to `hieplam/agent-plugins` as a fresh copy. The C3
model must stop claiming components whose code is no longer here, and every fact that counted
plugins ("9 installable plugins", "8 plugins, one install code path", "all 8 plugins today") must
state the new number.

## Context

`.c3/` modelled the whole repo: container `c3-2 plugins` held nine components, one per plugin
directory. The owner split the repo (campaign `repo-split`, epic issue #125): the Tribe delivery
ecosystem stays here and the repo is renamed to `hieplam/tribe`; the seven general-purpose plugins
move to a new public repo `hieplam/agent-plugins`. Unit `u1` published the copies there; this unit
removes them here.

Seven components therefore describe code that is gone: `c3-201 explaining`,
`c3-210 splitting-plans`, `c3-211 check-diff-coverage`, `c3-212 refactor-for-testability`,
`c3-213 research-to-blog`, `c3-214 workflow-journal`, `c3-216 simple-image-video`. Their only
graph edges point outward (each cites `ref-plugin-layout`, some cite `ref-evals-fixture`,
`rule-bash-strict-mode`, `rule-marketplace-registration`, `ref-docs-lifecycle`); nothing in the
model cites them back, so the retire gate has no live citer to dangle and no live child to orphan.
Seven surviving facts still name a moved plugin or count plugins in prose: `c3-0`, `c3-2`,
`c3-215 tribe`, `ref-evals-fixture`, `ref-plugin-layout`, `rule-marketplace-registration`, and
`rule-bash-strict-mode` (whose Golden Example quotes `install.sh:2` literally, and that line
changes in this same PR).

## Decision

Retire the seven components outright rather than marking them deprecated or reparenting them
under a "moved" container. A component is a claim about code in THIS repo; the code is in another
repo now, and a retained-but-deprecated component would keep `c3x lookup` and any future audit
pointed at paths that do not exist. The new repo will model its own plugins when it adopts C3;
nothing is lost by dropping the claim here.

Everything rides in ONE change-unit: the seven retires plus the prose corrections in the same
atomic apply. Retiring first and correcting counts later would leave the model self-contradictory
(a container whose goal says "9 installable plugins" above a two-row membership table) for the
length of a second unit, and the membership rows in `c3-0` and `c3-2` are synthesized by the tool
on the same apply that lands the retires — so they must be in one transaction to stay consistent.

`.c3/code-map.yaml` is edited directly, not through a patch. It is not a frozen fact (`c3x list`
does not carry it) and c3x 11.6.3 resolves `lookup` against `.c3/eval/<fact>.yaml` bindings, not
this file; it is an ordinary editable file that must stop mapping deleted paths.

## Affected Topology

| Entity | Type | Why affected | Evidence | Governance review |
| --- | --- | --- | --- | --- |
| c3-201 | component | Its plugin plugins/explaining/ moved to hieplam/agent-plugins; no code left here | c3-201#n1440@v1:sha256:d074fc4d382baa542b0efebb1e1523e22f7f074c861615ee34746c4fcc8fca32 "Ship the explaining skill: two explanation-writing rules" | Retire; no live citer (graph shows outbound refs only) |
| c3-210 | component | Its plugin plugins/splitting-plans/ moved | c3-210#n1491@v1:sha256:703e2011ccd3a01086e94daeba35c1cbc8beaa519cd7a017ff2e1d79cb4cfab0 "Split large monolithic implementation plans into isolated" | Retire; no live citer |
| c3-211 | component | Its plugin plugins/check-diff-coverage/ moved | c3-211#n1536@v1:sha256:6e38cc51a00e79bc003e0f47ff64d4f8315d83f58154f837326c39e84dd4843f "Measure the percentage of changed lines vs master/main" | Retire; no live citer |
| c3-212 | component | Its plugin plugins/refactor-for-testability/ moved | c3-212#n1582@v1:sha256:d28b3520ad44d27fd386eccb15cdfdca9cdf1ac4835d64f36b0e146f5ae5e155 "Reshape code that cannot be tested" | Retire; no live citer |
| c3-213 | component | Its plugin plugins/research-to-blog/ moved | c3-213#n1626@v1:sha256:716edbc56f81deeda6643f00a1f85051033091e5f834efc684a62b294afbb14b "Turn a session insight or bare topic into a bilingual EN+VI research note" | Retire; no live citer |
| c3-214 | component | Its plugin plugins/workflow-journal/ moved | c3-214#n1669@v1:sha256:21983645b1afc7586fbd2a70bb0d8d817df8a8c093ba04ad77bb95cbf9030296 "Render each Claude Code Workflow run to one readable Markdown file" | Retire; no live citer |
| c3-216 | component | Its plugin plugins/simple-image-video/ moved | c3-216#n1780@v1:sha256:93a89da11ee33fedf7760c03539f223372026505052b1c1f9c6dc0a4f92ed020 "Animate one supplied still image into a long, seamlessly-looping video" | Retire; no live citer |
| c3-0 | system | Title was the old repo name; Goal described a personal plugin grab-bag; the c3-2 Containers row says "The 8 installable plugins" | c3-0#n2@v1:sha256:d21dc72fe385cb42ca0b79273dbc1b309b5d308a10754974395b20c7fd30fcc0 "Package Todd Lam's personal Claude Code agents and skills as installable plugins" | Retitle to tribe, restate Goal and the c3-2 row |
| c3-2 | container | Goal enumerates nine plugins by name, Responsibilities lists eval-fixture owners that left, Complexity Assessment names simple-image-video | c3-2#n1418@v1:sha256:f92a1cfb53ada54dba5f5c1154ccef3423fe08276ff6ec199cc745be16f8d3d0 "Claude Code runtime content: the 9 installable plugins" | Restate Goal, one Responsibilities bullet, Complexity Assessment |
| c3-215 | component | Parent Fit "Depends on siblings" names splitting-plans, which is no longer a sibling | c3-215#n1714@v1:sha256:f467fd1ec102c55b693524d1b29fda35cba5ac48b31be638a9f6a38cc5b3aef8 "Deliver features through a 5-agent chain of command" | Restate the row |
| ref-evals-fixture | ref | Why section credits refactor-for-testability for the fixture shape | ref-evals-fixture#n1941@v1:sha256:813517fa60d2f2b54b826ca8f96afc6d5756cf36963113cd294b205564805d59 "One eval fixture format for every role-behavior and skill-trigger eval in the repo" | Restate without the moved plugin's name |
| ref-plugin-layout | ref | Goal says "8 plugins, one install code path" | ref-plugin-layout#n1951@v1:sha256:7308f9cf6c7b854b298ec94062198be5540c62222a8b3466b2796854039585c5 "Standardize the directory shape of every plugin" | Restate the count |
| rule-marketplace-registration | rule | Goal says "across all 8 plugins today" | rule-marketplace-registration#n2015@v1:sha256:458830564c7ac131ef95420a16dfb572ec4fbd5c9a24cb1395d641667e5a5a16 "Every plugin that exists in the tree is discoverable and installable" | Restate the count |
| rule-bash-strict-mode | rule | Goal says "all 14 tracked .sh files today" (already stale: 40 before this change, 34 after) and the Golden Example quotes install.sh:2, which this PR rewrites | rule-bash-strict-mode#n1960@v1:sha256:cf218a707a61ba5ad906d29dec31f9f4eef92e5faeb9db74e3a75451c41c3c1d "Every shell script in the repo fails fast and loud" | Restate the count and re-quote the literal line |

## Compliance Rules

| Rule | Why required | Evidence | Action |
| --- | --- | --- | --- |
| rule-marketplace-registration | .claude-plugin/marketplace.json must list exactly the directories under plugins/; this PR deletes seven of each | rule-marketplace-registration#n2015@v1:sha256:458830564c7ac131ef95420a16dfb572ec4fbd5c9a24cb1395d641667e5a5a16 "Every plugin that exists in the tree is discoverable and installable" | comply, and update the count stated in the rule's own Goal |
| rule-c3-table-cell-no-pipe | Every table cell this unit rewrites must carry no raw vertical-bar character | rule-c3-table-cell-no-pipe#n1978@v1:sha256:f8b5ab8eef7416c6c19c48042e9103265cc4aa08d8e83ef2ad8fbb0a866d4c7a "Every Markdown table under .c3/ round-trips through the C3 toolchain" | comply |
| rule-bash-strict-mode | install.sh keeps its shebang and set -euo pipefail; only its header comment changes | rule-bash-strict-mode#n1960@v1:sha256:cf218a707a61ba5ad906d29dec31f9f4eef92e5faeb9db74e3a75451c41c3c1d "Every shell script in the repo fails fast and loud" | comply, and update the literal quote plus the count in the rule's own Goal |

## Verification

| Check | Result |
| --- | --- |
| c3x change apply adr-20260906-repo-split-tribe-only | applies atomically, no drift or retire-gate rejection |
| c3x check | ok: true |
| c3x list --flat | 17 entities; no c3-201, c3-210, c3-211, c3-212, c3-213, c3-214, c3-216 |
| grep -rn for the six moved plugin names under .c3/ excluding adr and changes | zero hits |
| ls plugins/ | tribe and verify-shipped only |
