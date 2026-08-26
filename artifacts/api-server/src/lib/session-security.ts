import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);

const SCRYPT_PREFIX = "scrypt-v1";
const SESSION_BYTES = 32;

export const SESSION_COOKIE_NAME = "franklins_demo_session";
export const SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000;

function sessionSecret(): string {
  const value = process.env.SESSION_SECRET?.trim();
  if (!value || value.length < 16) {
    throw new Error("SESSION_SECRET must be configured with at least 16 characters.");
  }
  return value;
}

function encoded(value: Buffer): string {
  return value.toString("base64url");
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, 64) as Buffer;
  return `${SCRYPT_PREFIX}$${encoded(salt)}$${encoded(derived)}`;
}

export async function verifyPassword(password: string, storedHash: string | null): Promise<boolean> {
  if (!storedHash) return false;
  const [prefix, saltText, expectedText] = storedHash.split("$");
  if (prefix !== SCRYPT_PREFIX || !saltText || !expectedText) return false;
  try {
    const derived = await scrypt(password, Buffer.from(saltText, "base64url"), 64) as Buffer;
    const expected = Buffer.from(expectedText, "base64url");
    return expected.length === derived.length && timingSafeEqual(expected, derived);
  } catch {
    return false;
  }
}

export function createSessionToken(): string {
  return encoded(randomBytes(SESSION_BYTES));
}

/**
 * Persist only a peppered token hash. SESSION_SECRET is never returned or logged.
 */
export function hashSessionToken(token: string): string {
  return createHash("sha256").update(`${sessionSecret()}:${token}`).digest("hex");
}