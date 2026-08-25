---
name: Codemagic dependency determinism
description: Stable dependency installation rules for the Chip Forge native iOS pipeline.
---

Use the committed pnpm lockfile with a frozen install in Codemagic. Do not mutate the workspace override configuration or delete the lockfile before the native build.

**Why:** resolving dependencies afresh upgraded Expo packages beyond the repository’s tested versions. The resulting dependency graph failed during the production Metro/Babel bundle even though the locked graph completed the same release export locally.

**How to apply:** Preserve the lockfile and run `pnpm install --frozen-lockfile --ignore-scripts`. Keep a small production Expo export preflight ahead of CocoaPods so a JavaScript release-bundle regression fails early with its direct error.