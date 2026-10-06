import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chooseSimulatorTargets, parseLaunchPid, pidIsAlive } from "./lib/ios-startup-utils.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(process.env.CM_BUILD_DIR || root, "startup-check");
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function command(executable, args, options = {}) {
  return new Promise((resolve, reject) => {
    const log = fs.createWriteStream(path.join(output, options.log || "commands.log"), { flags: "a" });
    log.write(`\n> ${executable} ${args.join(" ")}\n`);
    const child = spawn(executable, args, {
      cwd: options.cwd || root,
      env: { ...process.env, ...options.env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "", stderr = "", timedOut = false, spawnError = null;
    const timer = setTimeout(() => { timedOut = true; child.kill("SIGKILL"); }, options.timeout || 120_000);
    child.stdout.on("data", (data) => { log.write(data); if (options.capture) stdout += data; });
    child.stderr.on("data", (data) => { log.write(data); if (options.capture) stderr += data; });
    child.on("error", (error) => { spawnError = error; });
    child.on("close", (code) => {
      clearTimeout(timer);
      log.end(() => {
        const error = spawnError || (timedOut ? new Error(`${executable} timed out`) :
          code !== 0 ? new Error(`${executable} exited with ${code}; see ${options.log || "commands.log"}`) : null);
        if (error && !options.allowFailure) reject(error);
        else resolve({ code, stdout, stderr, error: error?.message });
      });
    });
  });
}

async function buildApp() {
  const ios = path.join(root, "artifacts/chipforge/ios");
  const entries = fs.readdirSync(ios, { withFileTypes: true }).filter((e) => e.isDirectory());
  const workspace = entries.find((e) => e.name.endsWith(".xcworkspace"));
  const projects = entries.filter((e) => e.name.endsWith(".xcodeproj"));
  if (!workspace || projects.length !== 1) throw new Error("Expected one generated app project and an iOS workspace.");
  const scheme = projects[0].name.slice(0, -".xcodeproj".length);
  const listed = await command("xcodebuild", ["-list", "-workspace", workspace.name, "-json"], { cwd: ios, capture: true });
  if (!JSON.parse(listed.stdout).workspace?.schemes?.includes(scheme)) throw new Error(`App scheme ${scheme} was not found.`);
  const rn = fs.realpathSync(path.join(root, "artifacts/chipforge/node_modules/react-native"));
  console.log(`Building an unsigned Release simulator app: ${scheme}`);
  await command("xcodebuild", [
    "build", "-workspace", workspace.name, "-scheme", scheme,
    "-configuration", "Release", "-sdk", "iphonesimulator",
    "-destination", "generic/platform=iOS Simulator", "-derivedDataPath", path.join(output, "derived-data"),
    "CODE_SIGN_IDENTITY=", "CODE_SIGNING_REQUIRED=NO", "CODE_SIGNING_ALLOWED=NO",
    `REACT_NATIVE_PATH=${rn}`, "IPHONEOS_DEPLOYMENT_TARGET=17.0",
  ], {
    cwd: ios, log: "simulator-build.log", timeout: 45 * 60_000,
    env: { NODE_ENV: "production", RCT_NO_LAUNCH_PACKAGER: "1", SOURCEMAP_FILE: path.join(output, "simulator-bundle.jsbundle.map") },
  });
  const products = path.join(output, "derived-data/Build/Products/Release-iphonesimulator");
  const apps = fs.readdirSync(products).filter((name) => name.endsWith(".app"));
  const appName = apps.includes(`${scheme}.app`) ? `${scheme}.app` : apps.length === 1 ? apps[0] : null;
  if (!appName) throw new Error("Could not select the generated simulator app.");
  const app = path.join(products, appName);
  const plist = path.join(app, "Info.plist");
  const id = await command("/usr/libexec/PlistBuddy", ["-c", "Print :CFBundleIdentifier", plist], { capture: true });
  const executable = await command("/usr/libexec/PlistBuddy", ["-c", "Print :CFBundleExecutable", plist], { capture: true });
  const bundleId = id.stdout.trim();
  const expectedId = JSON.parse(fs.readFileSync(path.join(root, "artifacts/chipforge/app.json"), "utf8")).expo.ios.bundleIdentifier;
  if (bundleId !== expectedId) throw new Error("Simulator app bundle identifier does not match app.json.");
  return { app, bundleId, executable: executable.stdout.trim() };
}

export function attach(executable, args, destination) {
  const log = fs.createWriteStream(destination);
  const child = spawn(executable, args, { stdio: ["ignore", "pipe", "pipe"] });
  const state = { child, text: "", closed: false, code: null, error: null };
  const record = (data) => { log.write(data); state.text = (state.text + data.toString()).slice(-65_536); };
  child.stdout.on("data", record);
  child.stderr.on("data", record);
  child.on("error", (error) => { state.error = error.message; });
  state.finished = new Promise((resolve) => child.on("close", (code) => {
    state.closed = true; state.code = code;
    log.end(resolve);
  }));
  return state;
}

export async function stopAttachment(attachment) {
  if (!attachment) return;
  if (!attachment.closed) attachment.child.kill("SIGTERM");
  const force = setTimeout(() => { if (!attachment.closed) attachment.child.kill("SIGKILL"); }, 2000);
  await attachment.finished;
  clearTimeout(force);
}

function collectCrashReports(deviceId, executable, started, destination) {
  const directories = [
    path.join(os.homedir(), "Library/Logs/DiagnosticReports"),
    path.join(os.homedir(), `Library/Developer/CoreSimulator/Devices/${deviceId}/data/Library/Logs/CrashReporter`),
  ];
  fs.mkdirSync(destination, { recursive: true });
  for (const [index, directory] of directories.entries()) {
    if (!fs.existsSync(directory)) continue;
    for (const name of fs.readdirSync(directory)) {
      if (!name.startsWith(executable) || !/\.(ips|crash)$/.test(name)) continue;
      const source = path.join(directory, name);
      if (fs.statSync(source).mtimeMs >= started - 1000) {
        fs.copyFileSync(source, path.join(destination, `${index}-${name}`));
      }
    }
  }
}

async function checkDevice(target, appInfo) {
  const folder = path.join(output, target.family.toLowerCase());
  fs.mkdirSync(folder, { recursive: true });
  const result = { device: target.family, runtime: target.runtimeName, status: "failed" };
  let udid, logger, launcher;
  const started = Date.now();
  try {
    console.log(`Checking ${target.family} on ${target.runtimeName}...`);
    const created = await command("xcrun", ["simctl", "create", `ChipForge-Startup-${target.family}`, target.type, target.runtime], { capture: true });
    udid = created.stdout.trim();
    if (!/^[0-9a-f-]{36}$/i.test(udid)) throw new Error("simctl did not return a valid device identifier.");
    await command("xcrun", ["simctl", "boot", udid]);
    await command("xcrun", ["simctl", "bootstatus", udid, "-b"], { timeout: 5 * 60_000 });
    await command("xcrun", ["simctl", "install", udid, appInfo.app]);
    const predicate = `process == "${appInfo.executable}" OR eventMessage CONTAINS[c] "${appInfo.executable}"`;
    logger = attach("xcrun", ["simctl", "spawn", udid, "log", "stream", "--level", "debug", "--style", "compact", "--predicate", predicate], path.join(folder, "native-console.log"));
    await pause(1000);
    if (logger.closed) throw new Error("Native console capture failed; see native-console.log.");
    launcher = attach("xcrun", ["simctl", "launch", "--terminate-running-process", "--console", udid, appInfo.bundleId], path.join(folder, "launch-console.log"));
    const deadline = Date.now() + 30_000;
    while (!parseLaunchPid(launcher.text, appInfo.bundleId)) {
      if (launcher.closed) throw new Error(`App launch exited before returning a PID (${launcher.code}); see launch-console.log.`);
      if (Date.now() > deadline) throw new Error("Could not verify the launched app PID; see launch-console.log.");
      await pause(200);
    }
    const pid = parseLaunchPid(launcher.text, appInfo.bundleId);
    result.pid = pid;
    for (let second = 1; second <= 30; second++) {
      await pause(1000);
      if (launcher.closed || !pidIsAlive(pid)) throw new Error(`App exited within ${second} seconds of launch; see launch-console.log and native-console.log.`);
      if (logger.closed) throw new Error("Native console capture stopped unexpectedly.");
      if (second === 5 || second === 30) {
        await command("xcrun", ["simctl", "io", udid, "screenshot", path.join(folder, `screen-${second}s.png`)]);
      }
    }
    result.status = "survived_30_seconds";
    result.note = "Process remained alive. Review screenshots for sign-in readiness; this is not a physical-device or authentication test.";
    console.log(`${target.family}: stayed alive for 30 seconds. Screenshots saved.`);
  } catch (error) {
    result.error = error.message;
    console.error(`${target.family}: ${error.message}`);
    if (udid) await command("xcrun", ["simctl", "io", udid, "screenshot", path.join(folder, "screen-at-failure.png")], { allowFailure: true });
  } finally {
    if (udid) {
      await pause(3000); // Give Apple's crash reporter time to finish writing.
      const cleanups = [
        () => stopAttachment(launcher),
        () => stopAttachment(logger),
        () => collectCrashReports(udid, appInfo.executable, started, path.join(folder, "crash-reports")),
        () => command("xcrun", ["simctl", "shutdown", udid], { allowFailure: true }),
        () => command("xcrun", ["simctl", "delete", udid], { allowFailure: true }),
      ];
      for (const cleanup of cleanups) {
        try { await cleanup(); }
        catch (error) {
          (result.cleanupWarnings ??= []).push(error.message);
          console.warn(`Cleanup warning: ${error.message}`);
        }
      }
    }
    fs.writeFileSync(path.join(folder, "result.json"), `${JSON.stringify(result, null, 2)}\n`);
  }
  return result;
}

async function main() {
  fs.mkdirSync(output, { recursive: true });
  if (process.platform !== "darwin") throw new Error("This check must run on Codemagic's Mac mini M2, not the Linux workspace.");
  // Verify existing runtimes BEFORE an expensive simulator build. No downloads.
  const inventory = await command("xcrun", ["simctl", "list", "--json"], { capture: true });
  const targets = chooseSimulatorTargets(JSON.parse(inventory.stdout));
  const appInfo = await buildApp();
  const results = [];
  for (const target of targets) results.push(await checkDevice(target, appInfo));
  fs.writeFileSync(path.join(output, "summary.json"), `${JSON.stringify({
    scope: "Unsigned simulator Release build; no upload to Apple",
    diagnosticAlerts: "Disabled only in this test workflow to expose original fatal errors",
    results,
  }, null, 2)}\n`);
  if (results.some((result) => result.status !== "survived_30_seconds")) {
    throw new Error("Startup check failed. Download the launch/native console logs and crash reports from startup-check artifacts.");
  }
  console.log("Both processes survived. Review screenshots; the TestFlight/device crash is not proven fixed.");
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => {
    fs.mkdirSync(output, { recursive: true });
    fs.writeFileSync(path.join(output, "failure.txt"), `${error.message}\n`);
    console.error(error.message);
    process.exitCode = 1;
  });
}
