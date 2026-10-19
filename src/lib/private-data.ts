import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from "node:crypto";
function key() {
  const value = process.env.PRIVATE_DATA_KEY;
  if (!value || !/^[a-f0-9]{64}$/i.test(value))
    throw new Error("Private encryption is not configured.");
  return Buffer.from(value, "hex");
}
export function fingerprint(value: string) {
  return createHmac("sha256", key()).update(value).digest("hex");
}
export function encrypt(value: string) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64");
}
export function decrypt(value: string) {
  const data = Buffer.from(value, "base64"),
    cipher = createDecipheriv("aes-256-gcm", key(), data.subarray(0, 12));
  cipher.setAuthTag(data.subarray(12, 28));
  return Buffer.concat([
    cipher.update(data.subarray(28)),
    cipher.final(),
  ]).toString("utf8");
}
