---
target: rule-marketplace-registration
scope: block
base: rule-marketplace-registration#n1227@v1:sha256:29c34803081707219defb872dd4c1218280ae3f6baaa4698cb4b4f446a41fdc6
---
```json
    {
      "name": "verify-shipped",                          // REQUIRED — equals directory basename
      "source": "./plugins/verify-shipped",              // REQUIRED — ./plugins/<name>
      "description": "Mechanically verify the tribe's Definition of Done: PR merged, master in sync with origin, worktree removed."  // REQUIRED — non-empty
    }
```
