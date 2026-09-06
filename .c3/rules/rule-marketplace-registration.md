---
id: rule-marketplace-registration
c3-seal: 20400dcf7983a6bf3f0a73bd9e520e7e07125261ef3ae3c9935cd8d1f58c5706
title: marketplace-registration
type: rule
goal: 'Every plugin that exists in the tree is discoverable and installable: the marketplace manifest is the authoritative registry, and it must never drift from the `plugins/` directory listing — across both plugins today.'
---

## Goal

Every plugin that exists in the tree is discoverable and installable: the marketplace manifest is the authoritative registry, and it must never drift from the `plugins/` directory listing — across both plugins today.

## Rule

Every directory under `plugins/` has an entry in `.claude-plugin/marketplace.json` whose `name` equals the directory basename and whose `source` is `./plugins/<name>`.

## Golden Example

From `.claude-plugin/marketplace.json` (literal, the `verify-shipped` entry) and its matching `plugins/verify-shipped/.claude-plugin/plugin.json`:

```json
    {
      "name": "verify-shipped",                          // REQUIRED — equals directory basename
      "source": "./plugins/verify-shipped",              // REQUIRED — ./plugins/<name>
      "description": "Mechanically verify the tribe's Definition of Done: PR merged, squash strategy, master in sync with origin, worktree removed."  // REQUIRED — non-empty
    }
```

```json
{
  "name": "verify-shipped",                              // REQUIRED — matches marketplace entry
  "description": "…",
  "version": "1.0.0"                                     // REQUIRED — semver
}
```

## Not This

| Anti-Pattern | Correct | Why Wrong Here |
| --- | --- | --- |
| New plugins/foo/ with no marketplace entry | Add the entry in the same commit | Marketplace-based installs silently miss it; install.sh --list and the manifest disagree about what exists |
| Manifest name ≠ directory basename | Keep them identical | install.sh resolves plugins by directory name ($PLUGINS_DIR/$1); a mismatch makes the same plugin have two names depending on install path |

## Scope

Applies to `plugins/*/` and `.claude-plugin/marketplace.json`. Nested skill directories inside a plugin are not separately registered — the plugin is the unit of registration.
