# `~/.tribe/` Local Progress Home — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the tribe's operational progress state out of the consuming repo into a per-repo home at `~/.tribe/<encoded-main-repo-path>/`, with a one-shot migration + read-time fallback, and archive shipped cards.

**Architecture:** A single shared bash helper (`tribe-home.sh`) derives one home dir per repo from `git --git-common-dir` (so every linked worktree of a campaign resolves to the same key). `resume-check.sh` reads state from that home (falling back to the old in-repo scan when the home is empty). `migrate-state.sh` copies existing committed state up and de-tracks it. `archive-card.sh` moves a shipped card's state into an `archive/` subdir. Agent docs and the repo `.gitignore` are updated to match.

**Tech Stack:** Bash (`set -euo pipefail`, per `rule-bash-strict-mode`), embedded `python3` (already used by `resume-check.sh`), the repo's plain-bash TAP test harness.

**Spec:** `docs/superpowers/specs/2026-07-19-tribe-local-progress-home-design.md`

## Global Constraints

- Every `.sh` file starts with `set -euo pipefail` (`rule-bash-strict-mode`, all 14 tracked scripts).
- The home path is computed in exactly ONE place — `tribe-home.sh` — and sourced/called by every other consumer. No consumer re-derives the key inline.
- Key = `dirname` of `git rev-parse --path-format=absolute --git-common-dir`, encoded `/`→`-`. Identical from the main checkout and any linked worktree.
- Tests are offline and use synthetic git repos under `mktemp -d` (follow `test-resume-check.sh` idiom: `ok`/`bad`/`check` helpers, `git_c`/`new_repo`).
- `resume-check.sh` stays **read-only** — it computes and prints, never mutates state (existing contract, `resume-check.sh:13`). Archiving is a separate helper the Warchief calls, never folded into resume-check.
- `HOME` is overridable in tests (drive every script with a fake `HOME="$TMP/home"` so no test writes to the real `~/.tribe`).

---

### Task 1: `tribe-home.sh` — the single source of truth for the home path

**Files:**
- Create: `plugins/tribe/scripts/tribe-home.sh`
- Test: `plugins/tribe/scripts/tests/test-tribe-home.sh`

**Interfaces:**
- Produces: an executable `tribe-home.sh [repo-dir]` that prints `"$HOME/.tribe/<key>"` on stdout (no trailing subdir). `repo-dir` defaults to `$PWD`. Exit 2 if not a git repo. Also usable as `source`d: defines `tribe_home()` and `tribe_home_key()`.

- [x] **Step 1: Write the failing tests**

```bash
#!/usr/bin/env bash
# test-tribe-home.sh — key derivation is stable across linked worktrees.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$HERE/../tribe-home.sh"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); printf 'ok - %s\n' "$1"; }
bad() { FAIL=$((FAIL+1)); printf 'not ok - %s\n' "$1"; }
check() { if [[ "$2" == "$3" ]]; then ok "$1"; else bad "$1 (got: $2 want: $3)"; fi; }
git_c() { git -C "$1" -c user.email=t@t.test -c user.name=t "${@:2}"; }
export HOME="$TMP/home"; mkdir -p "$HOME"

main="$TMP/proj"; git init --template= -q -b master "$main"
git -C "$main" config wtguard.protected ""
git_c "$main" commit --allow-empty -qm init

from_main="$(bash "$SCRIPT" "$main")"
wt="$TMP/proj-wt-1"; git_c "$main" worktree add -q "$wt" -b feat-1 master
from_wt="$(cd "$wt" && bash "$SCRIPT")"          # default arg = PWD
check "main and linked worktree yield same home" "$from_main" "$from_wt"

realmain="$(cd "$main" && pwd -P)"
want="$HOME/.tribe/$(printf '%s' "$realmain" | sed 's#/#-#g')"
check "home path matches HOME/.tribe/<slash-dashed-root>" "$from_main" "$want"

set +e; bash "$SCRIPT" "$TMP" >/dev/null 2>&1; rc=$?; set -e
check "non-git dir exits 2" "$rc" "2"

printf '\n%d passed, %d failed\n' "$PASS" "$FAIL"; [[ "$FAIL" -eq 0 ]]
```

- [x] **Step 2: Run the tests, verify they fail**

Run: `bash plugins/tribe/scripts/tests/test-tribe-home.sh`
Expected: FAIL — `tribe-home.sh` does not exist yet (`No such file or directory`).

