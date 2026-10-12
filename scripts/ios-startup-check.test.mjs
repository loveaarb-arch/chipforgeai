import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chooseSimulatorTargets, parseLaunchPid, pidIsAlive } from "./lib/ios-startup-utils.mjs";

const types = [
  { name: "iPhone 16", identifier: "phone" },
  { name: "iPad Air", identifier: "tablet" },
];
const runtime = (version, isAvailable = true) => ({
  identifier: `com.apple.CoreSimulator.SimRuntime.iOS-${version.replaceAll(".", "-")}`,
  name: `iOS ${version}`, version, isAvailable,
});

test("selects both device families on the newest available iOS runtime", () => {
  const targets = chooseSimulatorTargets({
    runtimes: [runtime("18.5"), runtime("26.3"), runtime("27.0", false)],
    devicetypes: types,
  });
  assert.deepEqual(targets.map((t) => t.family), ["iPhone", "iPad"]);
  assert.ok(targets.every((t) => t.runtimeName === "iOS 26.3"));
});

test("orders multi-digit minor versions numerically", () => {
  const targets = chooseSimulatorTargets({ runtimes: [runtime("18.9"), runtime("18.10")], devicetypes: types });
  assert.equal(targets[0].runtimeName, "iOS 18.10");
});

test("respects runtime-supported device types, skipping incompatible runtimes", () => {
  const newer = { ...runtime("26.3"), supportedDeviceTypes: [types[0]] };
  const older = { ...runtime("18.5"), supportedDeviceTypes: types };
  assert.equal(chooseSimulatorTargets({ runtimes: [newer, older], devicetypes: types })[0].runtimeName, "iOS 18.5");
});

test("prefers a known runtime-compatible device when support metadata is absent", () => {
  const ios = runtime("26.3");
  const targets = chooseSimulatorTargets({
    runtimes: [ios],
    devicetypes: [
      { name: "iPhone 4s", identifier: "old-phone" },
      ...types,
      { name: "iPhone Future", identifier: "unknown-phone" },
    ],
    devices: { [ios.identifier]: [{ name: "iPhone 16", isAvailable: true, deviceTypeIdentifier: "phone" }] },
  });
  assert.equal(targets[0].type, "phone");
});

test("fails explicitly when both devices or iOS 17+ are unavailable", () => {
  assert.throws(() => chooseSimulatorTargets({ runtimes: [runtime("16.4")], devicetypes: types }), /No available/);
  assert.throws(() => chooseSimulatorTargets({ runtimes: [runtime("26.3")], devicetypes: [types[0]] }), /No available/);
});

test("extracts the launched PID without treating dots as regex wildcards", () => {
  assert.equal(parseLaunchPid("com.chipforgeai.app: 1234\n", "com.chipforgeai.app"), 1234);
  assert.equal(parseLaunchPid("comXchipforgeaiXapp: 1234", "com.chipforgeai.app"), null);
  assert.equal(parseLaunchPid("launch failed", "com.chipforgeai.app"), null);
  assert.equal(parseLaunchPid("com.chipforgeai.app: 1234\r\n", "com.chipforgeai.app"), 1234);
  assert.equal(parseLaunchPid("com.chipforgeai.app: 0", "com.chipforgeai.app"), null);
  assert.equal(parseLaunchPid("com.chipforgeai.app: 999999999999999999", "com.chipforgeai.app"), null);
  assert.equal(parseLaunchPid("other log: com.chipforgeai.app: 1234", "com.chipforgeai.app"), null);
});

test("checks process existence without terminating it", () => {
  assert.equal(pidIsAlive(process.pid), true);
  assert.equal(pidIsAlive(123, (pid, signal) => { assert.equal(pid, 123); assert.equal(signal, 0); }), true);
  assert.equal(pidIsAlive(123, () => { throw Object.assign(new Error(), { code: "ESRCH" }); }), false);
  assert.equal(pidIsAlive(123, () => { throw Object.assign(new Error(), { code: "EPERM" }); }), true);
  assert.throws(() => pidIsAlive(123, () => { throw new Error("unexpected"); }), /unexpected/);
});

