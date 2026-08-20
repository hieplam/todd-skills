---
target: c3-301
scope: block
base: c3-301#n1606@v1:sha256:85de5dacd5936a7ce3cc9d96efc6bfb8eadc0be9976152fa00d2259c3b2ff3f4
---
| runs/<ts>/**/benchmark.json, grading.json, metrics.json, transcript.md | OUT | 1-based run-<N> dirs under an arm segment (<skill_name>/eval-<id>-<name>/<arm>/<configuration>/run-<N>/) so repeats AND arms never overwrite each other's evidence; metrics come from claude's own result events | filesystem | scripts/evals/README.md |
