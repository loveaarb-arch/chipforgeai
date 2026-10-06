# Chip Forge SI Startup Check

This is a manual Codemagic workflow, **Chip Forge SI — Startup Check (no upload)**.
It uses `mac_mini_m2`, with a maximum run duration of 60 minutes. It has no automatic
triggers, signing integration, TestFlight upload, or paid browser-preview service.

It consumes Codemagic build minutes. Check the current personal-account free M2
balance before running it; do not enable a subscription to run this check.
The workflow cannot inspect your account's billing status or guarantee free usage
after your allowance is exhausted.

## What it checks

- Reuses the release pipeline's pinned dependencies, Xcode, Expo prebuild, and
  iOS 17 CocoaPods configuration.
- Requires an already installed iOS 17+ simulator runtime; never downloads one.
- Builds an unsigned **Release** app for the simulator, without Metro.
- Launches it on both iPhone and iPad simulators and monitors each app process
  for 30 seconds.
- Saves screenshots at 5 and 30 seconds, native/stdout logs, recent crash reports,
  and a source map from the actual simulator build.

JavaScript diagnostic interception is disabled **only in this simulator workflow**
so fatal errors are not hidden behind an alert. The signed release workflow's
diagnostic setting remains unchanged.

## Reading a run

Start this workflow on `main`, not the normal iOS Native Build workflow.
Afterward inspect the build's artifacts:

- `summary.json` and the per-device `result.json`: process-level results.
- `launch-console.log`: app stdout/stderr, including exception messages.
- `native-console.log`: the device's native launch logs.
- `screen-5s.png`, `screen-30s.png`, or `screen-at-failure.png`: visible state.
- `crash-reports/*.ips` or `*.crash`, when Apple's crash reporter produced them.
- `simulator-build.log` or `failure.txt` if setup/build failed.

Both devices are checked even when one launch fails. A surviving process does
**not** establish that sign-in works or that the TestFlight crash is fixed.
Simulator binaries and source maps are not interchangeable with a signed
device build. Review the screenshots, then verify the actual installed app
before submitting to Apple.

Local checks: `node --test scripts/ios-startup-check.test.mjs`.
The native check itself requires macOS/Xcode and must not be run in Replit's
Linux workspace.
