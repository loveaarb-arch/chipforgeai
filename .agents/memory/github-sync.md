---
name: GitHub synchronization
description: Authentication and history constraints when syncing verified Replit source to GitHub for Codemagic.
---

A saved Git remote credential may allow fetching while rejecting pushes even when the connected GitHub App remains usable.

**Why:** A sync attempt encountered a rejected Git push, but the managed GitHub connection could access the same repository successfully. Do not mistake a stale remote credential for a disconnected integration.

**How to apply:** Prefer the managed connection as a fallback without reading or replacing credentials. Git Data API synchronization must retain the current remote commit as parent, use a non-forced branch update, and verify the resulting Git tree matches the intended local snapshot.

Compare source and equivalent patches when GitHub and Replit histories diverge; different commit IDs do not necessarily mean different code.

**Why:** Previous API-created commits duplicated local patches under different IDs. Blind merging could restore obsolete animation settings even though the current source already includes the remote branding changes.

**How to apply:** Account for every remote-only change before joining histories. Never force-push or discard unique remote work just to make the branches match.