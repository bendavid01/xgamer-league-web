// Define the structure of a Team object (Type Safety)
export interface Team {
  id: string;
  name: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number; // Goals For
  ga: number; // Goals Against
  gd: number; // Goal Difference
  pts: number;
  form: string[]; // e.g., ['W', 'L', 'W', 'D', 'W']
}

// The Data Source (Simulating a Database Response)
export const LEADERBOARD_DATA: Team[] = [
  {
    id: "t1",
    name: "Cyber United",
    played: 5,
    won: 4,
    drawn: 1,
    lost: 0,
    gf: 12,
    ga: 3,
    gd: 9,
    pts: 13,
    form: ["W", "W", "D", "W", "W"],
  },
  {
    id: "t2",
    name: "Neon FC",
    played: 5,
    won: 3,
    drawn: 2,
    lost: 0,
    gf: 10,
    ga: 5,
    gd: 5,
    pts: 11,
    form: ["W", "D", "W", "D", "W"],
  },
  {
    id: "t3",
    name: "Void Walkers",
    played: 5,
    won: 2,
    drawn: 1,
    lost: 2,
    gf: 8,
    ga: 9,
    gd: -1,
    pts: 7,
    form: ["L", "W", "L", "D", "W"],
  },
  {
    id: "t4",
    name: "Glitch Strikers",
    played: 5,
    won: 1,
    drawn: 0,
    lost: 4,
    gf: 4,
    ga: 11,
    gd: -7,
    pts: 3,
    form: ["L", "L", "W", "L", "L"],
  },
  {
    id: "t5",
    name: "Phantom XI",
    played: 5,
    won: 0,
    drawn: 0,
    lost: 5,
    gf: 2,
    ga: 15,
    gd: -13,
    pts: 0,
    form: ["L", "L", "L", "L", "L"],
  },
];