- [x] **Step 3: Write `tribe-home.sh`**

```bash
#!/usr/bin/env bash
# tribe-home.sh — single source of truth for the tribe's per-repo local home.
#   ~/.tribe/<encoded-main-worktree-path>/  (Claude Code transcript model).
# Every linked worktree of one repo resolves to the SAME home.
# Usage: tribe-home.sh [repo-dir]   → prints "$HOME/.tribe/<key>"
#        source tribe-home.sh; tribe_home [repo-dir]
set -euo pipefail

tribe_home_key() {
  local repo="${1:-$PWD}" common main
  common="$(git -C "$repo" rev-parse --path-format=absolute --git-common-dir 2>/dev/null)" \
    || { echo "tribe-home: not a git repository: $repo" >&2; return 2; }
  main="$(cd "$(dirname "$common")" && pwd -P)"
  printf '%s' "$main" | sed 's#/#-#g'
}

tribe_home() {
  local key; key="$(tribe_home_key "${1:-$PWD}")" || return 2
  printf '%s/.tribe/%s' "$HOME" "$key"
}

# When executed (not sourced), print the home for the given/current repo.
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  tribe_home "${1:-$PWD}"
fi
```

- [x] **Step 4: Make executable, run the tests, verify they pass**

Run: `chmod +x plugins/tribe/scripts/tribe-home.sh && bash plugins/tribe/scripts/tests/test-tribe-home.sh`
Expected: `3 passed, 0 failed`.

- [x] **Step 5: Commit**

```bash
git add plugins/tribe/scripts/tribe-home.sh plugins/tribe/scripts/tests/test-tribe-home.sh
git commit -m "feat(tribe): add tribe-home.sh — per-repo local progress home path"
```

---

### Task 2: `resume-check.sh` reads from the home, with in-repo fallback

**Files:**
- Modify: `plugins/tribe/scripts/resume-check.sh` (state discovery loop, `resume-check.sh:213-249`; orphan recovery, `:251-275`)
- Modify: `plugins/tribe/scripts/tests/test-resume-check.sh` (drive with fake `HOME`; add home + fallback cases)

**Interfaces:**
- Consumes: `tribe_home` from Task 1.
- Produces: unchanged JSON shape on stdout (`cards[]`, `orphaned_cards[]`). New behavior: cards are discovered from `<home>/state/*.md`; if that dir is empty/absent, discovery falls back to the current per-worktree `docs/tribe/state/` scan.

- [x] **Step 1: Write the failing tests** (append two cases to `test-resume-check.sh`)

Add near the other scenario blocks. First make the whole suite home-safe by exporting a fake HOME at the top (after `trap`): `export HOME="$TMP/home"; mkdir -p "$HOME"`. Then:

```bash
# --- home-dir discovery: state lives in ~/.tribe/<key>/state, not the worktree ---
repo="$TMP/home-repo"; new_repo "$repo"
wt="$(new_card_worktree "$repo" idea-home)"          # writes state INTO the worktree
home="$(bash "$HERE/../tribe-home.sh" "$repo")"
mkdir -p "$home/state"
mv "$wt/docs/tribe/state/idea-home.md" "$home/state/idea-home.md"
git_c "$wt" rm -q --cached docs/tribe/state/idea-home.md
git_c "$wt" commit -qm "chore: de-track state (migrated to home)"
run_check "$TMP/home.json" "$repo"
check "home-dir card discovered" "$(jget "$TMP/home.json" cards.0.card)" "idea-home"

# --- fallback: no home state → old in-repo scan still resumes ---
repo2="$TMP/fb-repo"; new_repo "$repo2"
new_card_worktree "$repo2" idea-fb >/dev/null        # state stays committed in worktree
run_check "$TMP/fb.json" "$repo2"                      # home/state absent for repo2
check "fallback discovers in-repo card" "$(jget "$TMP/fb.json" cards.0.card)" "idea-fb"
```

- [x] **Step 2: Run the tests, verify the new cases fail**

Run: `bash plugins/tribe/scripts/tests/test-resume-check.sh`
Expected: the two new `check` lines print `not ok` (home discovery not implemented; `cards.0.card` is `MISSING`). Pre-existing cases still `ok`.

- [x] **Step 3: Implement home discovery + fallback**

In `resume-check.sh`, before the `python3` heredoc call (around `:47`), compute the home and pass it in:

