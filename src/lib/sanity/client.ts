import { createClient } from "next-sanity";

export const client = createClient({
  projectId: "aqtsgm5o", 
  dataset: "production",
  apiVersion: "2024-01-01",
  useCdn: true, 
});

// Fetch BOTH Teams and Matches in one go for calculation
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

  return client.fetch(query, {}, { next: { revalidate: 30 } });
}

// Simple fetch for the Matches Page
export async function getMatchSchedule() {
  const query = `*[_type == "match"] | order(date asc) {
    _id,
    date,
    status,
    homeScore,
    awayScore,
    "home": homeTeam->name,
    "away": awayTeam->name,
    stage
  }`;
  
  return client.fetch(query, {}, { next: { revalidate: 30 } });
}