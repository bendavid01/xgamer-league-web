import { permanentRedirect } from "next/navigation";

/** Merged into the Tournaments hub. */
export default function Competitions() {
  permanentRedirect("/tournaments");
}
