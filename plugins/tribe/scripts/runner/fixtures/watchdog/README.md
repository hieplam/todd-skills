# Watchdog fixtures — provenance

`fixtures-mirror-reality` (plugins/tribe/rules): these are real bytes, not convenient shapes.

| File | Provenance |
| --- | --- |
| `quota-real-429.log` | Byte-for-byte copy of a REAL killed session log: campaign `gh-issues-2026-09`, run `2026-09-02T19-06-46-423Z-7bb7`, log `i106-blind-reader-review-79e1f20a-958c-4136-8adf-3407a60cc043.log`, captured 2026-09-02T23:27:43Z. Four lines: `system/init`, `rate_limit_event` with `status: "rejected"` and `resetsAt: 1788392400`, the synthetic-model assistant message, and `result` with `is_error: true`, `api_error_status: 429`. Nothing was stripped; `apiKeySource` in the init line reads `"none"`, so no credential is present. |
| `allowed-and-warning.log` | Real `rate_limit_event` lines from the 1.9 MB sibling log of the same run, carrying `status: "allowed"` and `status: "allowed_warning"`. These are the shapes that must NOT be read as a quota death — that run emitted three `allowed`, two `allowed_warning`, then one `rejected`. |
| `overload-529.log` | DERIVED, not captured: the real `result` line above with `"api_error_status":429` replaced by `529`, and no `rate_limit_event`. No HTTP 529 session log exists on this machine (`grep -rl 'api_error_status":529' ~/.tribe` finds none); spec §8 records the shape from the live 2026-09-03 incident and instructs exactly this derivation. |
