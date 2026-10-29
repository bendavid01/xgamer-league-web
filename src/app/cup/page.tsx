import { permanentRedirect } from "next/navigation";
/** The old October Cup page now lives in the match center. */
export default function Cup() {
  permanentRedirect("/tournaments?tab=fixtures");
}
