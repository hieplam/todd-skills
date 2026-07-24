#!/usr/bin/env python3
"""Compare two benchmark.json runs — the regression tripwire for a prompt trim.

Why this exists
---------------
`run_evals.py`'s own roll-up answers "does the agent beat vanilla Claude?"
(with_skill vs without_skill). A prompt-trim run asks a different question:
"did editing this prompt change how the agent behaves?" That is a comparison
between two runs of the SAME cases against DIFFERENT prompt text, and nothing
in the harness read it until now.

What counts as a breach
-----------------------
A case that passed at baseline and fails on the candidate. Not a suite-average
dip: averages hide a single agent's regression behind twenty other cases, and
the whole point of a tripwire is that it halts on the specific loss.

Sampling noise is reported, never hidden
----------------------------------------
A single graded run is one sample of a stochastic model, so one flipped case at
`--runs 1` is not proof of a regression. This script grades each case by how many
of its N runs passed and separates two outcomes it would be dishonest to merge:

  CONFIRMED   passed every baseline run, failed every candidate run
  UNSTABLE    flipped, but inconsistently across runs — the case is noisy, and
              at --runs 1 EVERY flip lands here, because one sample cannot tell
              a regression from variance

Exit codes: 0 clean, 1 regression (CONFIRMED present), 2 setup error.
UNSTABLE alone exits 0 but always prints — it means "re-run with more --runs",
not "you are fine".

Usage
-----
    scripts/evals/compare.py --baseline runs/A/benchmark.json \\
                             --candidate runs/B/benchmark.json
    scripts/evals/compare.py --baseline A/benchmark.json \\
                             --candidate B/benchmark.json --json
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict
from pathlib import Path


def load(path: Path) -> dict:
    if not path.exists():
        raise SystemExit(f"ERROR: no such benchmark.json: {path}")
    try:
        return json.loads(path.read_text())
    except json.JSONDecodeError as e:
        raise SystemExit(f"ERROR: {path} is not valid JSON: {e}")


def index_runs(bench: dict, configuration: str) -> dict[tuple, list[bool]]:
    """(skill, eval_id, eval_name, agent) -> [passed?] across that case's runs."""
    out: dict[tuple, list[bool]] = defaultdict(list)
    for r in bench.get("runs", []):
        if r.get("configuration") != configuration:
            continue
        key = (r.get("skill_name"), r.get("eval_id"), r.get("eval_name"), r.get("agent"))
        out[key].append(bool(r.get("result", {}).get("passed")))
    return out


