# Campaign answers — runner-remote-fix

Rulings appended by the orchestrating session (Shaman authority) or the owner. The runner never
writes here.

## Standing rulings (Warchief, 2026-07-31 — carrying the Shaman's dispatch)

- **Merge is normal (regular, 2-parent).** This is a runner-code fix landing in `todd-skills`
  itself; there is no owner-only merge restriction here (unlike `cu2`). Merge with
  `gh pr merge --merge` once checks are green, per the campaign's `mergePolicy`.
- **Default behavior must not change.** The whole point of this card is that a campaign with no
  `--remote` flag behaves byte-identically to before. If a task or check seems to require
  changing default output/behavior, that's a misread — re-read the spec.
- **Scope is exactly the plan's 7 tasks.** The spec's §2 inventory (10 call sites) is the full,
  closed scope — do not go looking for an 11th hardcode "while you're in there"; if you find one
  genuinely new, escalate rather than silently widening scope.
- **The "planning field dropped" claim is refuted, not real.** Spec §3 documents this with a
  live repro. Do not attempt to "fix" `state.ts`'s serialization for this — Task 6 is a
  regression test proving the existing behavior is already correct, nothing more.
