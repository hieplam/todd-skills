---
id: adr-20260822-html-illustration-rule
c3-seal: 5d87d00f6e5526ebf03c9ba703b11a17cefd94a241df55e27d39ab15de780c97
title: html-illustration-rule
type: adr
goal: |-
    Ship the owner's HTML visualization house style as a second machine-global rule file,
    `plugins/tribe/rules/html-illustration.md`, symlinked into `~/.claude/rules/` by the tribe
    install hook and scoped by a `paths:` glob to HTML files. The decision being authorized is
    *which delivery channel* a standing style rule uses: a `paths`-globbed rule file rather
    than a skill or a global CLAUDE.md snippet. Alongside it, record the `~/.claude/rules/`
    symlink surface in c3-215's Contract table, where only the CLAUDE.md append surface is
    currently documented, and repair ref-plugin-layout's component-directory list, which omits
    the `rules/` directory this change writes into.
status: accepted
date: "2026-08-22"
---

## Goal

Ship the owner's HTML visualization house style as a second machine-global rule file,
`plugins/tribe/rules/html-illustration.md`, symlinked into `~/.claude/rules/` by the tribe
install hook and scoped by a `paths:` glob to HTML files. The decision being authorized is
*which delivery channel* a standing style rule uses: a `paths`-globbed rule file rather
than a skill or a global CLAUDE.md snippet. Alongside it, record the `~/.claude/rules/`
symlink surface in c3-215's Contract table, where only the CLAUDE.md append surface is
currently documented, and repair ref-plugin-layout's component-directory list, which omits
the `rules/` directory this change writes into.

## Context

