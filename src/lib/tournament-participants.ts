import type { ISql } from "postgres";

/** Active entrants and players referenced by the tournament's saved records. */
export function participantIds(sql: ISql) {
  return sql`
    select a.tournament_id,a.player_id
      from application a join player p on p.id=a.player_id
      where a.status='approved' and a.deleted_at is null and p.deleted_at is null
    union
    select f.tournament_id,side.player_id
      from fixture f cross join lateral (values (f.home),(f.away)) as side(player_id)
      where side.player_id is not null
    union
    select tournament_id,player_id from qualification
    union
    select tournament_id,player_id from podium
  `;
}

export function tournamentParticipants(sql: ISql, ids: string[]) {
  return sql<
    {
      tournament_id: string;
      id: string;
      no: number;
      name: string;
      team: string | null;
      entry_team: string | null;
    }[]
  >`select h.tournament_id,p.id,p.public_no as no,p.gaming_name as name,
      p.team_name as team,a.team_name as entry_team
    from (${participantIds(sql)}) h join player p on p.id=h.player_id
    left join application a on a.tournament_id=h.tournament_id and a.player_id=h.player_id
    where h.tournament_id=any(${ids}) order by p.gaming_name,p.id`;
}
