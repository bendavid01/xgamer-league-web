/** Permanent public player ID, e.g. XG-0007. */
export const playerCode = (n: number | null | undefined) =>
  n ? `XG-${String(n).padStart(4, "0")}` : "XG-????";

/** "XG-0007" / "xg-7" → 7. */
export const codeNumber = (code: string) => {
  const m = /^xg-?(\d{1,7})$/i.exec(code.trim());
  return m ? Number(m[1]) : null;
};