Every time the assistant renders HTML to explain something — an Artifact, a standalone
`.html` opened in a browser, a mermaid illustration page from the `explaining` skill — it
invents the layout fresh: an ~800px document column, 17px body text, and diagrams that
stay small no matter how wide the container gets. On the owner's 2560×1440 display that
reads as cramped and leaves most of the screen empty, so the same corrections ("fit a 2K
screen", "bigger font") are re-typed on every page. The style itself is already settled
and calibrated; what is missing is a delivery channel that applies it without being asked.

Three channels exist on this machine, and they differ in when they load:

- `plugins/tribe/claude-md/*.md` — appended into `~/.claude/CLAUDE.md` by the install
hook, so it is in context on every turn of every project. Correct for short standing
rules, wrong for a ~200-line style specification.
- `plugins/tribe/rules/*.md` — symlinked into `~/.claude/rules/`. A rule with no `paths:`
frontmatter (`pure-core.md` today) loads every turn; a rule **with** a `paths:` glob
loads only when a matching file is in play. Tribe reviewers honour the same frontmatter
(`plugins/tribe/agents/tracker.md:43`), so one file serves authoring and review.
- A skill — description always in context, body on trigger. Cheap but not free, and it
pays its description cost on every turn including the ones with no HTML anywhere.

The rules channel already exists, already installs, already syncs, and its `paths:` glob is
exactly the conditional-load mechanism this style needs. What the glob cannot express is
the second filter: `**/*.html` also matches production application markup, which must keep
following its own repo's design system. That filter needs model judgment, so it belongs in
the rule body, not in the frontmatter.

## Decision

Author `plugins/tribe/rules/html-illustration.md` with `paths: ["**/*.html", "**/*.htm"]`
and open its body with a **semantic gate** — a two-condition test the model evaluates
before reading the rest: the page must be the artifact a human reads (HTML chosen because
prose could not show the thing) and it must be authored by the assistant for that reader,
not markup the codebase owns. Applicability and non-applicability are both enumerated so
the judgment is bounded rather than open.

Two filter layers, deliberately: the glob is the cheap mechanical one that keeps the rule
out of context on every non-HTML turn, and the gate is the semantic one that keeps it from
being misapplied to application markup on the turns where it does load.

The rule fixes structure only — container width, root-element type scale, reading measure,
panel caps, the mermaid SVG scaling override, spacing rhythm, dual-mode theming, mobile
reset — and explicitly refuses to fix palette or typeface, which stay derived per subject
with a latte + green lean. Pinning a hex value in the file is called out as a defect to
revert, because a shared skeleton with per-subject colour is the whole intent.

No installer change is required: the hook's `for rule in "$PLUGIN_DIR/rules"/*.md` loop is
already generic over the directory.

## Affected Topology

| Entity | Type | Why affected | Evidence | Governance review |
| --- | --- | --- | --- | --- |
| c3-215 | component | The plugin gains a second rules/*.md file, and the ~/.claude/rules/ symlink surface it ships through is absent from the Contract table, which documents only the sibling CLAUDE.md append surface | c3-215#n1445@v1:sha256:17d62140fb11f804db272f9d50b4bbb54ffae8de7b49f144e597ffa8467d9dcc | ref-plugin-layout is binding on the directory shape; confirm the new file needs no installer change |
| c3-2 | container | c3-215's parent container. Its Responsibilities already name the shared plugin layout contract that rules/ belongs to; this change adds a file under that contract without moving the container's own facts | c3-2#n1172@v1:sha256:f92a1cfb53ada54dba5f5c1154ccef3423fe08276ff6ec199cc745be16f8d3d0 | Confirm no container responsibility or membership row moves |
| c3-0 | system | Named for top-down completeness: c3-215's parent chain terminates here. This change leans on the system-level constraint that installs are symlinks so the repo stays the single source of truth, but changes no c3-0 fact | c3-0#n2@v1:sha256:d21dc72fe385cb42ca0b79273dbc1b309b5d308a10754974395b20c7fd30fcc0 | Confirm no system abstract constraint moves |

## Compliance Refs

| Ref | Why required | Evidence | Action |
| --- | --- | --- | --- |
| ref-plugin-layout | It is the binding contract for which component directories a plugin may contain and how each is installed; the new file lands in rules/, a directory the ref's own enumeration and installer-whitelist quote both omit | ref-plugin-layout#n1641@v1:sha256:746cee9fc8b862ca0c7baf82b2f1b47b0cd7295737bee04abfb69a030adb353d | update-ref — add rules/ and canvases/ to the enumeration and correct the quoted whitelist to match install.sh:118 |
| ref-docs-lifecycle | Binding on c3-215 for the specs/plans/evidence lifecycle of tribe's own feature work, so it is in scope for review whenever c3-215 changes | ref-docs-lifecycle#n1682@v1:sha256:a163534e4fbc98d69ae8cd12167eedff5b0840b29f305b2a4d73a5784501ec2c | N.A - this change ships a rule file and doc edits, producing no spec/plan/report artifact the lifecycle governs |
| ref-evals-fixture | Binding on c3-215 for the agent-kind eval fixture shape, so it is in scope for review whenever c3-215 changes | ref-evals-fixture#n1692@v1:sha256:813517fa60d2f2b54b826ca8f96afc6d5756cf36963113cd294b205564805d59 | N.A - no eval case is added or altered; plugins/tribe/evals/evals.json is untouched |

## Compliance Rules

| Rule | Why required | Evidence | Action |
| --- | --- | --- | --- |
| rule-bash-strict-mode | Binding on c3-215 for its shell scripts and their tests; the install hook this change depends on is exactly such a script | rule-bash-strict-mode#n1711@v1:sha256:cf218a707a61ba5ad906d29dec31f9f4eef92e5faeb9db74e3a75451c41c3c1d | N.A - no shell script is edited; the hook's existing rules/*.md loop already covers a second file, proven by test-install-rules.sh |
| rule-no-squash-merge | Binding on every merge performed against this repo, including the delivery of this change | rule-no-squash-merge#n1743@v1:sha256:2f5ff61964fe9551d508719ff31ed7514dbdbd8d296ff884a7e952a5334fab6a | comply - this branch lands as a 2-parent regular merge, never squashed |
| rule-marketplace-registration | The authoritative registry rule: every directory under plugins/ must have a matching marketplace entry. It binds any change that could add a plugin directory | rule-marketplace-registration#n1728@v1:sha256:458830564c7ac131ef95420a16dfb572ec4fbd5c9a24cb1395d641667e5a5a16 | N.A - no plugin directory is created; the new file lands inside the already-registered tribe plugin, so the manifest cannot drift |

## Alternatives Considered

| Alternative | Rejected because |
| --- | --- |
| A new skill (plugins/<x>/skills/html-house-style/) | A skill's description sits in context on every turn whether or not any HTML is in play, and the trigger is a semantic match rather than a file-scoped condition. The rules channel gets the same conditional load for zero baseline cost, because paths: is evaluated mechanically against the files in play |
| Append the full style to plugins/tribe/claude-md/global-rules.md | ~200 lines of CSS specification would load on every turn of every project, against the repo's own progressive-disclosure instruction in CLAUDE.md. It also would not propagate: the install hook uses a snippet's first line as its presence marker, so an edit under the existing # NON-NEGOTIABLE RULES heading is skipped on re-install |
| A rule file with no paths: glob, like pure-core.md | pure-core.md carries no glob because it governs all production source in any language. A visual style for explanation pages governs one file type, so it would be paying pure-core's always-on cost for a fraction of its reach |
| Glob only, no semantic gate in the body | **/*.html matches production application markup, page templates, and test fixtures, which must keep following their own repo's design system. No glob can express "the page IS the explanation" — that distinction needs model judgment, so it has to live in the body |

## Verification

| Check | Result |
| --- | --- |
| bash plugins/tribe/scripts/tests/test-install-rules.sh | 10 passed, 0 failed — the hook's rules-linking contract still holds with two files present |
| D=$(mktemp -d) && CLAUDE_DIR="$D" ./install.sh tribe && ls -l "$D/rules/" | Both html-illustration.md and pure-core.md are symlinks resolving into the repo; installer reports 0 warnings |
| head -12 plugins/tribe/rules/html-illustration.md | Frontmatter carries a non-empty description and paths: as a YAML list of globs, the shape plugins/tribe/agents/tracker.md:43 honours |
| c3x check | No new errors beyond the two pre-existing ungrounded-derivation errors on c3-213 and c3-216, which this change does not touch |
