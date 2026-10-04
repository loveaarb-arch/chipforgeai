---
name: Public app rename continuity
description: Why public branding changes should leave installed app identifiers unchanged
---

For Chip Forge SI branding changes, retain the existing mobile bundle/package identifiers and URL scheme unless a separate migration is explicitly requested.

**Why:** An existing TestFlight app must remain an update to the same installed app. A new identifier would create a separate app and disrupt its continuity, regardless of the new display name.

**How to apply:** Update customer-visible app names, splash/launcher display labels, and public copy independently of the bundle identifier. App Store Connect listing metadata and already-created marketing screenshots are separate from the build and may require their own updates.

Use “SI” rather than “AI” in customer-facing app and support-page copy. Do not rename underlying AI provider integrations, API identifiers, or technical model instructions merely to match public branding.

**Why:** The user explicitly requested that visible “AI” wording change to “SI”; the actual AI service and internal terminology have different operational meanings.

**How to apply:** Check new UI labels, error messages, exports, support copy, and app-generated greetings for the public wording, while leaving provider configuration and prompts functional.