test("command runner captures errors, timeouts and live console output", async (t) => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "chipforge-startup-test-"));
  const previous = process.env.CM_BUILD_DIR;
  process.env.CM_BUILD_DIR = temporary;
  const { command, attach, stopAttachment, launchSimulatorApp } = await import("./ios-startup-check.mjs");
  const logs = path.join(temporary, "startup-check");
  fs.mkdirSync(logs);
  try {
    const captured = await command(process.execPath, ["-e", "console.log('example stdout');console.error('example stderr')"], { capture: true });
    assert.match(captured.stdout, /example stdout/);
    assert.match(captured.stderr, /example stderr/);
    await assert.rejects(command(process.execPath, ["-e", "process.exit(7)"]), /exited with 7/);
    const failed = await command(process.execPath, ["-e", "process.exit(7)"], { allowFailure: true });
    assert.equal(failed.code, 7);
    await assert.rejects(command(process.execPath, ["-e", "setInterval(()=>{},1000)"], { timeout: 50 }), /timed out/);
    await assert.rejects(command(path.join(temporary, "missing-command"), []), /ENOENT/);

    const deviceFolder = path.join(logs, "iphone");
    fs.mkdirSync(deviceFolder);
    const device = "00000000-0000-4000-8000-000000000001";
    const bundle = "com.chipforgeai.app";
    await t.test("launch response is separate from app stdout/stderr and has no console attachment", async () => {
      const pid = await launchSimulatorApp(device, bundle, deviceFolder, async (executable, args, options) => {
        assert.equal(executable, "xcrun");
        assert.deepEqual(args.slice(0, 3), ["simctl", "launch", "--terminate-running-process"]);
        assert.deepEqual(args.slice(-2), [device, bundle]);
        assert.ok(!args.includes("--console"));
        const script = `
          const fs = require("node:fs"), args = process.argv.slice(1);
          fs.appendFileSync(args.find(a => a.startsWith("--stdout=")).slice(9), "fixture app stdout\\n");
          fs.appendFileSync(args.find(a => a.startsWith("--stderr=")).slice(9), "fixture app stderr\\n");
          console.log(args.at(-1) + ": " + process.pid);
        `;
        return command(process.execPath, ["-e", script, ...args], options);
      });
      assert.ok(Number.isSafeInteger(pid) && pid > 0);
      assert.equal(fs.readFileSync(path.join(deviceFolder, "app-stdout.log"), "utf8"), "fixture app stdout\n");
      assert.equal(fs.readFileSync(path.join(deviceFolder, "app-stderr.log"), "utf8"), "fixture app stderr\n");
      assert.match(fs.readFileSync(path.join(deviceFolder, "launch-console.log"), "utf8"), /com\.chipforgeai\.app: \d+/);
    });
    await t.test("empty launch metadata fails explicitly without claiming an app crash", async () => {
      await assert.rejects(launchSimulatorApp(device, bundle, deviceFolder,
        async () => ({ stdout: "", stderr: "" })), /not proof of an app crash/);
    });
    await t.test("failed launch command retains the actual error output", async () => {
      await assert.rejects(launchSimulatorApp(device, bundle, deviceFolder,
        async (_executable, _args, options) => command(process.execPath,
          ["-e", "console.error('fixture launch failure'); process.exit(9)"], options)), /exited with 9/);
      assert.match(fs.readFileSync(path.join(deviceFolder, "launch-console.log"), "utf8"), /fixture launch failure/);
    });

    const consolePath = path.join(logs, "console.log");
    const attached = attach(process.execPath, ["-e", "console.log('com.chipforgeai.app: '+process.pid);setInterval(()=>{},1000)"], consolePath);
    try {
      const deadline = Date.now() + 3000;
      while (!parseLaunchPid(attached.text, "com.chipforgeai.app")) {
        assert.ok(Date.now() < deadline, "Console never reported its PID");
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      assert.equal(pidIsAlive(parseLaunchPid(attached.text, "com.chipforgeai.app")), true);
    } finally {
      await stopAttachment(attached);
    }
    assert.equal(attached.closed, true);
    assert.match(fs.readFileSync(consolePath, "utf8"), /com\.chipforgeai\.app:/);
  } finally {
    if (previous === undefined) delete process.env.CM_BUILD_DIR;
    else process.env.CM_BUILD_DIR = previous;
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});