```bash
HOME_DIR="$("$(dirname "$0")/tribe-home.sh" "$REPO_ROOT" 2>/dev/null || true)"
python3 - "$REPO_ROOT" "$ROADMAP" "${HOME_DIR:-}" <<'PY'
```

Then in the python body, read the third arg and change the discovery loop (`:213-221`) to prefer the home:

```python
repo_root, roadmap_arg = sys.argv[1], sys.argv[2]
home_dir = sys.argv[3] if len(sys.argv) > 3 else ""
GH = os.environ.get("RESUME_CHECK_GH", "gh")
...
def state_files():
    # (state_dir, filename) pairs. Prefer the local home; fall back to the
    # in-repo per-worktree scan when the home has no state yet (un-migrated repo).
    home_state = os.path.join(home_dir, "state") if home_dir else ""
    if home_state and os.path.isdir(home_state):
        names = [n for n in sorted(os.listdir(home_state)) if n.endswith(".md")]
        if names:
            return [(home_state, n) for n in names]
    out = []
    for wt in list_worktrees(repo_root):
        sd = os.path.join(wt["path"], "docs", "tribe", "state")
        if os.path.isdir(sd):
            out += [(sd, n) for n in sorted(os.listdir(sd)) if n.endswith(".md")]
    return out

cards, discovered = [], set()
for state_dir, name in state_files():
    state = parse_state_file(os.path.join(state_dir, name))
    if state is None:
        continue
    f = state["fields"]
    wt_path = f.get("worktree", repo_root)   # state file carries its own worktree
    trailer_last = trailer_progress(wt_path, f.get("base-sha"))
    cb_prefix, total, plan_exists = plan_checkbox_progress(wt_path, f.get("plan"))
    # ... rest unchanged, but replace every wt["path"] in this block with wt_path,
    #     and set card["worktree"] = wt_path, card["branch"] = f.get("branch")
```

Keep the orphan-recovery block (`:251-275`) as-is — it already recovers a branch by scanning `git cat-file` for committed state, which still serves the fallback path.

- [x] **Step 4: Run the full suite, verify green**

Run: `bash plugins/tribe/scripts/tests/test-resume-check.sh`
Expected: `N passed, 0 failed` (all pre-existing cases plus the two new ones).

- [x] **Step 5: Commit**

```bash
git add plugins/tribe/scripts/resume-check.sh plugins/tribe/scripts/tests/test-resume-check.sh
git commit -m "feat(tribe): resume-check reads state from ~/.tribe home, falls back to in-repo scan"
```

---

### Task 3: `migrate-state.sh` — one-shot migration + de-track

**Files:**
- Create: `plugins/tribe/scripts/migrate-state.sh`
- Test: `plugins/tribe/scripts/tests/test-migrate-state.sh`

**Interfaces:**
- Consumes: `tribe_home` from Task 1.
- Produces: `migrate-state.sh [repo-dir]` that (1) copies `docs/tribe/state/*.md` from every worktree into `<home>/state/`, (2) ensures `docs/tribe/state/` is in `.gitignore`, (3) `git rm -r --cached docs/tribe/state/`, (4) prints a summary. Idempotent: re-running copies nothing new and does not double-add the gitignore line. Does NOT auto-commit (prints the commit command).

- [ ] **Step 1: Write the failing tests**

```bash
#!/usr/bin/env bash
# test-migrate-state.sh
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$HERE/../migrate-state.sh"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
PASS=0; FAIL=0
ok(){ PASS=$((PASS+1)); printf 'ok - %s\n' "$1"; }
bad(){ FAIL=$((FAIL+1)); printf 'not ok - %s\n' "$1"; }
check(){ if [[ "$2" == "$3" ]]; then ok "$1"; else bad "$1 (got: $2 want: $3)"; fi; }
git_c(){ git -C "$1" -c user.email=t@t.test -c user.name=t "${@:2}"; }
export HOME="$TMP/home"; mkdir -p "$HOME"

repo="$TMP/proj"; git init --template= -q -b master "$repo"
git -C "$repo" config wtguard.protected ""
mkdir -p "$repo/docs/tribe/state"
printf '# tribe-state: idea-01\nworktree: %s\nbranch: master\n' "$repo" > "$repo/docs/tribe/state/idea-01.md"
git_c "$repo" add -A; git_c "$repo" commit -qm init

bash "$SCRIPT" "$repo" >/dev/null
home="$(bash "$HERE/../tribe-home.sh" "$repo")"
[[ -f "$home/state/idea-01.md" ]] && ok "state copied to home" || bad "state copied to home"
grep -q '^docs/tribe/state/' "$repo/.gitignore" && ok "gitignored" || bad "gitignored"
tracked="$(git -C "$repo" ls-files docs/tribe/state)"
check "state de-tracked from index" "$tracked" ""

bash "$SCRIPT" "$repo" >/dev/null            # idempotent re-run
n="$(grep -c '^docs/tribe/state/' "$repo/.gitignore")"
check "gitignore line not duplicated" "$n" "1"

printf '\n%d passed, %d failed\n' "$PASS" "$FAIL"; [[ "$FAIL" -eq 0 ]]
```

