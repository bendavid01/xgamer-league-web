import { z } from "zod";

export const AUDIT_TEXT_ERROR =
  "Don't include phone numbers, verification codes, email addresses or credentials. Use dates like 13 Nov.";

// Six digits also catches bare verification codes. Normalize full-width input
// and ignore formatting characters so copied contact details are caught.
const PHONE_OR_CODE = /\+\s*\p{Nd}|\p{Nd}(?:[\s\p{P}\p{S}]*\p{Nd}){5,}/u;
const EMAIL = /[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+/u;
const LABELED_SECRET =
  /\b(?:password|passphrase|(?:api|private)[\s_-]*key|(?:access[\s_-]*)?token|secret|connection\s+string|efootball\s+id|otp|passcode|(?:verification|security|recovery)\s+code)\s*(?:[:=]|\bis\b)\s*\S/iu;
const LABELED_CODE =
  /\b(?:otp|passcode|(?:verification|security|recovery)\s+code)\s+\p{Nd}(?:[\s\p{P}]*\p{Nd}){3}/iu;
const SECRET_TOKEN =
  /\bbearer\s+[a-z0-9._~+/=-]{8,}|\b(?:gh[pousr]_|github_pat_|sk_(?:test|live)_)[a-z0-9_-]{10,}|\beyJ[a-z0-9_-]+\.[a-z0-9_-]+\.[a-z0-9_-]+/iu;
const PRIVATE_KEY = /-----BEGIN [A-Z ]*PRIVATE KEY-----/u;
const URL_WITH_CREDENTIALS = /\b[a-z][a-z0-9+.-]*:\/\/[^\s/@]+:[^\s/@]+@/iu;

function containsSensitiveText(value: string) {
  const normalized = value.normalize("NFKC").replace(/\p{Cf}/gu, "");
  return (
    PHONE_OR_CODE.test(normalized) ||
    EMAIL.test(normalized) ||
    LABELED_SECRET.test(normalized) ||
    LABELED_CODE.test(normalized) ||
    SECRET_TOKEN.test(normalized) ||
    PRIVATE_KEY.test(normalized) ||
    URL_WITH_CREDENTIALS.test(normalized)
  );
}

/** Reject sensitive inputs in the reason and evidence fields of a new action. */
export const auditNote = (min: number, max: number) =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .refine((value) => !containsSensitiveText(value), {
      message: AUDIT_TEXT_ERROR,
    });

/** Scrub human-readable text copied into a new audit record, including old values. */
export function auditText(value: string): string;
export function auditText(value: string | null): string | null;
export function auditText(value: string | null) {
  return value !== null && containsSensitiveText(value) ? "[REDACTED]" : value;
}

/** A redacted registration team must not become a historical team name. */
export const auditRegistrationTeam = (team: string) =>
  containsSensitiveText(team) ? null : team;
