import { createClient } from "next-sanity";
import imageUrlBuilder from "@sanity/image-url";

export const client = createClient({
  projectId: "aqtsgm5o", 
  dataset: "production",
  apiVersion: "2024-01-01",
  
  // 🛡️ SECURITY UPDATE:
  // Set to TRUE. This forces the app to use Sanity's Edge Cache.
  // Even if 100 people refresh at once, Sanity only gets 1 request.
  useCdn: true, 
});

const builder = imageUrlBuilder(client);
export function urlFor(source: any) {
  return builder.image(source);
}

export async function getTeams() {
  return client.fetch(
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
      // 🛡️ TRAFFIC CONTROL:
      // We check for updates only once every 60 seconds.
      // This makes "Refresh Spam" useless.
      next: { revalidate: 60 } 
    }
  );
}