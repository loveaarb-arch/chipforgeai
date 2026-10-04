---
name: Clerk sign-up CAPTCHA blocks Playwright testing subagents
description: Why an automated testing subagent gets stuck on Clerk sign-up and how to work around it when verifying auth-gated flows.
---

Clerk's bot-protection widget (rendered via `nativeID="clerk-captcha"` in the
custom sign-up flow) reliably triggers a Cloudflare "verify you are human"
challenge when a Playwright-driven testing subagent submits the sign-up form.
This happens even with valid, unique test credentials — it's Clerk detecting
headless/automated browser fingerprints, not an app bug.

**Why:** the testing subagent's browser looks like a bot to Clerk's
telemetry, so the CAPTCHA gate blocks the flow before an email verification
code is ever needed. There is no way to solve the CAPTCHA or retrieve a real
verification code from within the sandboxed testing environment.

**How to apply:** use the programmatic Clerk sign-in described in the testing
skill with a generated temporary identity instead of fresh UI sign-up.
If that helper is unavailable, seed/pre-verify a test user directly and test
existing-user sign-in rather than trying to solve the CAPTCHA.

Programmatic Clerk test sessions can be scoped to the base preview host,
not the separate Expo subdomain.

**Why:** the testing helper established a session on the base preview host,
while visiting the Expo subdomain left the app signed out. Visiting the same
Expo web app on its base preview host successfully reused the test session.

**How to apply:** verify where the mobile artifact is mounted and whether its
web app is available on the base preview host. If the helper session is
scoped there, run signed-in browser tests on that host rather than retrying
authentication on the Expo subdomain.
