---
id: debt
type: canvas
status:
    - open
    - closed
description: Tech-debt blacklist entry — existing violations of an anti-rule, counted by a mechanical check, burning down to zero.
---

domain: governance
sections:
    - name: Meter
      content_type: table
      required: true
      purpose: The machine-read row — identity check, paired anti-rule, origin gap, write-once baseline
      columns:
        - name: Check
          type: text
        - name: Anti Rule
          type: text
        - name: Origin Gap
          type: text
        - name: Baseline
          type: text
    - name: Description
      content_type: text
      required: true
      purpose: Tracker's description plus one quoted instance — thin by design
      free: true
reject_if:
    - Check is not a single grep invocation or contains shell metacharacters
    - Baseline is not the executed hit count of Check at ruling time
workorder: ""
