---
name: Expo old-architecture isolation
description: Compatibility rule for testing Expo SDK 54 iOS startup failures without the New Architecture.
---

When isolating an iOS startup crash by disabling the New Architecture, do not leave Reanimated 4 and Worklets installed. Reanimated 4 requires the New Architecture. Use a compatible Reanimated 3 release and remove the separate Worklets package as one coherent change.

**Why:** Toggling only the architecture creates a known-incompatible animation stack, so a resulting crash would not distinguish the original problem from the incompatibility introduced by the test.

**How to apply:** Treat the architecture flag, Reanimated major version, Worklets dependency, lockfile, and Expo dependency-check exception as one atomic compatibility set. Confirm the generated native properties before building.

Keep the main app compatible with the Expo SDK's prebuilt preview runtime. Old-architecture isolation belongs in a separate custom native diagnostic build, not the shared Expo Go/iOS preview configuration.

**Why:** A prebuilt preview already has its native animation modules installed. Changing the app's architecture flag cannot change that binary, and an old Reanimated JavaScript version can fail during gesture-handler imports before the root layout mounts. The resulting missing-Clerk-provider error may be secondary to the root import failure.

**How to apply:** Compare animation packages with the SDK's bundled native-module versions when diagnosing preview startup. Restore the SDK-supported architecture, Reanimated, and Worklets together for the main preview, and investigate the first root import error before changing Clerk configuration.

Do not treat a passing dependency check as proof of compatibility when a native package is deliberately excluded from validation.

**Why:** The validator and doctor can pass while explicitly skipping the mismatched animation package.

**How to apply:** Review dependency-check exclusions and independently verify excluded native modules against the runtime they are intended to run in.