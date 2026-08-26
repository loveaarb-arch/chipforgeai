---
name: Codemagic environment variable groups
description: Why variables added in the Codemagic UI never reach a codemagic.yaml workflow, and how to fix it.
---

Environment variables/secrets added in the Codemagic UI are always assigned to a **group** (Codemagic requires a group name when adding a variable). A `codemagic.yaml` workflow only receives a group's variables if it explicitly imports that group name under `environment: groups: [...]`. If the workflow doesn't list the group, the build machine sees the variables as unset even though they exist in the UI — with no warning from Codemagic itself.

**Why:** This caused a build to fail identically across multiple retries with "missing environment variable" even after the user added the variables in Codemagic, because the workflow never imported their group.

**How to apply:** When a Codemagic build can't see a variable that's visibly present in the app's Environment variables tab, check `codemagic.yaml` for `environment: groups:` first. Pick one group name, put it in both the YAML and the UI, and tell the user the exact group name to use.
