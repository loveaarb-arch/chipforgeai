import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

/**
 * Encrypts chip project design payloads at rest (AES-256-GCM).
 *
 * The key is derived from SESSION_SECRET via SHA-256 rather than a
 * separately provisioned secret — SESSION_SECRET is already a private,
 * server-only value in this environment and is never sent to clients.
 */
function getEncryptionKey(): Buffer {
  const secret = process.env["SESSION_SECRET"];
  if (!secret) {
    throw new Error(
      "SESSION_SECRET environment variable is required to encrypt project data but was not provided.",
    );
  }
  return createHash("sha256").update(secret).digest();
}

const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

export function encryptJson(value: unknown): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(value), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString("base64");
}

export function decryptJson<T>(payload: string): T {
  const key = getEncryptionKey();
  const raw = Buffer.from(payload, "base64");
  const iv = raw.subarray(0, IV_LENGTH);
  const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = raw.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  return JSON.parse(plaintext.toString("utf8")) as T;
}
