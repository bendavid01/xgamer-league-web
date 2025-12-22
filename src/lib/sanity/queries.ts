import { groq } from "next-sanity";

// UPDATE: Added 'player' to the list of fields we want
export const TEAMS_QUERY = groq`*[_type == "team"] | order(pts desc, gd desc) {
  _id,
  name,
  player, 
  "logoUrl": logo.asset->url,
  played,
  won,
  drawn,
  lost,
  gf,
  ga,
  gd,
  pts
}`;