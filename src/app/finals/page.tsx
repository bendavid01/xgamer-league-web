import { permanentRedirect } from "next/navigation";
/** Knockouts are played in the eFootball app; qualifiers are listed with the standings. */
export default function Finals() {
  permanentRedirect("/table");
}
