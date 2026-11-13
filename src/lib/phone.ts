import { parsePhoneNumberWithError } from "libphonenumber-js/max";
import { normalizePhone } from "./registration";

/**
 * WhatsApp numbers entered in OM (server only; never import from a client component).
 *
 * Indian numbers use registration's own normalizePhone(), so a number entered here is
 * stored byte-for-byte as registration would store it, and its lookup hash is the same.
 * Other countries are validated with libphonenumber-js (pinned 1.13.15) and stored as E.164.
 *
 * Stricter than registration on purpose: letters and other characters are refused, not
 * stripped. Only digits, spaces, dots, dashes, brackets and one leading "+" are allowed.
 *
 * Prefix rules:
 *   no "+"            → Indian, exactly as registration: 10 digits, "0" + 10, or "91" + 10
 *   "+91"             → Indian: exactly 10 digits after it (as registration)
 *   "00…" (e.g. 0091) → refused: "Write + instead of 00". Registration refuses 0091 too.
 *   other "+…"        → libphonenumber-js: valid, and a mobile or mobile-capable number
 */
export type PhoneResult = { phone: string } | { error: string };

const ALLOWED = /^\+?[0-9 ().-]+$/;
const WHATSAPP_TYPES = new Set(["MOBILE", "FIXED_LINE_OR_MOBILE"]);

export function canonicalPhone(raw: unknown): PhoneResult {
  if (typeof raw !== "string") return { error: "Enter a WhatsApp number." };
  const input = raw.trim();
  if (!input || input.length > 32) return { error: "Enter a WhatsApp number." };
  if (!ALLOWED.test(input))
    return {
      error:
        "Use digits only, with spaces or dashes if you like, and an optional + at the start.",
    };
  const digits = input.replace(/\D/g, "");
  const plus = input.startsWith("+");
  if (!plus && digits.startsWith("00"))
    return {
      error: "Write + instead of 00 (for example +91 instead of 0091).",
    };
  if (!plus || digits.startsWith("91")) {
    if (plus && digits.length !== 12)
      return { error: "An Indian number has 10 digits after +91." };
    const phone = normalizePhone(plus ? `+${digits}` : digits);
    return phone
      ? { phone }
      : {
          error:
            "Not a valid Indian mobile number. For another country, start with + and the country code.",
        };
  }
  if (digits.length < 8 || digits.length > 15)
    return { error: "Not a valid international number." };
  try {
    const p = parsePhoneNumberWithError(`+${digits}`);
    if (!p.isValid() || !WHATSAPP_TYPES.has(p.getType() ?? ""))
      return { error: "Not a valid mobile number for that country." };
    return { phone: p.number };
  } catch {
    return { error: "Not a valid international number." };
  }
}

/** "+91 ••••••••10": the calling code and the last 2 digits only. */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  let cc = digits.startsWith("91") && digits.length === 12 ? "91" : "";
  if (!cc)
    try {
      cc = parsePhoneNumberWithError(`+${digits}`).countryCallingCode;
    } catch {
      cc = "";
    }
  const national = digits.slice(cc.length);
  const shown = national.length > 4 ? national.slice(-2) : "";
  return `${cc ? `+${cc} ` : ""}${"•".repeat(Math.max(national.length - shown.length, 2))}${shown}`;
}

/** wa.me link for an authorized disclosure (built on the server). */
export const waUrl = (phone: string) =>
  `https://wa.me/${phone.replace(/\D/g, "")}`;