def subjects_of(bench: dict) -> dict[str, dict]:
    out: dict[str, dict] = {}
    for entry in bench.get("metadata", {}).get("evals_run", []):
        out.update(entry.get("subjects", {}) or {})
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--baseline", required=True, help="benchmark.json for the committed prompts")
    ap.add_argument("--candidate", required=True, help="benchmark.json for the trimmed prompts")
    ap.add_argument("--configuration", default="with_skill",
                    choices=["with_skill", "without_skill"],
                    help="Which leg to compare (default: with_skill — the one a trim moves)")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()

    base_b, cand_b = load(Path(args.baseline)), load(Path(args.candidate))
    base, cand = index_runs(base_b, args.configuration), index_runs(cand_b, args.configuration)

    if not base or not cand:
        print(f"ERROR: no '{args.configuration}' runs in "
              f"{'baseline' if not base else 'candidate'} — nothing to compare.", file=sys.stderr)
        return 2

    confirmed, unstable, improved = [], [], []
    per_agent: dict[str, dict] = defaultdict(lambda: {"b_pass": 0, "b_tot": 0,
                                                       "c_pass": 0, "c_tot": 0})
    only_in_one = sorted({k[:3] for k in set(base) ^ set(cand)})

    for key in sorted(set(base) & set(cand), key=lambda k: (str(k[0]), k[1] or 0)):
        _, eval_id, eval_name, agent = key
        b, c = base[key], cand[key]
        b_rate, c_rate = sum(b) / len(b), sum(c) / len(c)
        a = agent or "(skill)"
        per_agent[a]["b_pass"] += sum(b); per_agent[a]["b_tot"] += len(b)
        per_agent[a]["c_pass"] += sum(c); per_agent[a]["c_tot"] += len(c)

        row = {"eval_id": eval_id, "eval_name": eval_name, "agent": a,
               "baseline": f"{sum(b)}/{len(b)}", "candidate": f"{sum(c)}/{len(c)}"}
        if b_rate == 1.0 and c_rate == 0.0:
            confirmed.append(row)
        elif c_rate < b_rate:
            unstable.append(row)
        elif c_rate > b_rate:
            improved.append(row)

    b_subj, c_subj = subjects_of(base_b), subjects_of(cand_b)
    size_rows = []
    for name in sorted(set(b_subj) | set(c_subj)):
        bc = b_subj.get(name, {}).get("chars", 0)
        cc = c_subj.get(name, {}).get("chars", 0)
        same_hash = (b_subj.get(name, {}).get("sha256")
                     == c_subj.get(name, {}).get("sha256") is not None)
        size_rows.append({"agent": name, "baseline_chars": bc, "candidate_chars": cc,
                          "delta_chars": cc - bc,
                          "pct": round(100.0 * (cc - bc) / bc, 1) if bc else None,
                          "unchanged": same_hash})

    report = {
        "baseline_label": base_b.get("metadata", {}).get("label"),
        "candidate_label": cand_b.get("metadata", {}).get("label"),
        "configuration": args.configuration,
        "cases_compared": len(set(base) & set(cand)),
        "cases_only_in_one_run": [list(x) for x in only_in_one],
        "confirmed_regressions": confirmed,
        "unstable_flips": unstable,
        "improvements": improved,
        "per_agent": {a: {"baseline": f"{v['b_pass']}/{v['b_tot']}",
                          "candidate": f"{v['c_pass']}/{v['c_tot']}"}
                      for a, v in sorted(per_agent.items())},
        "prompt_size": size_rows,
        "verdict": "REGRESSION" if confirmed else ("REVIEW" if unstable else "CLEAN"),
    }

    if args.json:
        print(json.dumps(report, indent=2))
        return 1 if confirmed else 0

    bl = report["baseline_label"] or "(unlabeled)"
    cl = report["candidate_label"] or "(unlabeled)"
    print(f"Baseline : {bl}  ({args.baseline})")
    print(f"Candidate: {cl}  ({args.candidate})")
    print(f"Configuration: {args.configuration}   cases compared: {report['cases_compared']}\n")

    if size_rows:
        print("Prompt size")
        print(f"  {'agent':<12} {'base':>9} {'cand':>9} {'delta':>10} {'pct':>8}")
        for r in size_rows:
            note = "  (identical text)" if r["unchanged"] else ""
            pct = f"{r['pct']:+.1f}%" if r["pct"] is not None else "n/a"
            print(f"  {r['agent']:<12} {r['baseline_chars']:>9,} {r['candidate_chars']:>9,} "
                  f"{r['delta_chars']:>+10,} {pct:>8}{note}")
        bt = sum(r["baseline_chars"] for r in size_rows)
        ct = sum(r["candidate_chars"] for r in size_rows)
        print(f"  {'TOTAL':<12} {bt:>9,} {ct:>9,} {ct - bt:>+10,} "
              f"{(100.0 * (ct - bt) / bt if bt else 0):>+7.1f}%\n")

    print("Pass rate by agent")
    for a, v in report["per_agent"].items():
        flag = ""
        bp, bt_ = (int(x) for x in v["baseline"].split("/"))
        cp, ct_ = (int(x) for x in v["candidate"].split("/"))
        if bt_ and ct_ and (cp / ct_) < (bp / bt_):
            flag = "   <-- down"
        print(f"  {a:<12} baseline {v['baseline']:>7}   candidate {v['candidate']:>7}{flag}")
    print()

    if confirmed:
        print(f"CONFIRMED REGRESSIONS ({len(confirmed)}) — passed every baseline run, "
              f"failed every candidate run:")
        for r in confirmed:
            print(f"  [{r['agent']}] eval {r['eval_id']}: {r['eval_name']}"
                  f"  {r['baseline']} -> {r['candidate']}")
        print()
    if unstable:
        print(f"UNSTABLE ({len(unstable)}) — flipped, but not consistently. At --runs 1 every "
              f"flip lands here;\nre-run these with --runs 3 to tell a regression from variance:")
        for r in unstable:
            print(f"  [{r['agent']}] eval {r['eval_id']}: {r['eval_name']}"
                  f"  {r['baseline']} -> {r['candidate']}")
        print()
    if improved:
        print(f"IMPROVED ({len(improved)}):")
        for r in improved:
            print(f"  [{r['agent']}] eval {r['eval_id']}: {r['eval_name']}"
                  f"  {r['baseline']} -> {r['candidate']}")
        print()
    if only_in_one:
        print(f"NOT COMPARED ({len(only_in_one)}) — present in only one run "
              f"(a --eval-id mismatch, or a case that errored):")
        for skill, eid, name in only_in_one:
            print(f"  {skill} eval {eid}: {name}")
        print()

    print(f"VERDICT: {report['verdict']}")
    if report["verdict"] == "REGRESSION":
        print("  The trim broke behavior the committed prompt held. Restore what was cut.")
    elif report["verdict"] == "REVIEW":
        print("  No confirmed regression, but flips need more samples before you trust the trim.")
    else:
        print("  No case that passed at baseline fails on the candidate.")
    return 1 if confirmed else 0


if __name__ == "__main__":
    sys.exit(main())
