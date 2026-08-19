---
name: Codemagic iOS target consistency
description: Native iOS deployment-target behavior for the Expo, Clerk, and CocoaPods build pipeline.
---

Set the Chip Forge native iOS target to 17.0 and enforce the same target on every generated CocoaPods build configuration in Codemagic.

**Why:** Clerk’s native iOS SDK requires iOS 17, but its Google Sign-In pod declares a lower target. CocoaPods preserves that pod-specific setting, which causes Swift compilation to reject ExpoModulesCore even when the Expo app target is higher.

**How to apply:** Keep the Expo app configuration and the Codemagic archive setting aligned at iOS 17. After `pod install`, update generated Pods project configuration targets and explicitly verify the Clerk Google Sign-In target before archiving. Do not rely on an `xcodebuild` command-line deployment target alone.