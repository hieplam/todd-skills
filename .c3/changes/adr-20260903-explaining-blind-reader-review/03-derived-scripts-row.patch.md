---
target: c3-201
scope: block
base: c3-201#n1289@v1:sha256:cb943ec516d31e5fb4d4268d7145222392306d952278c728c8378227edb04aa4
---
plugins/explaining/skills/explaining/scripts/{validate-mermaid.ts,render-illustration.ts,check-review-log.ts} | This component's Contract row skills/explaining/SKILL.md (Rule 4's How paragraph: build with render-illustration.ts, validate with validate-mermaid.ts; Rule 5's log-check paragraph: check with check-review-log.ts) | Implementation details; validate-mermaid.ts's exit codes (0 valid, 1 invalid, 2 could-not-validate), render-illustration.ts's class="mermaid" output contract, and check-review-log.ts's exit codes (0 sound, 1 unsound, 2 could not run) must hold | bun test in plugins/explaining/skills/explaining/scripts; runtime dependency (bun + mermaid/jsdom) installed on demand via bun install, node_modules/ gitignored
