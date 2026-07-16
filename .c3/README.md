---
id: c3-0
c3-seal: 7115e325c957955f5b85bedcb597688ae997fa25b0ef111347deea9018396567
title: todd-skills
goal: Package Todd Lam's personal Claude Code agents and skills as installable plugins, keep the repo the single source of truth via symlink installs, and benchmark each skill/agent with a repo-wide with/without-skill eval harness.
---

## Goal

Package Todd Lam's personal Claude Code agents and skills as installable plugins, keep the repo the single source of truth via symlink installs, and benchmark each skill/agent with a repo-wide with/without-skill eval harness.

## Containers

| ID | Name | Boundary | Status | Responsibilities | Goal Contribution |
| --- | --- | --- | --- | --- | --- |
| c3-1 | distribution | service | active | Marketplace manifest + idempotent symlink installer with post-install hooks | Gets repo content into ~/.claude without copies, so edits propagate instantly |
| c3-2 | plugins | service | active | The 8 installable plugins: agents, skills, helper scripts, templates, eval fixtures | The product itself — the capabilities each Claude Code session gains |
| c3-3 | eval-harness | service | active | Runs plugins/**/evals/evals.json, grades transcripts, rolls up benchmarks | Proves each skill/agent earns its tokens vs a --safe-mode baseline |

## Abstract Constraints

| Constraint | Rationale | Affected Containers |
| --- | --- | --- |
| Repo is the single source of truth: installs are symlinks, never copies | Marketplace installs copy into a cache; this repo is local, so linking makes every session pick up edits immediately (install.sh header) | c3-1, c3-2 |
| Installs are idempotent and non-destructive | Re-running is safe: correct links skipped, conflicting targets backed up to .bak.<epoch> | c3-1 |
| Eval fixtures are dev tooling, never runtime content | evals/ is consumed by scripts/evals/run_evals.py only; it is intentionally not symlinked into ~/.claude | c3-1, c3-2, c3-3 |
| Eval baselines must be genuinely clean | Dogfooding means skills are symlink-installed at user scope; --safe-mode is what makes without_skill a real baseline | c3-3 |
| Definition of Done: PR squash-merged, master synced, worktree removed | Encoded as executable checks in the verify-shipped plugin; claims of "done" are verified mechanically, not trusted | c3-2 |
