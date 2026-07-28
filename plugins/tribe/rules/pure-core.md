---
description: >-
  Pure core, impure edges — core logic stays deterministic and side-effect-free;
  every outside-world dependency enters through an abstraction injected from the
  edge. Applies to any language or tech stack; no paths glob because it governs
  all production source.
---

# Pure Core, Impure Edges (golden standard)

## Rule

Core logic — calculation, decision-making, flow control, data transformation — must be
**pure**: deterministic (the same inputs produce the same output on run 1 and run 100) and
free of side effects. Anything that touches the outside world is a **dependency**:
database calls, network/HTTP requests, filesystem reads and writes, the clock, random
numbers, environment variables, global mutable state. A dependency may enter core logic
**only through an abstraction the caller supplies** — an interface, a port, an injected
function, a seam. The core calls the abstraction; only the outermost edge of the program
(the composition root, runner, or handler) constructs the real dependency and wires it in.

The names differ per stack — interface + dependency injection (C#/Java), seam or injected
closure (TypeScript/JavaScript), trait object (Rust), protocol (Python/Swift) — but the
shape is identical everywhere: **core logic never constructs or reaches out for its
dependencies; it receives them.**

## Why

A method that only computes and controls flow gives the same answer 100 runs out of 100.
The moment it also calls a database or writes a file mid-computation, it inherits the
outside world's failure modes — a slow network, a permission-denied disk, a dropped
connection — and now fails 2 runs in 100 *with the same inputs*. That breaks determinism,
and everything downstream of determinism breaks with it: tests (they now need a live
world stood up), reasoning (behavior depends on hidden state), reuse (the logic cannot
run anywhere the dependency isn't available), and review (a reader cannot tell what the
code does from its inputs alone).

## Golden pattern (any language, pseudocode)

```
# CORE — pure: everything it needs arrives as arguments; nothing else happens.
decide_shipping(order, rates) -> label

# EDGE — impure, thin: fetches inputs, calls the core, persists the result.
ship_order(order_id, order_repo, rate_source):
    order = order_repo.get(order_id)       # dependency, via abstraction
    rates = rate_source.current()          # dependency, via abstraction
    label = decide_shipping(order, rates)  # pure core does ALL the deciding
    order_repo.save_label(order_id, label) # dependency, via abstraction

# COMPOSITION ROOT — the only place real dependencies are constructed.
main(): ship_order(id, DbOrderRepo(conn), HttpRateSource(client))
```

The orchestration-runner shape — a runner that owns every outside-world interaction while
the logic it drives stays pure — is this same pattern at program scale.

## Not this

- A calculation or decision method that opens its own database connection or HTTP client
  mid-computation.
- Flow control interleaved with file writes, so the branch logic cannot even run without
  a writable disk.
- Core code reading the clock, random source, environment, or a global directly instead
  of taking the value (or an abstraction over it) as an input.
- A unit test that needs a live network or database to exercise an if-branch — the test
  is telling you the core is impure.
- A "thin" adapter that grows business decisions (validation rules, branching on domain
  state) — effects belong at the edge, but decisions never do.

## Pragmatism — how to apply, and how reviewers grade it

100% purity is impossible; side effects are the program's purpose. The standard is
directional, not absolute: **for every piece of core or complex logic, ask "could this be
pure?" and push effects outward through an abstraction until it is.** Edge/adapter code —
the thin layer that actually performs I/O — is exempt from purity but must stay thin and
decision-free.

Reviewer severity guide:

- Side effects buried inside core/complex logic (I/O, clock, random, global state reached
  directly from computation or flow control), making behavior non-deterministic or
  untestable → **Blocker / Should-fix**.
- An adapter accumulating business decisions → **Should-fix**.
- Naming or mechanics of the abstraction (interface vs closure vs port) → **Optional**;
  any idiom that keeps the core pure satisfies this rule.
