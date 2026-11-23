/** Shown instead of an XG ID for a guest, who never has one. Not a valid XG ID. */
export const GUEST_CODE = "GUEST";

/** Permanent public player ID, e.g. XG-0007. Guests (negative internal numbers) have none. */
export const playerCode = (n: number | null | undefined) =>
  n && n < 0 ? GUEST_CODE : n ? `XG-${String(n).padStart(4, "0")}` : "XG-????";

/** "XG-0007" / "xg-7" → 7. */
export const codeNumber = (code: string) => {
  // Up to 10 digits: the database ID column holds numbers up to 2,147,483,647.
  const m = /^xg-?(\d{1,10})$/i.exec(code.trim());
  if (m && Number(m[1]) > 2147483647) return null;
  return m ? Number(m[1]) : null;
};
