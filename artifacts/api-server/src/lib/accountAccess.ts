import { createHash } from "node:crypto";

interface AccountEmail {
  emailAddress: string;
  verification: { status: string } | null;
}

// Only identity-provider-verified email addresses qualify. Never trust an
// address supplied in a request body, URL, or mobile configuration.
export function hasComplimentaryAccess(
  emailAddresses: readonly AccountEmail[],
  ownerEmailSha256: string | undefined,
): boolean {
  const expectedHash = ownerEmailSha256?.trim().toLowerCase();
  if (!expectedHash || !/^[a-f0-9]{64}$/.test(expectedHash)) return false;

  return emailAddresses.some(
    (email) =>
      email.verification?.status === "verified" &&
      createHash("sha256")
        .update(email.emailAddress.trim().toLowerCase())
        .digest("hex") === expectedHash,
  );
}