import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRequire = createRequire(path.join(root, "artifacts/chipforge/package.json"));
const clerkRequire = createRequire(appRequire.resolve("@clerk/expo"));
const { parsePublishableKey } = clerkRequire("@clerk/shared/keys");

export function validateReleaseEnvironment(env) {
  const required = [
    "EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY",
    "EXPO_PUBLIC_REVENUECAT_IOS_API_KEY",
    "EXPO_PUBLIC_DOMAIN",
  ];
  const missing = required.filter((name) => !env[name]);
  if (missing.length) {
    throw new Error(`Missing required Codemagic release environment variables: ${missing.join(", ")}. Configure them in the chipforge_release group.`);
  }

  const key = env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
  let valid = false;
  // Use the installed Clerk SDK's own parser, not a prefix-only approximation.
  // Do not trim, substitute another environment's key, or log any value.
  try {
    valid = typeof key === "string" && key.trim() === key && Boolean(parsePublishableKey(key));
  } catch {
    // SDK errors can include input; replace them with a value-free diagnostic.
  }
  if (!valid) {
    throw new Error(
      "EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY is invalid in Codemagic's chipforge_release group. " +
      "Set the exact Clerk publishable key for the intended app environment, without quotes or whitespace. " +
      "Do not use a secret key, a variable-name placeholder, or masked display text. " +
      "Do not paste keys into chat. Native compilation was not started.",
    );
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    validateReleaseEnvironment(process.env);
    console.log("Required release environment variables are present; Clerk publishable-key format is valid.");
    console.log("Format validation does not establish that the key belongs to the intended Clerk environment.");
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
