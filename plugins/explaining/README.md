# Explaining

A skill that makes explanatory prose (design docs, PR descriptions, teaching-style
answers, architecture write-ups) readable by someone without the writer's context, and
turns a multi-actor or conditional flow into a real, renderable diagram instead of
narration nobody can follow.

## The four rules (`skills/explaining/SKILL.md`)

1. **Term discipline: define before use.** Any new concept, technology, or technical
   term must be briefly defined or contextualized the first time it appears — never
   dropped mid-explanation with no lead-in.
2. **Grounding: anchor every abstract claim.** Every abstract or general statement is
   paired with a code snippet, a concrete worked example, or a verifiable fact/source;
   an ungroundable claim is marked unverified or deleted.
3. **Name a concept instead of the behaviour.** A vague label ("best-effort") tells a
   reader nothing checkable; name the actual behavior instead.
4. **Illustrate a flow instead of narrating it.** A flow with multiple actors or
   conditional paths gets a mermaid diagram, rendered into one self-contained HTML file
   written to disk — a fenced code block alone is not the deliverable, since it renders
   in some clients and not others.

Rules 1 and 2 are the pair that won an isolated A/B eval against baseline and against
each rule alone (see `SKILL.md`'s Evidence section for the numbers). Rule 4 is enforced
by the two scripts below plus a machine check in this skill's own eval case.

## The two scripts (`skills/explaining/scripts/`)

- **`validate-mermaid.ts`** — validates mermaid diagram source against the real
  `mermaid.parse()` parser (via a `jsdom` shim), not by LLM opinion. Exits `0` when
  every diagram in the target HTML parses, `1` when at least one does not (with a
  printed remediation hint mapped from the real mermaid error string) or when no
  diagram artifact is found at all, and `2` when the parser itself could not run (no
  dependency, no network) — a validator that cannot run is not a failing diagram, so
  `2` is a distinct, non-blocking outcome from `1`.
- **`render-illustration.ts`** — renders one self-contained HTML document from a
  mermaid diagram: the diagram sits inside a `<div class="mermaid">` element (what
  `validate-mermaid.ts` looks for), mermaid itself loads from a CDN at view time
  (`@11`, the same major the validator parses with), and light/dark is handled via CSS
  custom properties plus a `prefers-color-scheme: dark` media query.

Both are `bun` CLIs, run from the directory where the diagram/output files live (their
path flags — `--diagram`, `--out`, `--html-glob`, `--file` — are relative to `cwd`).

## On-demand dependency install

`validate-mermaid.ts` depends on `mermaid` and `jsdom` (`package.json` +
`bun.lock`, committed; `node_modules/` is git-ignored — see `scripts/.gitignore`). If
the dependency isn't installed yet, the script runs `bun install --cwd <script dir>`
once, on demand, and retries the import; if that also fails (no network, no `bun`), the
parser is reported `unavailable` and the validator exits `2` rather than crashing or
misreporting a diagram as invalid.

## Eval fixture

The skill's regression fixture lives at `skills/explaining/evals/evals.json` (next to
`SKILL.md`, per `ref-evals-fixture`), with its ambient-memory fixture at
`skills/explaining/evals/memory-fixture/CLAUDE.md`. Run it with
`scripts/evals/run_evals.py --evals plugins/explaining/skills/explaining/evals/evals.json`
from the repo root — see `scripts/evals/README.md` for the harness's own flags
(`--arm`, `--dry-run`, etc.).
