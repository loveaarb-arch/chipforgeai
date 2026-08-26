---
name: Key-like env var values are always masked from the agent
description: Even non-secret env vars are masked from the agent if the name looks like a key/token, blocking any plan to read a value back and embed it in a file.
---

Requesting a value via `requestEnvVars` (non-secret, "env" category) does not make it readable by the agent if the variable name matches a sensitive-looking pattern (e.g. contains `KEY`, `TOKEN`, `SECRET`). `viewEnvVars` returns bullets (`••••••••`) for it, and — surprisingly — so does a raw shell `echo "$VAR"` / `${#VAR}` in ShellExec: the platform substitutes a masked placeholder into the process environment itself, not just in the display layer.

**Why:** Attempted to have the user save a Clerk/RevenueCat publishable key as a plain env var so the agent could read it back and hardcode it into a committed `codemagic.yaml`, reasoning that publishable keys are meant to be public. The value was masked at every access point, including direct shell env expansion, so the plan was infeasible regardless of the "secret vs env" category.

**How to apply:** Never plan a workflow around the agent reading back and re-emitting the plaintext of a variable whose name looks like a credential — this fails even when the value is genuinely non-sensitive (a publishable/public key) and was explicitly saved as non-secret. Only the user can copy such values between systems (e.g. from Replit into a third-party CI's own variable UI). Ask the user to enter the value directly at the destination instead.
