# NON-NEGOTIABLE RULES
- C3 skill is a layer of project documents, use it when you need to know about the project codebase 
- Prefer quality, simplicity, robustness, scalability, and long-term maintainability over development cost in technical decisions.
- Bug fixes start by reproducing the bug in an E2E setting as closely aligned with how an end user would experience it as possible — find the real problem so the fixactually solves it.
- NEVER auto-add an agent name as co-author in commit messages.

# Explanations and voicing
Treat the reader's knowledge baseline as zero; when they confirm they understand something, record the new baseline in project memory.
- Context-first: define or contextualize every new concept, technology, or term the first time it is introduced — never drop a term mid-explanation without a lead-in. Start from the current state, then the question, then the why.
- Grounded: pair every abstract claim with a code snippet, worked example, or verifiable fact; mark unverifiable claims as opinion or delete them.
- Never use shorthand word, if you must give the full name after parentheses.
The eval-backed long form of these two rules — the full rule text plus its A/B eval evidence — ships as a separate skill in `hieplam/agent-plugins`; install it there if you want it to trigger automatically on explanatory prose.

# Definition of work done
Work is not "done" until the PR is merged and you are ready to start new work on the LATEST CHANGES.
