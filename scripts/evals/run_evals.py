#!/usr/bin/env python3
"""Repo-level eval runner for todd-skills.

Executes an `evals/evals.json` file (the shape already used by
`refactor-for-testability`: skill_name, evals[].id/name/prompt/expected_output/files)
against isolated `claude -p` subprocesses — one clean-context process per case per
configuration, mirroring the official skill-creator eval loop's own runner
(`skill-creator/scripts/run_eval.py` spawns one `claude -p` per query rather than
reusing a session) instead of inventing a new mechanism.

For every case, up to two configurations are run:

  with_skill     the skill/agent under test is made available for this invocation
                 only:
                   - skill evals (kind: "skill") register a throwaway project
                     command file under .claude/commands/ whose `description:`
                     is the real SKILL.md description, exactly like
                     run_eval.py's run_single_query() does — so the skill can
                     genuinely trigger (or fail to) via the normal Skill tool,
                     not be force-fed.
                   - agent evals (kind: "agent", tribe) pass the named agent's
                     real frontmatter + body straight through `--agents` /
                     `--agent`, independent of whether it happens to be
                     symlink-installed locally — the eval targets the agent
                     definition in this repo, not the local install state.
  without_skill  a `claude -p --safe-mode` call — nothing registered AND all
                 user-level customizations (CLAUDE.md, skills, plugins, hooks,
                 MCP servers, custom commands/agents) disabled, so a skill
                 that also happens to be installed at user scope on the
                 machine running this harness (common when dogfooding this
                 repo's own marketplace) cannot silently fire and collapse
                 the baseline into the with_skill run. This is the baseline
                 a benchmark compares against.

Each run's transcript and the token/duration numbers `claude -p --output-format
json` already reports (duration_ms, usage, total_cost_usd — no separate
instrumentation needed) are graded by a second, tool-less `claude -p` call (the
"grader"), scored against the case's expected_output. Results are written as
grading.json per run (schema: skill-creator's references/schemas.md
`grading.json`) and rolled up into one benchmark.json per invocation (schema:
skill-creator's `benchmark.json`, with_skill vs without_skill).

This script only reads skill/agent files and shells out to `claude -p` in a
scratch working directory — it never edits a skill's or agent's runtime files.

Usage:
    scripts/evals/run_evals.py --evals plugins/splitting-plans/skills/splitting-plans/evals/evals.json
    scripts/evals/run_evals.py --evals plugins/tribe/evals/evals.json --eval-id 3,6
    scripts/evals/run_evals.py --all                      # every evals.json under plugins/
    scripts/evals/run_evals.py --all --mode with_skill     # skip the baseline, just prove it runs
    scripts/evals/run_evals.py --all --dry-run             # list what would run, no API calls
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
CONFIGURATIONS = ("with_skill", "without_skill")


# ---------------------------------------------------------------------------
# Frontmatter parsing (SKILL.md / agents/*.md share the same shape)
# ---------------------------------------------------------------------------

def parse_frontmatter(path: Path) -> tuple[dict, str]:
    """Split a SKILL.md / agent .md into (frontmatter fields, body).

    Handles the `key: value` and `key: >-` / `key: |` block-scalar forms used
    throughout this repo's skills and agents. Not a general YAML parser — just
    enough to recover `name` and `description` for eval registration.
    """
    text = path.read_text()
    if not text.startswith("---"):
        return {}, text

    end = text.find("\n---", 3)
    if end == -1:
        return {}, text
    fm_block = text[3:end].strip("\n")
    body = text[end + 4:].lstrip("\n")

    fields: dict[str, str] = {}
    lines = fm_block.split("\n")
    i = 0
    while i < len(lines):
        line = lines[i]
        m = re.match(r"^([A-Za-z_][A-Za-z0-9_-]*):\s*(.*)$", line)
        if not m:
            i += 1
            continue
        key, rest = m.group(1), m.group(2).strip()
        if rest in (">-", "|", ">", "|-"):
            collected = []
            i += 1
            while i < len(lines) and (lines[i].startswith("  ") or lines[i].strip() == ""):
                collected.append(lines[i][2:] if lines[i].startswith("  ") else "")
                i += 1
            fields[key] = " ".join(l.strip() for l in collected if l.strip())
            continue
        fields[key] = rest.strip('"')
        i += 1
    return fields, body


# ---------------------------------------------------------------------------
# claude -p invocation
# ---------------------------------------------------------------------------

def run_claude(prompt: str, cwd: Path, timeout: int, model: str | None = None,
                agents_json: dict | None = None, agent_name: str | None = None,
                tools: str | None = None, safe_mode: bool = False) -> dict:
    """Run one isolated `claude -p` process and return its parsed result.

    Returns a dict with at least: ok (bool), events (list, may be empty on
    timeout/error), error (str|None).
    """
    cmd = ["claude", "-p", prompt, "--output-format", "json", "--no-session-persistence"]
    if model:
        cmd += ["--model", model]
    if agents_json:
        cmd += ["--agents", json.dumps(agents_json)]
    if agent_name:
        cmd += ["--agent", agent_name]
    if tools is not None:
        cmd += ["--tools", tools]
    if safe_mode:
        # Disables CLAUDE.md, skills, plugins, hooks, MCP servers, custom
        # commands/agents — i.e. everything installed at user/project scope
        # on the host machine, not just "nothing extra registered for this
        # call". Without this, a skill that is also symlink-installed at
        # user scope (the normal state when dogfooding this repo) fires for
        # the without_skill baseline too, collapsing the with/without
        # comparison. Only ever passed for the without_skill configuration —
        # with_skill needs the throwaway project command / --agents payload
        # to actually be visible, which --safe-mode would itself suppress.
        cmd += ["--safe-mode"]

    env = {k: v for k, v in os.environ.items() if k != "CLAUDECODE"}

    start = time.time()
    try:
        proc = subprocess.run(
            cmd, cwd=str(cwd), capture_output=True, text=True,
            timeout=timeout, env=env,
        )
    except subprocess.TimeoutExpired:
        return {"ok": False, "events": [], "error": f"timeout after {timeout}s",
                "wall_seconds": time.time() - start}
    except FileNotFoundError:
        return {"ok": False, "events": [], "error": "claude CLI not found on PATH",
                "wall_seconds": time.time() - start}

    wall = time.time() - start
    if proc.returncode != 0 and not proc.stdout.strip():
        return {"ok": False, "events": [], "error": f"exit {proc.returncode}: {proc.stderr[-2000:]}",
                "wall_seconds": wall}

    try:
        events = json.loads(proc.stdout)
        if isinstance(events, dict):
            events = [events]
    except json.JSONDecodeError as e:
        return {"ok": False, "events": [], "error": f"bad JSON from claude -p: {e}",
                "wall_seconds": wall, "raw_stdout": proc.stdout[-2000:]}

    return {"ok": True, "events": events, "error": None, "wall_seconds": wall}


def extract_metrics(run: dict) -> dict:
    """Derive metrics.json-shaped data + a flat transcript from claude -p events."""
    tool_calls: dict[str, int] = {}
    transcript_parts: list[str] = []
    errors = 0
    result_event = None

    for event in run.get("events", []):
        etype = event.get("type")
        if etype == "assistant":
            message = event.get("message", {})
            for item in message.get("content", []):
                if item.get("type") == "text":
                    transcript_parts.append(f"ASSISTANT: {item['text']}")
                elif item.get("type") == "tool_use":
                    name = item.get("name", "unknown")
                    tool_calls[name] = tool_calls.get(name, 0) + 1
                    transcript_parts.append(f"TOOL_USE: {name} {json.dumps(item.get('input', {}))[:300]}")
        elif etype == "user":
            message = event.get("message", {})
            content = message.get("content", [])
            if isinstance(content, list):
                for item in content:
                    if isinstance(item, dict) and item.get("type") == "tool_result":
                        if item.get("is_error"):
                            errors += 1
        elif etype == "result":
            result_event = event

    transcript = "\n".join(transcript_parts)
    metrics = {
        "tool_calls": tool_calls,
        "total_tool_calls": sum(tool_calls.values()),
        "total_steps": sum(1 for e in run.get("events", []) if e.get("type") == "assistant"),
        "errors_encountered": errors,
        "output_chars": len(result_event.get("result", "")) if result_event else 0,
        "transcript_chars": len(transcript),
    }

    timing = {}
    tokens = 0
    cost_usd = 0.0
    if result_event:
        usage = result_event.get("usage", {})
        tokens = (usage.get("input_tokens", 0) + usage.get("output_tokens", 0)
                  + usage.get("cache_creation_input_tokens", 0) + usage.get("cache_read_input_tokens", 0))
        cost_usd = result_event.get("total_cost_usd", 0.0)
        timing = {
            "duration_ms": result_event.get("duration_ms", 0),
            "total_duration_seconds": round(result_event.get("duration_ms", 0) / 1000.0, 1),
            "num_turns": result_event.get("num_turns", 0),
        }

    return {
        "metrics": metrics,
        "timing": timing,
        "transcript": transcript,
        "final_result": result_event.get("result", "") if result_event else "",
        "is_error": bool(result_event.get("is_error")) if result_event else True,
        "total_tokens": tokens,
        "total_cost_usd": cost_usd,
    }


# ---------------------------------------------------------------------------
# Skill registration (mirrors skill-creator's run_eval.py exactly)
# ---------------------------------------------------------------------------

def register_skill_command(scratch_dir: Path, skill_name: str, description: str) -> Path:
    unique = uuid.uuid4().hex[:8]
    clean_name = f"{skill_name}-eval-{unique}"
    cmd_dir = scratch_dir / ".claude" / "commands"
    cmd_dir.mkdir(parents=True, exist_ok=True)
    cmd_file = cmd_dir / f"{clean_name}.md"
    indented = "\n  ".join(description.split("\n"))
    cmd_file.write_text(
        f"---\ndescription: |\n  {indented}\n---\n\n# {skill_name}\n\n"
        f"This skill handles: {description}\n"
    )
    return cmd_file


# ---------------------------------------------------------------------------
# Grading
# ---------------------------------------------------------------------------

GRADER_INSTRUCTIONS = """You are grading an AI agent's response to a task, exactly like a \
disinterested QA reviewer. You have no tools — judge only from the text given below.

