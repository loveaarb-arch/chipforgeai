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

**How to apply:** when planning e2e test coverage for an app with Clerk
email/password sign-up, don't route the happy-path test through a fresh
sign-up. Either (a) seed/pre-verify a test user directly (e.g. via Clerk's
backend API) and have the tester sign in with existing credentials instead of
signing up, or (b) scope automated testing to screens/flows that don't
require passing through sign-up, and rely on manual/visual verification
(screenshots) plus code review for the sign-up screen itself.
