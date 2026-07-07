#!/usr/bin/env bash
# workflow-journal post-install hook.
#
# The plugin ships its auto-capture Stop hook two ways (belt-and-suspenders):
#
#   1. hooks/hooks.json  — native plugin hook. Activates when workflow-journal is
#      loaded as a real plugin (marketplace install, or a whole-plugin @skills-dir
#      symlink where .claude-plugin/plugin.json travels with hooks/).
#   2. THIS script        — the fallback for the repo's default install path, where
#      only the inner skills/workflow-journal/ folder is symlinked into
#      ~/.claude/skills/ (so the native hook is never discovered). It wires the
#      Stop hook straight into settings.json instead.
#
# Both are idempotent and the exporter is exactly-once per run, so if both ever
# fire, the second is a harmless no-op.
#
# Invoked by the repo's top-level install.sh with CLAUDE_DIR passed through.

set -euo pipefail

CLAUDE_DIR="${CLAUDE_DIR:-$HOME/.claude}"
SETTINGS="$CLAUDE_DIR/settings.json"

# The exporter is reached through the skill symlink the top-level install.sh
# creates — one source of truth, no copied script to drift. Home-relative so the
# command is portable to any machine/user (the exporter expanduser()s ~ itself).
HOOK_CMD="python3 ~/.claude/skills/workflow-journal/scripts/wf-export.py --hook --out ~/workflow-journal"

# We only know how to edit the standard ~/.claude location portably. A custom
# CLAUDE_DIR (e.g. test harness) gets the native hooks.json path instead — skip.
if [ "$CLAUDE_DIR" != "$HOME/.claude" ]; then
  echo "  hook    workflow-journal: CLAUDE_DIR is not ~/.claude — relying on native hooks/hooks.json (settings.json not touched)"
  exit 0
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "WARN: workflow-journal: python3 not found — cannot wire Stop hook; add it to settings.json manually (see SKILL.md)" >&2
  exit 0
fi

mkdir -p "$CLAUDE_DIR"

WF_HOOK_CMD="$HOOK_CMD" python3 - "$SETTINGS" <<'PY'
import json, os, sys

settings_path = sys.argv[1]
hook_cmd = os.environ["WF_HOOK_CMD"]

try:
    with open(settings_path) as f:
        settings = json.load(f)
except FileNotFoundError:
    settings = {}
except (json.JSONDecodeError, OSError) as e:
    print(f"WARN: workflow-journal: cannot parse {settings_path} ({e}) — Stop hook NOT wired; add it manually (see SKILL.md)", file=sys.stderr)
    sys.exit(0)

hooks = settings.setdefault("hooks", {})
stop = hooks.setdefault("Stop", [])

# Idempotent: if any existing Stop hook already runs the exporter (this machine
# may already have a hand-wired one pointing at ~/.claude/scripts/wf-export.py),
# leave it alone rather than adding a duplicate.
def mentions_exporter(group):
    for h in group.get("hooks", []):
        if "wf-export.py" in (h.get("command") or ""):
            return True
    return False

if any(mentions_exporter(g) for g in stop):
    print("  ok      workflow-journal: Stop hook already present in settings.json")
    sys.exit(0)

stop.append({
    "matcher": "",
    "hooks": [{"type": "command", "command": hook_cmd}],
})

# Write via temp + atomic replace, keeping a one-shot backup.
tmp = settings_path + ".tmp"
with open(tmp, "w") as f:
    json.dump(settings, f, indent=2)
    f.write("\n")
if os.path.exists(settings_path):
    try:
        os.replace(settings_path, settings_path + ".bak")
    except OSError:
        pass
os.replace(tmp, settings_path)
print("  linked  workflow-journal: Stop hook wired into settings.json (auto-capture on)")
PY
