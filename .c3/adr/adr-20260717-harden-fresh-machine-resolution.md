---
id: adr-20260717-harden-fresh-machine-resolution
c3-seal: 144b30581e99f4ccc5099ef7e0fafd0ee6d2c81772f8361b4eaf785656145bcd
title: harden-fresh-machine-resolution
type: adr
goal: |-
    Make the campaign runner's location resolve correctly on any machine that has only cloned this
    repo and run `./install.sh`, and make every missing per-machine prerequisite name itself before a
    campaign starts. Concretely: `skills/orchestrate-campaign` stops carrying its runner-resolution
    logic as prose the model retypes each session, and gains two bundled programs — a resolver that
    fails closed and a preflight doctor — with a fresh-machine test harness holding both.
status: done
date: "2026-07-17"
---

## Goal

Make the campaign runner's location resolve correctly on any machine that has only cloned this
repo and run `./install.sh`, and make every missing per-machine prerequisite name itself before a
campaign starts. Concretely: `skills/orchestrate-campaign` stops carrying its runner-resolution
logic as prose the model retypes each session, and gains two bundled programs — a resolver that
fails closed and a preflight doctor — with a fresh-machine test harness holding both.

## Context

`c3-215`'s Contract already promises that `skills/orchestrate-campaign` "resolves the runner from
the plugin root, never from the shell's cwd". The promise was real but the mechanism failed open.
`SKILL.md` carried a two-tier shell expression whose fallback was:

```sh
runner_dir="$(dirname "$(dirname "$(readlink -f ~/.claude/skills/orchestrate-campaign)")")/scripts/runner"
```

On a machine where the skill was not installed under `~/.claude/skills`, `readlink -f` prints
nothing and exits 1. `$(…)` discards the exit code, `dirname ""` returns `.`, and the expression
collapses to `./scripts/runner` — resolved against the **target repo**, which is the one fallback
the surrounding prose explicitly forbids. Where the repo had merely moved, `readlink -f` prints
the deepest surviving ancestor instead, producing a confident **wrong absolute path**. The only
guard was an `[ -f "$runner_dir/run.ts" ]` check, which lived in the same prose — enforcement a
model had to re-type per session rather than a program that cannot skip it.

This is invisible on the author's machine, where `~/.claude/skills/orchestrate-campaign` always
exists, and that is precisely why it survived: the failure needs a *second* machine to appear.

`ref-plugin-layout` fixes `scripts/` as repo-invoked and never installed, so the runner is reached
by resolving the skill's install symlink back to the repo. That constraint is deliberate and is
not reopened here; it is what makes the resolution step exist at all.

Separately, the runner shells out to `bun` and `gh` and drives the Agent SDK. Each is provisioned
per machine rather than per repo, so a fresh clone can install with zero warnings and still fail
hours into an unattended run — the same class of defect, one layer down.

## Decision

Move resolution out of prose and into `skills/orchestrate-campaign/resolve-runner.sh`, bundled
inside the skill directory so it travels with the symlink install and is reachable from the skill's
announced base directory. It:

- checks `$CLAUDE_PLUGIN_ROOT` first, but only honours it once `run.ts` is proven present there, so
a stale or foreign value falls through instead of winning on presence alone;
- otherwise locates itself with `cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P` — the idiom
`install.sh:27` and `plugins/tribe/install.sh:13` already use — which resolves the install symlink
to its physical home in the repo. It never dereferences `~`, so an unrelated or empty `HOME`
cannot influence it;
- prints an absolute path only after proving `run.ts` exists there, and otherwise prints nothing to
stdout and exits 3 with a named diagnostic.

The decisive property is structural, not textual: because the resolver is a file **in the repo**, a
moved repo takes the script with it, and bash fails loudly on a missing script. A wrong path can no
longer be computed from a program that does not exist.

Add `scripts/doctor.sh` as a preflight that reports every missing prerequisite in one pass with its
remedy, and `scripts/tests/test-fresh-machine.sh` to hold both walls in a throwaway `HOME`.

## Affected Topology

