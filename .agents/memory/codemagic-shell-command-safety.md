---
name: Codemagic shell command safety
description: Reliable command execution patterns for the Chip Forge Codemagic pipeline.
---

Do not pipe output from `pnpm exec` into a JSON parser in Codemagic's workspace build scripts. Run project-local binaries directly and set `-euo pipefail` before a multi-command script. With `pipefail`, also avoid piping a producer into `grep -q`: an early match can close the pipe and make the producer exit with SIGPIPE status 141 even though validation succeeded.

**Why:** pnpm can write a workspace scope status line to standard output before the underlying command's JSON. The malformed JSON may fail a validation command, and without fail-fast shell behavior later commands can run from the wrong directory and report misleading missing-Podfile errors.

**How to apply:** After changing into the mobile app directory, invoke its `node_modules/.bin` executable for machine-readable output. Use paths relative to the current directory or change directory only once; do not repeat the app path after entering it. Capture short command output in a variable and validate it with `case` rather than a `grep -q` pipeline.

Validate the native embedding command separately from a normal Expo export before treating release bundling as verified.

**Why:** A standalone export can pass while Xcode's embedding step fails on preset resolution or a different resolved entrypoint in a pnpm workspace. A build log with a bundle failure is not evidence of the cause of an installed app's launch crash.

**How to apply:** Exercise the archive's embedding path using the app's resolved entrypoint and retain symbols plus the source map from the actual archive. Do not use a separate preflight bundle's source map to symbolicate a different archived bundle.