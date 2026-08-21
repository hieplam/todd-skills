---
target: c3-201
scope: insert
base: c3-201#n1219@v1:sha256:37f1b04c96dfdcbc438aae8dd656c191ef5ea37c7e9f0d062a75f8cbbe5e1182
---
| plugins/explaining/skills/explaining/scripts/{validate-mermaid.ts,render-illustration.ts} | This component's Contract row skills/explaining/SKILL.md (Rule 4's How paragraph: build with render-illustration.ts, validate with validate-mermaid.ts) | Implementation details; validate-mermaid.ts's exit codes (0 valid, 1 invalid, 2 could-not-validate) and render-illustration.ts's class="mermaid" output contract must hold | bun test in plugins/explaining/skills/explaining/scripts; runtime dependency (bun + mermaid/jsdom) installed on demand via bun install, node_modules/ gitignored |
