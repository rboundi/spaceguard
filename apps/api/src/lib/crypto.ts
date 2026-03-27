/**
 * Cryptographic utilities for sensitive data at rest.
 *
 * - AES-256-GCM encryption/decryption for webhook secrets, API keys displayed to users
 * - Hash function for API keys (stored hashed, only last 4 chars visible)
 */

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHash,
} from "node:crypto";

// ---------------------------------------------------------------------------
// Encryption key from environment
// ---------------------------------------------------------------------------

const ENCRYPTION_KEY_HEX = process.env.ENCRYPTION_KEY;

function getEncryptionKey(): Buffer {
  if (!ENCRYPTION_KEY_HEX || ENCRYPTION_KEY_HEX.length !== 64) {
    // In development, derive a key from a static passphrase.
    // In production, ENCRYPTION_KEY must be a 64-hex-char (32-byte) key.
    const devKey = createHash("sha256")
      .update("spaceguard-dev-encryption-key-change-in-production")
      .digest();
    return devKey;
  }
  return Buffer.from(ENCRYPTION_KEY_HEX, "hex");
}

// ---------------------------------------------------------------------------
// AES-256-GCM encrypt / decrypt
// ---------------------------------------------------------------------------

/**
 * Encrypt a plaintext string with AES-256-GCM.
 * Returns a string in the format: `iv:authTag:ciphertext` (all hex-encoded).
 */
export function encryptValue(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(12); // 96-bit IV for GCM
  const cipher = createCipheriv("aes-256-gcm", key, iv);

  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");

  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

/**
 * Decrypt a value previously encrypted with encryptValue().
 */
export function decryptValue(encrypted: string): string {
  const parts = encrypted.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted value format");
  }

  const [ivHex, authTagHex, ciphertext] = parts;
  const key = getEncryptionKey();
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");

  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}

// ---------------------------------------------------------------------------
// API key hashing
// ---------------------------------------------------------------------------

/**
 * Hash an API key for storage. We use SHA-256 so we can look up by hash
 * but never recover the original key.
 */
export function hashApiKey(apiKey: string): string {
  return createHash("sha256").update(apiKey).digest("hex");
}

/**
 * Mask an API key for display: show only the last 4 characters.
 * Example: "sg_abc123xyz789" -> "****789"
 */
export function maskApiKey(apiKey: string): string {
  if (apiKey.length <= 4) return "****";
  return "****" + apiKey.slice(-4);
}