- [ ] **Step 2: Run, verify fail**

Run: `bash plugins/tribe/scripts/tests/test-migrate-state.sh`
Expected: FAIL — script missing.

- [ ] **Step 3: Write `migrate-state.sh`**

```bash
#!/usr/bin/env bash
# migrate-state.sh — one-shot: move committed docs/tribe/state/*.md into the
# per-repo local home (~/.tribe/<key>/state) and stop tracking them in git.
# Idempotent. Does not commit — prints the commit to make.
set -euo pipefail
REPO="${1:-$PWD}"
DIR="$(cd "$(dirname "$0")" && pwd)"
HOME_DIR="$("$DIR/tribe-home.sh" "$REPO")"
mkdir -p "$HOME_DIR/state"

copied=0
while IFS= read -r wt; do
  sd="$wt/docs/tribe/state"
  [[ -d "$sd" ]] || continue
  for f in "$sd"/*.md; do
    [[ -e "$f" ]] || continue
    dest="$HOME_DIR/state/$(basename "$f")"
    if [[ ! -e "$dest" ]]; then cp "$f" "$dest"; copied=$((copied+1)); fi
  done
done < <(git -C "$REPO" worktree list --porcelain | awk '/^worktree /{print $2}')

gi="$REPO/.gitignore"
grep -qxF 'docs/tribe/state/' "$gi" 2>/dev/null || printf 'docs/tribe/state/\n' >> "$gi"

if git -C "$REPO" ls-files --error-unmatch docs/tribe/state >/dev/null 2>&1; then
  git -C "$REPO" rm -r --cached -q docs/tribe/state
fi

echo "migrate-state: copied $copied file(s) to $HOME_DIR/state"
echo "next: git -C '$REPO' add .gitignore && git -C '$REPO' commit -m 'chore(tribe): stop tracking operational state (moved to ~/.tribe)'"
```

- [ ] **Step 4: Run, verify pass**

Run: `bash plugins/tribe/scripts/tests/test-migrate-state.sh`
Expected: `5 passed, 0 failed`.

- [ ] **Step 5: Commit**

```bash
git add plugins/tribe/scripts/migrate-state.sh plugins/tribe/scripts/tests/test-migrate-state.sh
git commit -m "feat(tribe): add migrate-state.sh — one-shot move of state to ~/.tribe + de-track"
```

---

### Task 4: `archive-card.sh` — ship lifecycle

**Files:**
- Create: `plugins/tribe/scripts/archive-card.sh`
- Test: `plugins/tribe/scripts/tests/test-archive-card.sh`

**Interfaces:**
- Consumes: `tribe_home` from Task 1.
- Produces: `archive-card.sh <slug> [repo-dir]` that moves `<home>/state/<slug>.md` → `<home>/archive/<slug>.md` (creating `archive/`). No-op with exit 0 and a message if the state file is already absent (idempotent for re-dispatched delivery).

- [ ] **Step 1: Write the failing test**

