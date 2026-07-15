#!/usr/bin/env bash
# pre-gate.sh — mechanical pre-audit gate (idea 11, review-cell v3).
#
# Runs BEFORE any Skinner is dispatched: sweeps every test-*.sh suite in --tests-dir, checks
# commit-trailer hygiene over --range (Tribe-Card present, Co-Authored-By absent), optionally
# checks every changed file against a fence of allowed globs, writes one Markdown report to
# --report, prints a JSON summary to stdout. Logs to stderr.
# Exit: 0 = all green; 1 = at least one check red; 2 = setup error.
set -euo pipefail
LOG() { printf '[pre-gate] %s\n' "$*" >&2; }
DIE() { LOG "ERROR: $*"; exit 2; }

REPO="" RANGE="" TESTS_DIR="" REPORT="" FENCE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --repo)      REPO="$2"; shift 2 ;;
    --range)     RANGE="$2"; shift 2 ;;
    --tests-dir) TESTS_DIR="$2"; shift 2 ;;
    --report)    REPORT="$2"; shift 2 ;;
    --fence)     FENCE="$2"; shift 2 ;;
    -h|--help)   sed -n '2,10p' "$0"; exit 0 ;;
    *) DIE "unknown argument: $1" ;;
  esac
done
[ -n "$REPO" ] && [ -n "$RANGE" ] && [ -n "$TESTS_DIR" ] && [ -n "$REPORT" ] \
  || DIE "usage: pre-gate.sh --repo P --range R --tests-dir D --report F [--fence GLOBFILE]"
[ -d "$REPO/.git" ] || git -C "$REPO" rev-parse --git-dir >/dev/null 2>&1 \
  || DIE "not a git repo: $REPO"
[ -d "$TESTS_DIR" ] || DIE "tests dir not found: $TESTS_DIR"
# F1 fix: an unresolvable range (typo'd ref) must be a setup error, not a silent zero-iteration
# pass. `git rev-list` exits non-zero and prints `fatal:` for an unresolvable ref; a VALID but
# EMPTY range (e.g. HEAD..HEAD) exits 0 with no output and must stay a legitimate pass below —
# only the unresolvable case is caught here.
git -C "$REPO" rev-list "$RANGE" >/dev/null 2>&1 || DIE "invalid or unresolvable range: $RANGE"

overall=pass
suites_json=""
{
  echo "# Pre-gate report"
  echo
  echo "- repo: $REPO"
  echo "- range: $RANGE"
  echo "- generated: $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  echo
  echo "## Suites"
} > "$REPORT"

for t in "$TESTS_DIR"/test-*.sh; do
  [ -e "$t" ] || DIE "no test-*.sh suites found in $TESTS_DIR"
  name="$(basename "$t")"
  set +e; out="$(PREGATE_INNER=1 bash "$t" 2>&1)"; code=$?; set -e
  # `|| true`: under pipefail, grep finding no matching tally line (a sibling suite phrasing its
  # tally differently, e.g. "# passed 35, failed 0") exits 1, which would otherwise kill this
  # script via set -e on the surrounding assignment — a suite with no recognizable tally line
  # must degrade to "(no tally line)", not abort the whole sweep.
  tally="$(printf '%s\n' "$out" | grep -E '[0-9]+ passed, [0-9]+ failed' | tail -1 || true)"
  [ -n "$tally" ] || tally="(no tally line)"
  status=pass; [ "$code" -eq 0 ] || { status=fail; overall=fail; }
  printf -- '- `%s` — %s — exit %d — %s\n' "$name" "$tally" "$code" "$status" >> "$REPORT"
  suites_json="$suites_json{\"suite\":\"$name\",\"exit\":$code,\"status\":\"$status\"},"
  LOG "$name: exit $code ($tally)"
done

trailer_status=pass
{
  echo
  echo "## Commit trailers ($RANGE)"
} >> "$REPORT"
while IFS= read -r sha; do
  body="$(git -C "$REPO" log -1 --format='%(trailers)' "$sha")"
  ok=yes
  printf '%s' "$body" | grep -q 'Tribe-Card:' || ok=no
  printf '%s' "$body" | grep -qi 'co-authored-by' && ok=no
  if [ "$ok" = yes ]; then
    printf -- '- %s — ok\n' "$sha" >> "$REPORT"
  else
    printf -- '- %s — trailer violation\n' "$sha" >> "$REPORT"
    trailer_status=fail; overall=fail
  fi
done < <(git -C "$REPO" rev-list "$RANGE")

fence_status=skipped
if [ -n "$FENCE" ]; then
  [ -f "$FENCE" ] || DIE "fence file not found: $FENCE"
  fence_status=pass
  { echo; echo "## Scope fence"; } >> "$REPORT"
  while IFS= read -r f; do
    allowed=no
    # F3 fix: `|| [ -n "$glob" ]` also processes the fence file's last glob when that file lacks
    # a trailing newline (plain `read` returns non-zero on the final unterminated line, which
    # would otherwise silently drop it from every match below and false-flag legitimate files).
    while IFS= read -r glob || [ -n "$glob" ]; do
      [ -n "$glob" ] || continue
      # F2 fix: a lone `*` in a fence glob matches within ONE path segment only (gitignore-style
      # intuition — `plugins/tribe/scripts/*.sh` means "this directory only"); only a literal
      # trailing `/**` crosses directory boundaries (that case is handled by the second match
      # below, unchanged). Enforced structurally: split both the file and the glob on `/`,
      # require the same segment count, then match segment-by-segment — a lone `*` inside a
      # single segment has no `/` inside it to cross.
      if [ "${glob%/\*\*}" = "$glob" ]; then
        IFS=/ read -r -a fseg <<< "$f"
        IFS=/ read -r -a gseg <<< "$glob"
        if [ "${#fseg[@]}" -eq "${#gseg[@]}" ]; then
          seg_ok=yes
          for i in "${!gseg[@]}"; do
            case "${fseg[$i]}" in ${gseg[$i]}) : ;; *) seg_ok=no; break ;; esac
          done
          [ "$seg_ok" = yes ] && allowed=yes
        fi
      fi
      case "$f" in ${glob%/\*\*}/*) allowed=yes ;; esac
    done < "$FENCE"
    if [ "$allowed" = yes ]; then
      printf -- '- %s — in fence\n' "$f" >> "$REPORT"
    else
      printf -- '- %s — FENCE VIOLATION\n' "$f" >> "$REPORT"
      fence_status=fail; overall=fail
    fi
  done < <(git -C "$REPO" diff --name-only "$RANGE")
fi

{
  echo
  echo "## Verdict: $overall"
} >> "$REPORT"
printf '{"range":"%s","suites":[%s],"trailers":"%s","fence":"%s","verdict":"%s"}\n' \
  "$RANGE" "${suites_json%,}" "$trailer_status" "$fence_status" "$overall"
[ "$overall" = pass ]
