import { permanentRedirect } from "next/navigation";
/** Fixtures are now built inside each tournament in the Organizer Manager. */
export default function Planner() {
  permanentRedirect("/admin");
}