| Entity | Type | Why affected | Evidence | Governance review |
| --- | --- | --- | --- | --- |
| c3-0 | system | Named for top-down completeness. Its goal — keep the repo the single source of truth via symlink installs — is the constraint this unit works inside: symlink install is precisely why the runner must be resolved rather than copied, so hardening that resolution serves the system goal rather than revising it | c3-0#n1258@v2:sha256:d21dc72fe385cb42ca0b79273dbc1b309b5d308a10754974395b20c7fd30fcc0 "Package Todd Lam's personal Claude Code agents and skills as installable plugins, keep the repo the single source of truth via symlink installs, and benchmark e" | No system-level change; the unit is contained in c3-215 |
| c3-2 | container | Named for top-down completeness as c3-215's parent. The container holds installed runtime content; this unit adds no plugin and changes no other member, only hardening how one existing plugin's skill reaches its own repo-invoked runner | c3-2#n927@v2:sha256:7d57023b97b2aaf82126333c225d3075e7854b245558621aa2d1a1cadf521daf "Claude Code runtime content: the 8 installable plugins — agents and skills that, once symlinked into" | No container-level change; membership unchanged |
| c3-215 | component | Owns skills/orchestrate-campaign and the campaign runner; this unit adds two Contract surfaces (the resolver and the preflight doctor) and one Change Safety risk to the component that ships them | c3-215#n454@v1:sha256:251862af8e4a1e85ac79f1a2b86176842fce93c3f1b9e52758445fa817d64757 "Owns the delivery role contracts: who may talk to whom (Owner ⇄ Shaman ⇄ Warchief ⇄ Hunter, adjacent ranks only), which question each role answers, how qu" | Contract + Change Safety rows inserted by this unit's patches |

## Compliance Refs

| Ref | Why required | Evidence | Action |
| --- | --- | --- | --- |
| ref-plugin-layout | Load-bearing for this unit, not incidental. It fixes scripts/ as repo-invoked-and-never-installed, which is the whole reason a resolution step exists: the runner cannot be copied to the user's config, so the skill must walk its install symlink back to the repo. It also bounds WHERE the two new scripts may live | ref-plugin-layout#n666@v1:sha256:7308f9cf6c7b854b298ec94062198be5540c62222a8b3466b2796854039585c5 "Standardize the directory shape of every plugin so the installer, the marketplace manifest, and the eval harness can walk any plugin without per-plugin logic. T" | Honoured unchanged. doctor.sh lands in scripts/ (already skipped by the installer's case whitelist); resolve-runner.sh lands inside skills/orchestrate-campaign/, already symlinked wholesale. No new component-type directory, so no whitelist edit: CLAUDE_DIR=$(mktemp -d) ./install.sh tribe reports 6 linked, 0 warning(s) |
| ref-evals-fixture | Cited by c3-215, so review is required to confirm this unit does not drift the eval contract. It reviews clean: the ref governs model-graded fixtures, and the two new surfaces are deterministic shell programs whose correctness is a pass/fail assertion, not a graded judgement | ref-evals-fixture#n657@v1:sha256:f721836fe1202e2368d7d811c32d640cfc55f26882336819d9735bc3a9dbfd04 "One eval fixture format for every skill and agent in the repo, so a single runner can benchmark all of them and results are comparable across plugins. The recur" | No eval case added or changed; plugins/tribe/evals/evals.json untouched. Verification is plugins/tribe/scripts/tests/test-fresh-machine.sh, the shell-test path the repo already uses for validate-plan.sh and resume-check.sh |
| ref-docs-lifecycle | Cited by c3-215, so review is required to confirm this unit leaves a durable trail that outlives the session. It does, by the C3 route rather than the docs/superpowers route | ref-docs-lifecycle#n647@v1:sha256:a163534e4fbc98d69ae8cd12167eedff5b0840b29f305b2a4d73a5784501ec2c "Give feature work a durable, ordered paper trail — designs, implementation plans, and proof artifacts must outlive the chat session that produced them. The re" | The paper trail is this ADR plus its three patches, committed with the code. No docs/superpowers spec or plan is produced — this is a hardening unit with no feature design to record |

## Compliance Rules

