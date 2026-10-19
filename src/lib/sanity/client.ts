import { createClient } from "@sanity/client";

// 1. Define the Client
export const client = createClient({
  projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || "aqtsgm5o",
  dataset: process.env.NEXT_PUBLIC_SANITY_DATASET || "production",
  apiVersion: "2024-01-01",
  useCdn: false,
});

// 2. Fetch League Data (Teams + Completed Group Matches)
// WHY: Exclude deleted matches (soft delete); they must be treated as non-existent.
export async function getLeagueData() {
  const query = `{
    "teams": *[_type == "team"] {
      _id,
      name,
      group
    },
    "matches": *[_type == "match" && status == "completed" && stage == "Group Stage" && deleted != true] {
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
    matches: data?.matches || [],
  };
}

// 3. Fetch Match Schedule (Sorted by SYSTEM CREATION TIME)
// WHY: Exclude deleted matches from schedule.
export async function getMatchSchedule() {
  const query = `*[_type == "match" && deleted != true] | order(_createdAt asc) {
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
