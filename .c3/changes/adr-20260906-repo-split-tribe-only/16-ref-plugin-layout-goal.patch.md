---
target: ref-plugin-layout
scope: block
base: ref-plugin-layout#n1951@v1:sha256:7308f9cf6c7b854b298ec94062198be5540c62222a8b3466b2796854039585c5
---
Standardize the directory shape of every plugin so the installer, the marketplace manifest, and the eval harness can walk any plugin without per-plugin logic. The recurring need: 2 plugins, one install code path — and any plugin added later walks the same path without new code.
