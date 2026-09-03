# De-risk transcript — subagent dispatch inside the harness `with_skill` leg

**Card:** `i106-blind-reader-review` (campaign `gh-issues-2026-09`) · **Plan Task 1/10**
**Date:** 2026-09-03 · **Run by:** Warchief (paid go/no-go probe, same class as the Task 8/9 evidence runs)

## Question

Rule 5 dispatches a fresh subagent from inside the isolated `claude -p` process the eval
harness spawns. If that process cannot call the `Agent`/`Task` tool, Rule 5 cannot be
evidenced by the harness (spec §7 risk 3). This probe answers that before any rule code is
written, replicating the harness's `with_skill` invocation flags from
`scripts/evals/run_evals.py` `run_claude()`.

## Exact command

```bash
PROBE=$(mktemp -d)
cd "$PROBE"
env -u CLAUDECODE claude -p 'Dispatch one fresh subagent using your Agent or Task tool, requesting the model sonnet. The subagent brief must be exactly: reply with the single line SUBAGENT-OK 7919 and nothing else. When it returns, write its reply verbatim into reader-result.txt in the current working directory, then print one final line reading MAIN-SAW: followed by that reply.' \
  --output-format stream-json --verbose --no-session-persistence \
  --model claude-haiku-4-5-20251001 \
  --permission-mode bypassPermissions \
  --setting-sources project --strict-mcp-config \
  > probe.stream.json 2> probe.stderr.txt
echo "exit=$?"
```

**Exit code:** `0`
**Executor model:** `claude-haiku-4-5-20251001` (owner cheap-model rule)
**CLI:** `claude` 2.1.258 (Claude Code)

## The three answers

### 1. Did a dispatch tool get called at all?

```
$ grep -o '"name":"[A-Za-z]*"' probe.stream.json | sort | uniq -c
   1 "name":"Agent"
   1 "name":"Write"
```

`Agent` was called once. **Yes — subagent dispatch is available.**

### 2. Was a model override accepted on that call?

```
$ grep -o '"model":"[^"]*"' probe.stream.json | sort | uniq -c
   7 "model":"claude-haiku-4-5-20251001"
   1 "model":"sonnet"
```

The main session ran on the executor model (`claude-haiku-4-5-20251001`); the single
`"model":"sonnet"` is the override carried on the `Agent` dispatch. **Yes — an explicit
reader-model override is accepted.** Rule 5 may therefore ask for `sonnet` by default and
record it; the `D106-4` degrade path remains the fallback for a session that lacks the tool.

### 3. Did the main session read the subagent reply back?

```
$ cat reader-result.txt
SUBAGENT-OK 7919
$ grep -c 'SUBAGENT-OK 7919' probe.stream.json
9
```

The final `result` event (`subtype: success`) carried exactly:

```
MAIN-SAW: SUBAGENT-OK 7919
```

The subagent produced the sentinel, the main session captured it to `reader-result.txt`,
and echoed it back in its final line. The full round-trip works.

## Verdict

**DISPATCH AVAILABLE** — a skill running inside the harness's `with_skill` `claude -p` leg
can dispatch a fresh subagent and read its reply back.

**Reader-model override: ACCEPTED** — an explicit `sonnet` model override crossed onto the
dispatch call.

Task 2 onward proceeds unchanged.