```bash
#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$HERE/../archive-card.sh"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
PASS=0; FAIL=0
ok(){ PASS=$((PASS+1)); printf 'ok - %s\n' "$1"; }
bad(){ FAIL=$((FAIL+1)); printf 'not ok - %s\n' "$1"; }
git_c(){ git -C "$1" -c user.email=t@t.test -c user.name=t "${@:2}"; }
export HOME="$TMP/home"; mkdir -p "$HOME"
repo="$TMP/proj"; git init --template= -q -b master "$repo"
git_c "$repo" commit --allow-empty -qm init
home="$(bash "$HERE/../tribe-home.sh" "$repo")"; mkdir -p "$home/state"
printf '# tribe-state: idea-01\n' > "$home/state/idea-01.md"

bash "$SCRIPT" idea-01 "$repo" >/dev/null
[[ -f "$home/archive/idea-01.md" && ! -e "$home/state/idea-01.md" ]] \
  && ok "state archived" || bad "state archived"
bash "$SCRIPT" idea-01 "$repo" >/dev/null && ok "idempotent no-op when absent" || bad "idempotent no-op"
printf '\n%d passed, %d failed\n' "$PASS" "$FAIL"; [[ "$FAIL" -eq 0 ]]
```

- [ ] **Step 2: Run, verify fail** — Run: `bash plugins/tribe/scripts/tests/test-archive-card.sh` → FAIL (script missing).

- [ ] **Step 3: Write `archive-card.sh`**

```bash
#!/usr/bin/env bash
# archive-card.sh — move a shipped card's state out of the in-flight set.
# Usage: archive-card.sh <slug> [repo-dir]
set -euo pipefail
SLUG="${1:?usage: archive-card.sh <slug> [repo-dir]}"
REPO="${2:-$PWD}"
DIR="$(cd "$(dirname "$0")" && pwd)"
HOME_DIR="$("$DIR/tribe-home.sh" "$REPO")"
src="$HOME_DIR/state/$SLUG.md"
if [[ ! -e "$src" ]]; then echo "archive-card: no in-flight state for $SLUG (nothing to do)"; exit 0; fi
mkdir -p "$HOME_DIR/archive"
mv "$src" "$HOME_DIR/archive/$SLUG.md"
echo "archive-card: $SLUG → $HOME_DIR/archive/$SLUG.md"
```

- [ ] **Step 4: Run, verify pass** — Expected: `2 passed, 0 failed`.

- [ ] **Step 5: Commit**

```bash
git add plugins/tribe/scripts/archive-card.sh plugins/tribe/scripts/tests/test-archive-card.sh
git commit -m "feat(tribe): add archive-card.sh — archive state on VERIFY_SHIPPED"
```

---

### Task 5: Agent docs, README, gitignore, and phrasing tests

**Files:**
- Modify: `plugins/tribe/agents/warchief.md` (state-path at intake `:153`; "one sanctioned resume artifact" passages `:783`, `:1002`; report-path convention)
- Modify: `plugins/tribe/agents/shaman.md` (Channels & liveness report paths, near `:120`)
- Modify: `plugins/tribe/agents/hunter.md` (report path note — comes from the brief; brief now carries the home path)
- Modify: `plugins/tribe/README.md` (document `~/.tribe/` layout: `state/`, `archive/`, `reports/`)
- Modify: `plugins/tribe/scripts/tests/test-disagreement-routing.sh` (`:743`, `:820`), `plugins/tribe/scripts/tests/test-review-cell-v3.sh` (`:302`) — phrasing assertions that pin `docs/tribe/state/CARD-SLUG.md`

**Interfaces:**
- Consumes: the home concept + `tribe-home.sh` (agents call it to resolve `<home>` for the state/report paths).

- [ ] **Step 1: Update the phrasing assertions to expect the home path (make them fail first)**

In `test-disagreement-routing.sh:820` and `:743`, and `test-review-cell-v3.sh:302`, change the expected regex from `docs/tribe/state/CARD-SLUG.md` to the new convention, e.g. `~/.tribe/<key>/state/CARD-SLUG.md` (match the exact wording you will write into `warchief.md` in Step 3). Run the two suites; they now FAIL because `warchief.md` still says the old path.

Run: `bash plugins/tribe/scripts/tests/test-disagreement-routing.sh; bash plugins/tribe/scripts/tests/test-review-cell-v3.sh`
Expected: the retargeted assertions print `not ok`.

- [ ] **Step 2: Update `warchief.md`**

- `:153` intake: state file is created at `<home>/state/CARD-SLUG.md`, where `<home>` is `$(bash "$dir/tribe-home.sh")` resolved via the same `${CLAUDE_PLUGIN_ROOT:-}/scripts` pattern already used for `heartbeat-check.sh`/`validate-plan.sh` (`:126`, `:327`). Add a one-line `mkdir -p "<home>/state"`.
- `:783`, `:1002` and the disagreement-routing clauses: replace `docs/tribe/state/CARD-SLUG.md` with `~/.tribe/<key>/state/CARD-SLUG.md` (the local, un-committed resume artifact).
- Report path convention: reports live at `<home>/reports/<card>.md`.
- On delivery close (VERIFY_SHIPPED), the Warchief runs `archive-card.sh <slug>` (resolved via the same scripts-dir pattern).

