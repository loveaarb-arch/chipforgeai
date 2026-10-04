import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { hasComplimentaryAccess } from "./accountAccess";

const ownerEmail = "owner@example.test";
const ownerEmailHash = createHash("sha256").update(ownerEmail).digest("hex");
const email = (emailAddress: string, status: string | null = "verified") => ({
  emailAddress,
  verification: status ? { status } : null,
});

test("grants complimentary access to the exact verified owner email", () => {
  assert.equal(hasComplimentaryAccess([email(ownerEmail)], ownerEmailHash), true);
  assert.equal(hasComplimentaryAccess([email("OWNER@example.test")], ` ${ownerEmailHash} `), true);
});

test("does not grant complimentary access to other or anonymous accounts", () => {
  assert.equal(hasComplimentaryAccess([email("customer@example.test")], ownerEmailHash), false);
  assert.equal(hasComplimentaryAccess([], ownerEmailHash), false);
  assert.equal(hasComplimentaryAccess([email(`${ownerEmail}.attacker.test`)], ownerEmailHash), false);
});

test("an unverified email cannot bypass the paywall", () => {
  assert.equal(hasComplimentaryAccess([email(ownerEmail, "unverified")], ownerEmailHash), false);
  assert.equal(hasComplimentaryAccess([email(ownerEmail, null)], ownerEmailHash), false);
});

test("an unset or blank configuration fails closed", () => {
  assert.equal(hasComplimentaryAccess([email(ownerEmail)], undefined), false);
  assert.equal(hasComplimentaryAccess([email(ownerEmail)], " "), false);
  assert.equal(hasComplimentaryAccess([email(ownerEmail)], "malformed"), false);
});