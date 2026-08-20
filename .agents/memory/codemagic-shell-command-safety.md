---
name: Codemagic shell command safety
description: Reliable command execution patterns for the Chip Forge Codemagic pipeline.
---

Do not pipe output from `pnpm exec` into a JSON parser in Codemagic's workspace build scripts. Run project-local binaries directly and set `-euo pipefail` before a multi-command script.

**Why:** pnpm can write a workspace scope status line to standard output before the underlying command's JSON. The malformed JSON may fail a validation command, and without fail-fast shell behavior later commands can run from the wrong directory and report misleading missing-Podfile errors.

**How to apply:** After changing into the mobile app directory, invoke its `node_modules/.bin` executable for machine-readable output. Use paths relative to the current directory or change directory only once; do not repeat the app path after entering it.