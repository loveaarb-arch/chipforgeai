---
name: Native launch evidence
description: Limits of JavaScript diagnostics and native bridge crash stacks when diagnosing installed iOS launch failures.
---

A native TurboModule invocation abort does not, by itself, identify the offending library or prove that the original error was native rather than JavaScript.

**Why:** An installed-app crash report showed an exception rethrow on the native module queue without the original exception message. React Native also reports fatal JavaScript errors through native exception methods, so the reporting path is not the root cause.

**How to apply:** Obtain the original exception name/reason or native launch console output before replacing libraries or changing architecture. JavaScript diagnostic alerts cannot reliably intercept an abort on a separate native queue. Native frame symbols alone may still omit the original error message.

For the Startup Check, the user said: “Add it ONLY if it is free.”

**Why:** The user approved cloud simulator diagnostics only on that condition.

**How to apply:** Keep it manual and on the free-eligible M2 machine, without paid preview add-ons. Check the current free allowance before recommending a run; do not enable paid billing or initiate builds on the user's behalf.

Disable JavaScript error interception only in the isolated simulator check, not silently in the signed release workflow. Treat process survival as a limited check, not proof of sign-in readiness or a fixed TestFlight launch.

**Why:** Diagnostic alerts can leave a failed app process alive and make a process-only smoke test appear successful. Simulator binaries also differ from installed device binaries.

**How to apply:** Preserve console error output and screenshots; verify the installed app separately before any readiness claim.
