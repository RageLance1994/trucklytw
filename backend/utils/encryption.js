const crypto = require("crypto");

const ALGO = "aes-256-gcm";
const KEY = crypto.scryptSync(process.env.USER_SECRET, "salt", 32);

function encryptJSON(obj) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGO, KEY, iv);

  const json = JSON.stringify(obj);
  const encrypted = Buffer.concat([cipher.update(json, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}



function decryptJSON(hash) {
  const buf = Buffer.from(hash, "base64");
  const iv = buf.slice(0, 16);
  const tag = buf.slice(16, 32);
  const encrypted = buf.slice(32);

  const decipher = crypto.createDecipheriv(ALGO, KEY, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return JSON.parse(decrypted.toString("utf8"));
}

function encryptString(str) {
  return encryptJSON({ v: str }); // riuso la stessa logica su stringhe
}

function decryptString(hash) {
  return decryptJSON(hash).v;
}

module.exports = { encryptJSON, decryptJSON, encryptString, decryptString };
