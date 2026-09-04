#!/usr/bin/env bash
# test-watchdog-detached.sh — the detached-launch contract from spec §8.
#
# Two walls:
#   1. the documented one-liner really detaches (child reparented to pid 1, survives the
#      launching shell's exit) — on macOS, where `setsid` does not exist;
#   2. SKILL.md's Stage B carries that exact one-liner and never mentions setsid.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL="$HERE/../../skills/orchestrate-campaign/SKILL.md"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); printf 'ok - %s\n' "$1"; }
bad() { FAIL=$((FAIL+1)); printf 'not ok - %s\n' "$1"; }
check()    { if [[ "$2" == "$3" ]]; then ok "$1"; else bad "$1 (got: $2, want: $3)"; fi }
contains() { if [[ "$2" == *"$3"* ]]; then ok "$1"; else bad "$1 (got: $2, want substring: $3)"; fi }

# --- Wall 1: the pattern detaches ------------------------------------------------------
# A launching shell that exits IMMEDIATELY after starting a long-lived probe the exact way
# Stage B starts the watchdog. `-p` prints the child's pid via the pidfile it writes.
PIDFILE="$TMP/probe.pid"; MARKER="$TMP/probe.done"
bash -c "
  cd '$TMP'
  ( nohup bash -c 'printf %s \$\$ > \"$PIDFILE\"; sleep 20; : > \"$MARKER\"' \
      </dev/null >'$TMP/probe.log' 2>&1 & )
"   # <- this shell has now EXITED; anything still running is detached from it

# Poll for the pidfile (no `timeout` binary on macOS).
probe_pid=""
for _ in $(seq 1 100); do
  [[ -s "$PIDFILE" ]] && { probe_pid="$(cat "$PIDFILE")"; break; }
  sleep 0.05
done
if [[ -n "$probe_pid" ]]; then ok "the launched probe reported its pid"; else bad "the launched probe reported its pid"; fi

if kill -0 "$probe_pid" 2>/dev/null; then
  ok "the probe is still alive after its launching shell exited"
else
  bad "the probe is still alive after its launching shell exited"
fi
ppid="$(ps -o ppid= -p "$probe_pid" | tr -d ' ')"
check "the probe was reparented to pid 1 (double-fork worked, no setsid needed)" "$ppid" "1"
kill "$probe_pid" 2>/dev/null || true

# --- Wall 2: SKILL.md documents exactly this pattern -----------------------------------
skill_text="$(cat "$SKILL")"
contains "Stage B launches the watchdog subcommand"      "$skill_text" 'run.ts" watchdog'
contains "and does so with the double-fork one-liner"    "$skill_text" '( nohup bun'
contains "with stdin from /dev/null"                     "$skill_text" '</dev/null'
contains "and arms a wake-up loop on status.json"        "$skill_text" 'watchdog/status.json'
contains "and states that no /loop heartbeat is needed"  "$skill_text" 'no `/loop` heartbeat'
case "$skill_text" in
  *setsid*) bad "SKILL.md never tells a macOS user to run setsid (it does not exist there)" ;;
  *)        ok  "SKILL.md never tells a macOS user to run setsid (it does not exist there)" ;;
esac

printf '\n%s passed, %s failed\n' "$PASS" "$FAIL"
[[ "$FAIL" -eq 0 ]]
