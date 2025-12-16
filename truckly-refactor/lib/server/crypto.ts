import crypto from "crypto";

const SECRET = process.env.USER_SECRET;

if (!SECRET) {
  throw new Error("USER_SECRET env var is required for encryption");
}

const ALGO = "aes-256-gcm";
const KEY = crypto.scryptSync(SECRET, "salt", 32);

export function encryptJSON(obj: unknown) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGO, KEY, iv);
  const json = JSON.stringify(obj);
  const encrypted = Buffer.concat([
    cipher.update(json, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decryptJSON(hash: string) {
  const buf = Buffer.from(hash, "base64");
  const iv = buf.slice(0, 16);
  const tag = buf.slice(16, 32);
  const encrypted = buf.slice(32);
  const decipher = crypto.createDecipheriv(ALGO, KEY, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);
  return JSON.parse(decrypted.toString("utf8"));
}

export const encryptString = (value: string) => encryptJSON({ v: value });
export const decryptString = (hash: string) => decryptJSON(hash).v;
