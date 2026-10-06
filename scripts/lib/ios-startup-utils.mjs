// Pure helpers: these can be verified on Linux without running an Apple build.
export function chooseSimulatorTargets(inventory) {
  const version = (runtime) => runtime.version.split(".").map(Number);
  const runtimes = (inventory.runtimes ?? [])
    .filter((r) => r.isAvailable && r.identifier.includes(".iOS-") && version(r)[0] >= 17)
    .sort((a, b) => {
      const av = version(a), bv = version(b);
      for (let i = 0; i < Math.max(av.length, bv.length); i++) {
        const diff = (bv[i] ?? 0) - (av[i] ?? 0);
        if (diff) return diff;
      }
      return 0;
    });

  for (const runtime of runtimes) {
    const supported = runtime.supportedDeviceTypes;
    const types = supported?.length ? supported : (inventory.devicetypes ?? []);
    const targets = ["iPhone", "iPad"].map((family) => {
      const existing = (inventory.devices?.[runtime.identifier] ?? [])
        .find((device) => device.isAvailable && device.name.startsWith(family));
      const type = types.find((t) => t.identifier === existing?.deviceTypeIdentifier) ||
        [...types].reverse().find((t) => t.name.startsWith(family));
      return type ? { family, type: type.identifier, runtime: runtime.identifier, runtimeName: runtime.name } : null;
    });
    if (targets.every(Boolean)) return targets;
  }
  throw new Error("No available iOS 17+ simulator runtime supports both iPhone and iPad. No runtime download was attempted.");
}

export function parseLaunchPid(output, bundleId) {
  const escaped = bundleId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = output.match(new RegExp(`${escaped}:\\s*(\\d+)`));
  return match ? Number(match[1]) : null;
}

export function pidIsAlive(pid, signal = process.kill) {
  try {
    signal(pid, 0);
    return true;
  } catch (error) {
    if (error.code === "ESRCH") return false;
    if (error.code === "EPERM") return true;
    throw error;
  }
}
