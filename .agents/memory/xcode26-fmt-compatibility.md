---
name: Xcode 26 fmt compatibility
description: Build-machine compatibility issue between React Native 0.81 fmt and newer Xcode 26 compilers.
---

React Native 0.81's bundled fmt library can fail to compile under newer Xcode 26 releases with `consteval` and `basic_format_string` errors. Pin CI to a known-compatible Xcode rather than patching generated Pods or changing application code.

**Why:** CI providers may advance their unpinned default Xcode version automatically. The same source and lockfile can then begin failing inside the fmt pod before application code compiles.

**How to apply:** Pin the Xcode version in CI and verify it at the start of the workflow. If React Native is upgraded to a release carrying a compatible fmt version, reevaluate and remove the old pin.