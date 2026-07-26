---
id: rule-stack-agnostic-agent-prompts
c3-seal: 0359be29b6ad1801e94c2e9436a52ef79d92d291865487bd5f2149dba51cfdad
title: stack-agnostic-agent-prompts
type: rule
goal: |-
    Every agent prompt file in this repo (`plugins/*/agents/*.md`) stays usable against **any**
    codebase the owner dispatches it on — not just the one it happened to be written or tested
    against. The recurring need: `plugins/tribe/agents/tracker.md` hardcoded C#/.NET throughout its
    identity, rule sources, and verification commands, which silently produced wrong or unusable
    review guidance on every non-C# repo it ran against (including this one, which is
    TypeScript/Bash/Python/Markdown). An agent prompt that states roles, obligations, and a
    *procedure for discovering* stack-specific facts at review time — instead of assuming those
    facts up front — travels correctly to every repo without editing the prompt per project.
---

## Goal

Every agent prompt file in this repo (`plugins/*/agents/*.md`) stays usable against **any**
codebase the owner dispatches it on — not just the one it happened to be written or tested
against. The recurring need: `plugins/tribe/agents/tracker.md` hardcoded C#/.NET throughout its
identity, rule sources, and verification commands, which silently produced wrong or unusable
review guidance on every non-C# repo it ran against (including this one, which is
TypeScript/Bash/Python/Markdown). An agent prompt that states roles, obligations, and a
*procedure for discovering* stack-specific facts at review time — instead of assuming those
facts up front — travels correctly to every repo without editing the prompt per project.

## Rule

Agent prompt files (`plugins/*/agents/*.md`) never hardcode a language name, toolchain command,
or stack-specific file extension in their operating instructions, except as an
explicitly-labeled illustration (e.g. inside a template/example block marked as such); where a
stack fact is needed, the prompt instead defines a discovery procedure that reads it from the
target repo at review time.

## Golden Example

Literal, from `plugins/tribe/agents/tracker.md` (the step-0 discovery ladder added by
`adr-20260726-stack-agnostic-agent-prompts` to replace hardcoded `dotnet build`/`.editorconfig`
assumptions):

```markdown
### 0. Learn how this repo verifies itself

Before reviewing anything, work out how this repo builds, tests, lints, and formats — you will
need this in step 3 to substantiate findings instead of guessing at a command. Discover it in
order of authority, highest first, and stop at the first rung that answers the question:

- **Rung 1 — hard rules.** If any rule source you are about to read in step 1 (`~/.claude/rules/`, `CLAUDE.md`, `.claude/rules/`, C3 rules) names a build/test/lint/format command, that command wins — it overrides anything you would otherwise infer.
- **Rung 2 — repo config.** Otherwise, look at what the repo itself runs: CI workflows (`.github/workflows/*`), a `Makefile`/`Justfile`, or a task-runner manifest's scripts (e.g. `package.json`, `pyproject.toml`) — whatever the repo actually relies on.
- **Rung 3 — observed conventions.** Otherwise, infer from what the repo demonstrably does — where its tests live, which formatter/linter config files exist. Conventions tell you *how* to verify and how to read context; they are never, by themselves, a source of violations — an observed convention with no rule behind it is not something you can cite as a Blocker.
- **Rung 4 — nothing found.** If none of the above yields a command, say so explicitly, and mark any finding that would need a command to substantiate as **unverified** rather than guessing one.
```

Annotation — structural elements this rule requires vs. leaves free:

- REQUIRED: the ladder is ordered by authority (rule source > repo config > observed convention > explicit "nothing found"), and step 3 ("Substantiate before reporting") is written to point back at "the build, test, and format-check commands discovered in step 0" rather than naming any one toolchain.
- OPTIONAL: the specific example tools named inside each rung (`Makefile`/`Justfile`, `package.json`/`pyproject.toml`) are illustrations of the *kind* of source, not a fixed list the agent is limited to — any repo config the target repo actually has qualifies.

## Not This

| Anti-Pattern | Correct | Why Wrong Here |
| --- | --- | --- |
| RUN the relevant read-only verifying commands to confirm — \dotnet build\`, a scoped \`dotnet test --filter <suspect area>\`, \`dotnet format --verify-no-changes\`, analyzers.` (tracker.md's substantiation step before this rule existed) | RUN the relevant read-only verifying commands to confirm — the build, test, and format-check commands discovered in step 0, scoped to the suspect area where the runner supports it. | Hardcodes one toolchain (.NET) into an agent meant to review any repo the owner works in. On a non-.NET repo (this one included), the literal commands don't exist, so a compliant Tracker either fails outright or silently skips the "substantiate before reporting" obligation — the exact failure mode this rule exists to prevent. |
| Load every rule that could apply to C# in this repo. | Load every rule that could apply to the changed code in this repo. | Scopes the entire rule-gathering step to one language by name, so on a non-C# diff the instruction reads as inapplicable rather than generally correct. |
| Rule-source list naming .editorconfig, *.ruleset, *.globalconfig, Directory.Build.props as the project-scoped sources | any config that encodes standards — formatter, linter, or analyzer configuration, whatever the repo actually has (discovered in step 0) | Enumerates one ecosystem's config file names as if they were universal; a repo using a different formatter/linter config (e.g. .eslintrc, ruff.toml) would silently be missed by an agent reading this list literally. |

## Scope

Applies to every agent prompt file under `plugins/*/agents/*.md` in this repo — their operating
instructions, identity text, and discovery procedures. Does not apply to eval fixtures
(`evals/evals.json`), which may name concrete stack details as scenario content for a specific
test case, or to documentation/blog content that deliberately compares languages for a human
reader (e.g. `plugins/tribe/scripts/runner/RUNNER_EXPLAINED.html`, a Vietnamese C#-vs-TypeScript
teaching aid, which is prose for a reader, not an executable agent instruction).

## Override

None. If a future agent is deliberately built for a single named stack, the stack name must be
declared in that agent's frontmatter `description` (so it is visible at dispatch time, not
assumed silently inside the body) and the agent's own name/purpose must make the single-stack
scope obvious — it does not exempt any *other* agent's prompt from this rule.