TASK PROMPT GIVEN TO THE AGENT:
{prompt}

EXPECTED BEHAVIOR (what a correct response looks like):
{expected_output}

AGENT'S FULL TRANSCRIPT (assistant text + tool calls it made):
{transcript}

AGENT'S FINAL MESSAGE:
{final_result}

Judge whether the agent's actual behavior matches the expected behavior. Output ONLY a JSON \
object, no prose, no markdown fences, matching exactly this shape:
{{"passed": true or false, "evidence": "one or two sentences quoting or describing what in the \
transcript/final message supports your verdict"}}
"""


def grade(prompt: str, expected_output: str, transcript: str, final_result: str,
          cwd: Path, timeout: int, model: str | None) -> dict:
    grader_prompt = GRADER_INSTRUCTIONS.format(
        prompt=prompt, expected_output=expected_output,
        transcript=transcript[:20000] or "(no assistant output captured)",
        final_result=final_result[:4000],
    )
    run = run_claude(grader_prompt, cwd=cwd, timeout=timeout, model=model, tools="")
    if not run["ok"]:
        return {"passed": False, "evidence": f"grader failed to run: {run['error']}"}

    parsed = extract_metrics(run)
    text = parsed["final_result"].strip()
    # Grader is tool-less and asked for bare JSON; strip stray fences if present.
    text = re.sub(r"^```(?:json)?|```$", "", text.strip(), flags=re.MULTILINE).strip()
    try:
        verdict = json.loads(text)
        return {"passed": bool(verdict.get("passed")), "evidence": str(verdict.get("evidence", ""))}
    except (json.JSONDecodeError, AttributeError):
        return {"passed": False, "evidence": f"grader returned non-JSON: {text[:500]}"}


# ---------------------------------------------------------------------------
# Case execution
# ---------------------------------------------------------------------------

def build_agents_payload(agent_fields: dict, agent_body: str) -> dict:
    name = agent_fields.get("name", "eval-agent")
    description = agent_fields.get("description") or f"Role under test: {name}."
    return {name: {"description": description, "prompt": agent_body.strip()}}


def run_case(case: dict, kind: str, skill_dir: Path | None, agents_dir: Path | None,
             configuration: str, timeout: int, exec_model: str | None,
             grader_model: str | None, out_dir: Path, verbose: bool, run_idx: int = 0) -> dict:
    scratch = Path(tempfile.mkdtemp(prefix="todd-skills-eval-"))
    try:
        agents_json = None
        agent_name = None
        skill_name = None

        if kind == "skill":
            fields, _ = parse_frontmatter(skill_dir / "SKILL.md")
            skill_name = fields.get("name", skill_dir.name)
            if configuration == "with_skill":
                register_skill_command(scratch, skill_name, fields.get("description", ""))
        elif kind == "agent":
            agent_key = case["agent"]
            agent_path = agents_dir / f"{agent_key}.md"
            if not agent_path.exists():
                return {"error": f"no agent file at {agent_path}"}
            fields, body = parse_frontmatter(agent_path)
            if configuration == "with_skill":
                agents_json = build_agents_payload(fields, body)
                agent_name = fields.get("name", agent_key)
        else:
            return {"error": f"unknown kind {kind!r}"}

        if verbose:
            print(f"    [{configuration}] executing (timeout={timeout}s)...", file=sys.stderr)

        exec_run = run_claude(
            case["prompt"], cwd=scratch, timeout=timeout, model=exec_model,
            agents_json=agents_json, agent_name=agent_name,
            safe_mode=(configuration == "without_skill"),
        )
        if not exec_run["ok"]:
            return {"error": exec_run["error"], "configuration": configuration}

        parsed = extract_metrics(exec_run)

        if verbose:
            print(f"    [{configuration}] grading...", file=sys.stderr)
        grader_start = time.time()
        verdict = grade(
            case["prompt"], case["expected_output"], parsed["transcript"],
            parsed["final_result"], cwd=scratch, timeout=timeout, model=grader_model,
        )
        grader_seconds = time.time() - grader_start

        # `run-{N}` (1-based) is always part of the path — not only when --runs > 1 —
        # so a single, consistent layout is used regardless of --runs, and repeat
        # runs of the same case+configuration never overwrite each other's
        # transcript.md/metrics.json/grading.json (the per-run evidence trail the
        # card requires).
        run_dir = out_dir / f"eval-{case['id']}-{case['name']}" / configuration / f"run-{run_idx + 1}"
        run_dir.mkdir(parents=True, exist_ok=True)
        (run_dir / "transcript.md").write_text(
            f"# {case['name']} — {configuration}\n\n## Prompt\n{case['prompt']}\n\n"
            f"## Transcript\n{parsed['transcript']}\n\n## Final result\n{parsed['final_result']}\n"
        )
        metrics_json = {**parsed["metrics"]}
        (run_dir / "metrics.json").write_text(json.dumps(metrics_json, indent=2))

        grading_json = {
            "expectations": [
                {"text": case["expected_output"], "passed": verdict["passed"], "evidence": verdict["evidence"]}
            ],
            "summary": {
                "passed": 1 if verdict["passed"] else 0,
                "failed": 0 if verdict["passed"] else 1,
                "total": 1,
                "pass_rate": 1.0 if verdict["passed"] else 0.0,
            },
            "execution_metrics": metrics_json,
            "timing": {
                "executor_duration_seconds": exec_run["wall_seconds"],
                "grader_duration_seconds": round(grader_seconds, 1),
                "total_duration_seconds": round(exec_run["wall_seconds"] + grader_seconds, 1),
            },
        }
        (run_dir / "grading.json").write_text(json.dumps(grading_json, indent=2))

        return {
            "eval_id": case["id"],
            "eval_name": case["name"],
            "configuration": configuration,
            "result": {
                "pass_rate": grading_json["summary"]["pass_rate"],
                "passed": grading_json["summary"]["passed"],
                "total": 1,
                "time_seconds": round(exec_run["wall_seconds"], 1),
                "tokens": parsed["total_tokens"],
                "cost_usd": parsed["total_cost_usd"],
                "tool_calls": metrics_json["total_tool_calls"],
                "errors": metrics_json["errors_encountered"],
            },
            "expectations": grading_json["expectations"],
        }
    finally:
        shutil.rmtree(scratch, ignore_errors=True)


# ---------------------------------------------------------------------------
# Benchmark aggregation
# ---------------------------------------------------------------------------

def mean(xs: list[float]) -> float:
    return sum(xs) / len(xs) if xs else 0.0


def stddev(xs: list[float]) -> float:
    if len(xs) < 2:
        return 0.0
    m = mean(xs)
    return (sum((x - m) ** 2 for x in xs) / (len(xs) - 1)) ** 0.5


def summarize_configuration(runs: list[dict]) -> dict:
    if not runs:
        return {}
    pass_rates = [r["result"]["pass_rate"] for r in runs]
    times = [r["result"]["time_seconds"] for r in runs]
    tokens = [r["result"]["tokens"] for r in runs]
    return {
        "pass_rate": {"mean": round(mean(pass_rates), 3), "stddev": round(stddev(pass_rates), 3),
                       "min": min(pass_rates), "max": max(pass_rates)},
        "time_seconds": {"mean": round(mean(times), 1), "stddev": round(stddev(times), 1),
                          "min": min(times), "max": max(times)},
        "tokens": {"mean": round(mean(tokens)), "stddev": round(stddev(tokens)),
                    "min": min(tokens), "max": max(tokens)},
    }


def fmt_delta(with_val: float, without_val: float) -> str:
    d = with_val - without_val
    return f"{'+' if d >= 0 else ''}{d:.2f}" if abs(d) < 10 else f"{'+' if d >= 0 else ''}{d:.1f}"


def display_path(path: Path) -> str:
    """Path for printing/JSON: repo-relative when possible, absolute otherwise.

    `--out-dir` is a documented flag with no repo-relative constraint (CI
    artifact dirs, /tmp scratch, etc. are normal uses), so paths under it
    must never assume they live inside REPO_ROOT.
    """
    try:
        return str(path.relative_to(REPO_ROOT))
    except ValueError:
        return str(path)


# ---------------------------------------------------------------------------
# Driver
# ---------------------------------------------------------------------------

def discover_evals_json() -> list[Path]:
    return sorted((REPO_ROOT / "plugins").glob("**/evals/evals.json"))


def derive_kind_and_dirs(evals_path: Path, declared_kind: str | None) -> tuple[str, Path | None, Path | None]:
    kind = declared_kind or "skill"
    if kind == "agent":
        return kind, None, evals_path.parent.parent / "agents"
    return kind, evals_path.parent.parent, None


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--evals", action="append", default=[], help="Path to an evals.json (repeatable)")
    ap.add_argument("--all", action="store_true", help="Discover + run every plugins/**/evals/evals.json")
    ap.add_argument("--eval-id", default=None, help="Comma-separated eval ids to restrict to (default: all)")
    ap.add_argument("--mode", choices=["both", "with_skill", "without_skill"], default="both")
    ap.add_argument("--runs", type=int, default=1, help="Runs per case per configuration")
    ap.add_argument("--timeout", type=int, default=420, help="Seconds per claude -p call (executor or grader)")
    ap.add_argument("--exec-model", default=None, help="Model for the executor (default: user's configured model)")
    ap.add_argument("--grader-model", default=None, help="Model for the grader (default: same as --exec-model)")
    ap.add_argument("--out-dir", default=None, help="Output root (default: scripts/evals/runs/<timestamp>)")
    ap.add_argument("--dry-run", action="store_true", help="List what would run; make no claude -p calls")
    ap.add_argument("--verbose", action="store_true")
    args = ap.parse_args()

    evals_paths = [Path(p).resolve() for p in args.evals]
    if args.all:
        evals_paths += discover_evals_json()
    if not evals_paths:
        print("No evals.json given. Use --evals PATH or --all.", file=sys.stderr)
        return 2

    wanted_ids = None
    if args.eval_id:
        wanted_ids = {int(x) for x in args.eval_id.split(",")}

    configurations = CONFIGURATIONS if args.mode == "both" else (args.mode,)

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    out_root = Path(args.out_dir) if args.out_dir else REPO_ROOT / "scripts" / "evals" / "runs" / timestamp

    all_runs: list[dict] = []
    metadata = {
        "timestamp": timestamp,
        "runs_per_configuration": args.runs,
        "exec_model": args.exec_model or "(default)",
        "evals_run": [],
    }

    for evals_path in evals_paths:
        if not evals_path.exists():
            print(f"WARN: {evals_path} does not exist, skipping", file=sys.stderr)
            continue
        data = json.loads(evals_path.read_text())
        skill_name = data["skill_name"]
        kind, skill_dir, agents_dir = derive_kind_and_dirs(evals_path, data.get("kind"))
        cases = [c for c in data["evals"] if wanted_ids is None or c["id"] in wanted_ids]
        metadata["evals_run"].append({"skill_name": skill_name, "kind": kind,
                                        "evals_json": display_path(evals_path),
                                        "case_ids": [c["id"] for c in cases]})

        print(f"== {skill_name} ({kind}) — {len(cases)} case(s) from {display_path(evals_path)} ==")

        for case in cases:
            print(f"  eval {case['id']}: {case['name']}")
            for configuration in configurations:
                # For agent evals, without_skill means "no persona at all" — still a
                # meaningful baseline (does a vanilla Claude do the right thing
                # anyway?), so it stays in the default `both` mode, not skipped.
                if args.dry_run:
                    print(f"    [dry-run] would execute {configuration}")
                    continue
                for run_idx in range(args.runs):
                    out_dir = out_root / skill_name
                    result = run_case(
                        case, kind, skill_dir, agents_dir, configuration,
                        timeout=args.timeout, exec_model=args.exec_model,
                        grader_model=args.grader_model or args.exec_model,
                        out_dir=out_dir, verbose=args.verbose, run_idx=run_idx,
                    )
                    if "error" in result:
                        print(f"    [{configuration}] ERROR: {result['error']}", file=sys.stderr)
                        continue
                    result["run_number"] = run_idx + 1
                    result["skill_name"] = skill_name
                    all_runs.append(result)
                    verdict = "PASS" if result["result"]["passed"] else "FAIL"
                    print(f"    [{configuration}] {verdict}  "
                          f"{result['result']['time_seconds']}s  {result['result']['tokens']} tokens")

    if args.dry_run:
        return 0

    with_runs = [r for r in all_runs if r["configuration"] == "with_skill"]
    without_runs = [r for r in all_runs if r["configuration"] == "without_skill"]
    with_summary = summarize_configuration(with_runs)
    without_summary = summarize_configuration(without_runs)

    run_summary = {}
    if with_summary:
        run_summary["with_skill"] = with_summary
    if without_summary:
        run_summary["without_skill"] = without_summary
    if with_summary and without_summary:
        run_summary["delta"] = {
            "pass_rate": fmt_delta(with_summary["pass_rate"]["mean"], without_summary["pass_rate"]["mean"]),
            "time_seconds": fmt_delta(with_summary["time_seconds"]["mean"], without_summary["time_seconds"]["mean"]),
            "tokens": fmt_delta(with_summary["tokens"]["mean"], without_summary["tokens"]["mean"]),
        }

    benchmark = {
        "metadata": metadata,
        "runs": all_runs,
        "run_summary": run_summary,
        "notes": [],
    }

    out_root.mkdir(parents=True, exist_ok=True)
    benchmark_path = out_root / "benchmark.json"
    benchmark_path.write_text(json.dumps(benchmark, indent=2))
    print(f"\nWrote {len(all_runs)} run(s) -> {display_path(benchmark_path)}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
