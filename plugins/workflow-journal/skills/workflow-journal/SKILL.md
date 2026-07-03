---
name: workflow-journal
description: Set up, run, or query the Claude Code Workflow exporter — it renders each Workflow run to one readable Markdown file (every agent's full prompt paired with its full result + token cost), and a Stop hook auto-captures every run as it completes. Use when the user wants to study their own prompting, review or export past Workflow runs, list what runs are on disk, wire up automatic workflow journaling, or asks things like "export my workflow runs", "list workflow runs", "capture my workflows", "set up the Stop hook to journal workflows", "where did that workflow run go", or "re-export run wf_…". Also self-trigger after authoring a substantial Workflow when the user wants a durable, human-readable record of it.
---

# Workflow Journal

Claude Code already persists everything about a `Workflow` run to disk, but only as raw JSON/JSONL scattered across three locations. This skill's `wf-export.py` **renders one run into a single readable Markdown file** — every agent's *full* prompt next to its *full* result, plus per-agent and total token cost — so you can study your own prompting after the fact. A `Stop` hook makes capture automatic: every run that completes in a session is exported exactly once.

## What it captures

Per run, the exported `.md` contains:

- A header line — status, timestamp, agent count, total tokens, tool calls, wall time.
- **Agents (index)** — a table: phase · label · model · tokens · tools · wall, one row per agent.
- **Agents (full prompt → result)** — for each agent, its complete prompt paired with its complete result (StructuredOutput is pretty-printed as JSON; otherwise the agent's final text).
- **Script (re-runnable)** — the standalone workflow script.
- **Final workflow result** and **Logs**.

## Where the source data lives

The script only reads what Claude Code already wrote under `~/.claude/projects/<project>/<session-id>/`:

```
workflows/wf_<id>.json                        <- run journal (script, result, progress, totals)
workflows/scripts/<name>-wf_<id>.js           <- the standalone script
subagents/workflows/wf_<id>/agent-<id>.jsonl  <- FULL per-agent transcript
```

Nothing is sent anywhere; it is a pure local render.

---

## Setup (one-time)

### 1. Install the script to a stable path

The `Stop` hook needs a fixed path, so copy the bundled script to `~/.claude/scripts/`:

```bash
mkdir -p ~/.claude/scripts
# $SRC = this skill's bundled script. In a clone of todd-skills:
cp plugins/workflow-journal/skills/workflow-journal/scripts/wf-export.py ~/.claude/scripts/wf-export.py
chmod +x ~/.claude/scripts/wf-export.py
```

(Only Python 3 stdlib is used — no `pip install`.)

### 2. Wire the Stop hook in `~/.claude/settings.json`

Add (or merge) this `Stop` hook. On every session Stop it exports any **newly-completed** runs in that session, exactly once, and never blocks Stop:

```json
{
  "hooks": {
    "Stop": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "python3 ~/.claude/scripts/wf-export.py --hook --out ~/workflow-journal"
          }
        ]
      }
    ]
  }
}
```

### 3. Pick your output directory

`--out ~/workflow-journal` above is the destination. Precedence, highest first:

| Source | How |
|---|---|
| `--out DIR` / `-o DIR` / `--out=DIR` | CLI flag (used in the hook above) |
| `$WF_EXPORT_DIR` | env var — handy if you'd rather not hard-code the path in the hook |
| `~/workflow-journal` | built-in default |

### 4. Verify

```bash
python3 ~/.claude/scripts/wf-export.py --list          # every run found on disk
python3 ~/.claude/scripts/wf-export.py <runId|taskId>  # export one now
ls ~/workflow-journal                                  # rendered .md files land here
```

---

## Usage (CLI)

```
wf-export.py <journal.json>   export one run from its journal path
wf-export.py <runId>          find + export by runId          (e.g. wf_1e5340ac-a1e)
wf-export.py <taskId>         resolve taskId -> journal, export (e.g. wsoyz2kvx)
wf-export.py <session_dir>    export every completed run in a session dir
wf-export.py --list           list every run on disk (when | taskId | runId | name)
wf-export.py --hook           Stop-hook mode: read hook JSON on stdin, export new runs
```

`--out DIR` composes with any of the above.

## Output & state layout

```
<out>/<ts>__<name>__<runId>.md    one readable file per run
<out>/.state/<runId>.exported     exactly-once marker (delete to force a re-export)
<out>/.state/export.log           what the hook exported, and any hook errors
```

## Troubleshooting

- **Hook seems to do nothing** — it exits silently unless a run *completed* this session. Check `~/workflow-journal/.state/export.log`, or run `--list` to confirm runs exist on disk.
- **Want to re-export a run** — delete its `.state/<runId>.exported` marker, or just run `wf-export.py <runId>` directly (direct invocation ignores the marker).
- **Different project/output dir** — set `WF_EXPORT_DIR` in the hook's environment, or change the `--out` path in the hook command.
- **Never blocks Stop** — hook mode swallows its own errors and always exits 0, so a broken export can't wedge your session.
