import { createClient } from "next-sanity";
import imageUrlBuilder from "@sanity/image-url";

// 1. CONNECTION SETUP (This defines 'client')
export const client = createClient({
  projectId: "aqtsgm5o", 
  dataset: "production",
  apiVersion: "2024-01-01",
  useCdn: false, 
});

// 2. IMAGE HELPER
const builder = imageUrlBuilder(client);
export function urlFor(source: any) {
  return builder.image(source);
}

// 3. FETCH FUNCTION (Now it can see 'client'!)
export async function getTeams() {
  return client.fetch(
    // LOGIC UPDATE: 
    // - Sort by 'pts' (Points)
    // - Then calculate '(gf - ga)' for Goal Difference sorting
    // - Then 'gf' (Goals For)
    `*[_type == "team"] | order(pts desc, (gf - ga) desc, gf desc) {
      _id,
      name,
      player,
      "logo": logo.asset->url,
      played,   
      won,
      drawn,
      lost,
      gf,
      ga,
      pts
    }`,
    {},
    {
      // REVALIDATION: Updates every 10 seconds
      next: { revalidate: 10 } 
    }
  );
}