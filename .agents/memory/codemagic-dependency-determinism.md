---
name: Codemagic dependency determinism
description: Stable dependency installation rules for the Chip Forge native iOS pipeline.
---

Use the committed pnpm lockfile with a frozen install in Codemagic. Do not mutate the workspace override configuration or delete the lockfile before the native build.

**Why:** resolving dependencies afresh upgraded Expo packages beyond the repository’s tested versions. The resulting dependency graph failed during the production Metro/Babel bundle even though the locked graph completed the same release export locally.

Expo native modules must also stay on the version family expected by the installed Expo SDK. A production JavaScript export can succeed even when a mismatched native module later crashes the TestFlight binary at startup.

**How to apply:** Preserve the lockfile and run `pnpm install --frozen-lockfile --ignore-scripts`. Keep a small production Expo export preflight ahead of CocoaPods, and run Expo dependency validation before release builds.