| Rule | Why required | Evidence | Action |
| --- | --- | --- | --- |
| rule-bash-strict-mode | This unit adds three shell scripts, and the rule binds every shell script in the repo. Review is required because the resolver's fail-closed contract depends on strict mode: without set -euo pipefail an unchecked cd or unset variable would continue with an empty path — reintroducing the exact fail-open bug being fixed | rule-bash-strict-mode#n676@v1:sha256:cf218a707a61ba5ad906d29dec31f9f4eef92e5faeb9db74e3a75451c41c3c1d "Every shell script in the repo fails fast and loud: unset variables, failed commands, and broken pipelines abort the script instead of silently producing half-d" | Verified: set -euo pipefail heads resolve-runner.sh, doctor.sh, and test-fresh-machine.sh |
| rule-no-squash-merge | Cited by c3-215, so it binds any unit changing that component. It does not govern the resolver or the doctor — neither merges nor verifies a PR — but it governs THIS unit's own delivery: the PR carrying these scripts merges into the plugin the rule protects, and the owner's standing directive forbids squash | rule-no-squash-merge#n950@v1:sha256:2f5ff61964fe9551d508719ff31ed7514dbdbd8d296ff884a7e952a5334fab6a "Every capability in this repo that merges a pull request, or that verifies one was merged," | Merge this unit's PR with a regular merge; confirm the merge commit has exactly 2 parents (git rev-list --parents -n1 <sha>). No change to any merge code path in this unit |
| rule-marketplace-registration | Reachable from this unit's governance surface via c3-101, which owns the repo to config boundary this unit's resolver depends on. It reviews clean: the rule binds manifest-vs-tree parity, and this unit adds no plugin directory — both new scripts land inside the existing tribe plugin | rule-marketplace-registration#n693@v1:sha256:458830564c7ac131ef95420a16dfb572ec4fbd5c9a24cb1395d641667e5a5a16 "Every plugin that exists in the tree is discoverable and installable: the marketplace manifest is the authoritative registry, and it must never drift from the" | .claude-plugin/marketplace.json untouched; ./install.sh --list still matches its 8 entries. The manifest keeps registering tribe, whose contents this unit hardens without renaming or adding a plugin |

## Alternatives Considered

| Alternative | Rejected because |
| --- | --- |
| Fix the readlink -f expression in place (check its exit code, keep it in SKILL.md) | Leaves enforcement as prose the model retypes per session — the same reason the existing [ -f run.ts ] guard did not save it. The bug is that resolution is instructions, not a program |
| Switch to marketplace install so $CLAUDE_PLUGIN_ROOT is always set and no fallback is needed | Owner ruled symlink install stays the only supported channel (repo = single source of truth). Marketplace also never runs install.sh, so claude-md/review-agents.md would silently never reach the global CLAUDE.md |
| Install the runner into ~/.claude so no resolution is needed | Contradicts ref-plugin-layout, which fixes scripts/ as repo-invoked and never installed, and c3-101's stated non-goal of never copying content |
| Have the doctor auto-install bun/gh | The installer's boundary is linking, not provisioning; silently installing toolchains on a user's machine is a bigger surprise than a named diagnostic |

## Risks

| Risk | Mitigation | Verification |
| --- | --- | --- |
| The resolver's diagnostics rot into prose again if a future edit re-inlines resolution into SKILL.md | The harness asserts the resolver exists, is executable, and never emits a relative path | Swap the old expression back in → 6 assertions fail, incl. an empty HOME never yields the forbidden relative path (got: './scripts/runner') |
| A fresh-machine test that reads the author's real ~/.claude passes against a broken resolver | The harness overrides HOME per probe via resolve_as. Load-bearing, and a real defect during authoring: the first harness passed 18/18 against the original buggy resolver because it did not isolate HOME | bash plugins/tribe/scripts/tests/test-fresh-machine.sh → the probe resolves even when HOME has no install (never consults ~) |
| bun auto-installs runner deps on first run, needing the network, so an offline fresh machine still fails mid-run | The doctor reports missing node_modules/ and prints the bun install that warms it before a campaign starts | bash plugins/tribe/scripts/doctor.sh on a checkout with no node_modules/ |

## Verification

| Check | Result |
| --- | --- |
| bash plugins/tribe/scripts/tests/test-fresh-machine.sh | 24 passed, 0 failed |
| Mutation: swap the original readlink -f expression back in as resolve-runner.sh, rerun the harness | 6 failures — incl. an empty HOME never yields the forbidden relative path (got: './scripts/runner') and a partial checkout prints NO path on stdout (got: .../partial/plugins/tribe/scripts/runner). Proves the harness fails on the bug it targets |
| Mutation: replace doctor.sh with exit 0, rerun the harness | 3 failures — doctor exits non-zero when bun is absent, doctor names bun as the missing prerequisite, doctor says how to install it |
| bash plugins/tribe/scripts/doctor.sh | all prerequisites present, exit 0 |
| CLAUDE_DIR=$(mktemp -d) ./install.sh tribe | 6 linked, 0 warning(s) — no new component type, no install regression |
| plugins/tribe/scripts/tests/test-*.sh | Unchanged from before this unit. test-review-cell-v3.sh fails 2/49 on a clean stashed tree — pre-existing, out of scope |
