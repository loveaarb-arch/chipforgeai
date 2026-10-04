---
name: Owner access scope
description: The creator's requested complimentary-access scope and privacy constraint.
---

Complimentary access is intended only for the creator's own verified app account. Do not broaden it to all customers or make it a device-wide exemption.

**Why:** The user explicitly requested "remove the paywall on mine only." Ordinary customers must retain the existing subscription requirement.

**How to apply:** Preserve account-specific access when changing authentication or subscriptions. Expanding the exemption requires an explicit new request.

Shared non-secret environment variables are persisted in the tracked `.replit` file, so they are not private storage for a raw personal account identifier.

**Why:** A server-only configuration value can still enter the GitHub repository when shared environment settings are synced.

**How to apply:** Before setting account-targeting configuration, keep raw personal identifiers out of tracked configuration. Do not save the creator's email in project memory.