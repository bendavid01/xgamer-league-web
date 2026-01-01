import { createClient } from "next-sanity";

// 1. Define the Client
export const client = createClient({
  projectId: "aqtsgm5o", // Your Project ID
  dataset: "production",
  apiVersion: "2024-01-01",
  useCdn: true,
});

// 2. Fetch League Data (Teams + Completed Group Matches)
export async function getLeagueData() {
  const query = `{
    "teams": *[_type == "team"] {
      _id,
      name,
      group
    },
    "matches": *[_type == "match" && status == "Completed" && stage == "Group Stage"] {
      homeTeam->{_id},
      awayTeam->{_id},
      homeScore,
      awayScore
    }
  }`;

  // ⚡ Fast Revalidation (5 seconds)
  const data = await client.fetch(query, {}, { next: { revalidate: 5 } });

  // 🛡️ Safety: Return empty arrays if data is null to prevent crashes
  return {
    teams: data?.teams || [],
    matches: data?.matches || []
  };
}

// 3. Fetch Match Schedule (Sorted by SYSTEM CREATION TIME)
export async function getMatchSchedule() {
  // 👇 CHANGED: 'order(date asc)' -> 'order(_createdAt asc)'
  const query = `*[_type == "match"] | order(_createdAt asc) {
    _id,
    _createdAt, // Sanity's automatic timestamp
    status,
    homeScore,
    awayScore,
    "home": homeTeam->name,
    "away": awayTeam->name,
    stage
  }`;
  
  return client.fetch(query, {}, { next: { revalidate: 5 } });
}