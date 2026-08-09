import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const VERSION = "v1";

function parseEncryptionKey(encodedKey: string): Buffer {
  const key = Buffer.from(encodedKey.trim(), "base64url");
  if (key.length !== 32) {
    throw new Error("TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key.");
  }
  return key;
}

function configuredKey(): Buffer {
  const value = process.env.TOKEN_ENCRYPTION_KEY;
  if (!value) {
    throw new Error("Token encryption is incomplete. Configure TOKEN_ENCRYPTION_KEY.");
  }
  return parseEncryptionKey(value);
}

export function encryptSecret(plaintext: string, encodedKey?: string): string {
  if (!plaintext) throw new Error("Secret cannot be empty.");
  const key = encodedKey ? parseEncryptionKey(encodedKey) : configuredKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [VERSION, iv.toString("base64url"), ciphertext.toString("base64url"), tag.toString("base64url")].join(".");
}

export function decryptSecret(payload: string, encodedKey?: string): string {
  const [version, ivValue, ciphertextValue, tagValue, extra] = payload.split(".");
  if (version !== VERSION || !ivValue || !ciphertextValue || !tagValue || extra) {
    throw new Error("Encrypted secret has an invalid format.");
  }

  const key = encodedKey ? parseEncryptionKey(encodedKey) : configuredKey();
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
