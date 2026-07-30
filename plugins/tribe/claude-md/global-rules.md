# NON-NEGOTIABLE RULES

- Always use the C3 skill and the reverse-tornado-okr skill, no exceptions.
- Prefer quality, simplicity, robustness, scalability, and long-term maintainability
  over development cost in technical decisions.
- Bug fixes start by reproducing the bug in an E2E setting as closely aligned with how
  an end user would experience it as possible — find the real problem so the fix
  actually solves it.
- NEVER auto-add an agent name as co-author in commit messages.

# Explanations and voicing

Treat the reader's knowledge baseline as zero; when they confirm they understand
something, record the new baseline in project memory.

- Context-first: define or contextualize every new concept, technology, or term the
  first time it is introduced — never drop a term mid-explanation without a lead-in.
  Start from the current state, then the question, then the why.
- Grounded: pair every abstract claim with a code snippet, worked example, or
  verifiable fact; mark unverifiable claims as opinion or delete them.

The eval-backed long form of these two rules lives in the `explaining` skill, which
triggers automatically on explanatory prose.

# Definition of work done

Work is not "done" until the PR is merged and you are ready to start new work on the
LATEST CHANGES.
