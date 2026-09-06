---
target: rule-marketplace-registration
scope: block
base: rule-marketplace-registration#n2015@v1:sha256:458830564c7ac131ef95420a16dfb572ec4fbd5c9a24cb1395d641667e5a5a16
---
Every plugin that exists in the tree is discoverable and installable: the marketplace manifest is the authoritative registry, and it must never drift from the `plugins/` directory listing — across both plugins today.
