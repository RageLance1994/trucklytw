import crypto from "crypto";

const ALGO = "aes-256-gcm";
const SECRET =
  process.env.USER_SECRET ||
  process.env.JWT_ACCESS_SECRET ||
  "truckly-dev-secret";

if (!process.env.USER_SECRET) {
  console.warn("USER_SECRET not set. Using fallback secret for encryption.");
}

const KEY = crypto.scryptSync(SECRET, "salt", 32);

export function encryptJSON(obj) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGO, KEY, iv);

  const json = JSON.stringify(obj);
  const encrypted = Buffer.concat([cipher.update(json, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decryptJSON(hash) {
  const buf = Buffer.from(hash, "base64");
  const iv = buf.slice(0, 16);
  const tag = buf.slice(16, 32);
  const encrypted = buf.slice(32);

  const decipher = crypto.createDecipheriv(ALGO, KEY, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return JSON.parse(decrypted.toString("utf8"));
}

export const encryptString = (str) => encryptJSON({ v: str });
export const decryptString = (hash) => decryptJSON(hash).v;
