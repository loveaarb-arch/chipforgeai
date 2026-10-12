import test from "node:test";
import assert from "node:assert/strict";
import { validateReleaseEnvironment } from "./validate-release-environment.mjs";

// Synthetic, offline fixtures only: these are not real account credentials.
const fakeKey = (type) => `pk_${type}_${Buffer.from("fixture.example.com$").toString("base64")}`;
const configured = {
  EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: fakeKey("test"),
  EXPO_PUBLIC_REVENUECAT_IOS_API_KEY: "synthetic-revenuecat-fixture",
  EXPO_PUBLIC_DOMAIN: "api.example.com",
};

test("accepts structurally valid synthetic development and production keys", () => {
  for (const type of ["test", "live"]) {
    assert.doesNotThrow(() => validateReleaseEnvironment({
      ...configured, EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: fakeKey(type),
    }));
  }
});

test("requires the same three existing release variables", () => {
  for (const name of Object.keys(configured)) {
    assert.throws(() => validateReleaseEnvironment({ ...configured, [name]: "" }), (error) => {
      assert.match(error.message, /Missing required/);
      assert.ok(error.message.includes(name));
      return true;
    });
  }
});

test("rejects masked values, placeholders, secret-key types and malformed payloads", () => {
  const invalid = [
    "••••••••", "$CLERK_PUBLISHABLE_KEY", "${CLERK_PUBLISHABLE_KEY}",
    "CLERK_PUBLISHABLE_KEY", "sk_test_synthetic_fixture",
    "pk_test_invalid", `pk_test_${Buffer.from("missing-terminator").toString("base64")}`,
    `"${fakeKey("test")}"`, ` ${fakeKey("test")}`, `${fakeKey("test")}\n`,
  ];
  for (const key of invalid) {
    assert.throws(() => validateReleaseEnvironment({
      ...configured, EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: key,
    }), (error) => {
      assert.match(error.message, /EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY is invalid/);
      // A bare variable name is intentionally mentioned in the diagnostic.
      if (key !== "CLERK_PUBLISHABLE_KEY") {
        assert.ok(!error.message.includes(key), "Failure output must not reveal the value");
      }
      return true;
    });
  }
});