- [ ] **Step 3: Update `shaman.md` + `hunter.md` + `README.md`**

- `shaman.md`: Channels & liveness — report/heartbeat paths become `<home>/reports/…`.
- `hunter.md`: note the report path comes from the brief (brief now carries a `~/.tribe/<key>/reports/…` path).
- `README.md`: add a "Local operational home" section documenting the `~/.tribe/<key>/{state,archive,reports}/` layout and that it is machine-local, never committed; contracts stay under `docs/tribe/`.

- [ ] **Step 4: Run the phrasing suites, verify green**

Run: `bash plugins/tribe/scripts/tests/test-disagreement-routing.sh; bash plugins/tribe/scripts/tests/test-review-cell-v3.sh`
Expected: both `0 failed`.

- [ ] **Step 5: Commit**

```bash
git add plugins/tribe/agents/warchief.md plugins/tribe/agents/shaman.md plugins/tribe/agents/hunter.md plugins/tribe/README.md plugins/tribe/scripts/tests/test-disagreement-routing.sh plugins/tribe/scripts/tests/test-review-cell-v3.sh
git commit -m "docs(tribe): point resume/report conventions at ~/.tribe local home"
```

---

### Task 6: C3 ADR + `ref-docs-lifecycle` boundary update

**Files:** `.c3/` (CLI-only — use the `c3` command handle, never edit files directly)

**Interfaces:** Records the architecture decision that operational memory leaves the repo for `~/.tribe/`, keeping only contracts under `docs/tribe/`.

- [ ] **Step 1: Open the ADR**

```bash
c3() { C3X_MODE=agent bash /Users/home/.claude/skills/c3/bin/c3x.sh "$@"; }
c3 schema adr        # read REJECT-IF contract first
c3 add adr tribe-local-progress-home   # fill every section to the contract
```

- [ ] **Step 2: Update the ref boundary + wire the ADR**

```bash
c3 set ref-docs-lifecycle boundary "Contracts (specs, plans, Decision Log, ledgers) live in docs/tribe/ under git; operational runtime state (resume state, reports) lives machine-local in ~/.tribe/<repo-key>/ and is never committed."
c3 wire adr-...-tribe-local-progress-home ref-docs-lifecycle
c3 wire adr-...-tribe-local-progress-home c3-215
```

- [ ] **Step 3: Validate**

Run: `c3 check`
Expected: clean (0 errors). Transition the ADR `proposed → accepted → implemented` per the C3 lifecycle once the code tasks land.

- [ ] **Step 4: Commit** — `git add .c3 && git commit -m "docs(c3): ADR + ref-docs-lifecycle — operational state moves to ~/.tribe"`

---

### Task 7: Rollout / dogfood in this repo (delivery step, run once)

**Not a TDD task** — a one-time operation performed at delivery, after Tasks 1–6 are merged-ready.

- [ ] **Step 1:** `bash plugins/tribe/scripts/migrate-state.sh .` — copies this repo's historical `docs/tribe/state/*.md` into `~/.tribe/<todd-skills-key>/state/` and de-tracks them.
- [ ] **Step 2:** Verify `git ls-files docs/tribe/state` prints nothing and `.gitignore` contains `docs/tribe/state/`.
- [ ] **Step 3:** Run the full tribe eval + script suites (`run_evals.py` per C3 Change-Safety for `c3-215`, plus every touched `test-*.sh`). Expected: all pass.
- [ ] **Step 4:** Commit the `.gitignore` + de-tracking: `git commit -m "chore(tribe): stop tracking operational state (moved to ~/.tribe)"`.

---

## Notes for the implementer

- `resume-check.sh` embeds python via a `<<'PY'` heredoc — extend the existing block, do not add a second python invocation.
- Preserve the read-only contract of `resume-check.sh`: no `mv`/`cp`/`rm` inside it. Archiving is Task 4's separate helper.
- Every new `.sh` must be `chmod +x` and start with `set -euo pipefail`.
- Do not re-derive the home path anywhere except `tribe-home.sh`; source or call it.
