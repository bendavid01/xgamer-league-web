import { JetBrains_Mono, Plus_Jakarta_Sans } from "next/font/google";

/* Both SIL Open Font License, self-hosted by next/font. OM only. */
export const omSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--om-font-sans",
  display: "swap",
});
export const omMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--om-font-mono",
  display: "swap",
});
