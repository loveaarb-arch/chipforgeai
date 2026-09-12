---
name: Expo old-architecture isolation
description: Compatibility rule for testing Expo SDK 54 iOS startup failures without the New Architecture.
---

When isolating an iOS startup crash by disabling the New Architecture, do not leave Reanimated 4 and Worklets installed. Reanimated 4 requires the New Architecture. Use a compatible Reanimated 3 release and remove the separate Worklets package as one coherent change.

**Why:** Toggling only the architecture creates a known-incompatible animation stack, so a resulting crash would not distinguish the original problem from the incompatibility introduced by the test.

**How to apply:** Treat the architecture flag, Reanimated major version, Worklets dependency, lockfile, and Expo dependency-check exception as one atomic compatibility set. Confirm the generated native properties before building.