import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Trophy } from "lucide-react";
import { PageTitle, Unavailable } from "@/components/LeagueUI";
import LeaderboardClient from "@/components/LeaderboardClient";
import AutoRefresh from "@/components/AutoRefresh";
import LiveNow from "@/components/LiveNow";
import TournamentPicker from "@/components/hub/TournamentPicker";
import RoundList, { type HubRound } from "@/components/hub/RoundList";
import {
  getTournament,
  listTournaments,
  played,
  STATUS_LABEL,
  type PublicFixture,
  type PublicTournament,
} from "@/lib/tournaments";
import { getLiveStream } from "@/lib/youtube";
import { FORMAT_LABEL, formatChoice, PLACE_LABEL } from "@/lib/labels";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Tournaments",
  description:
    "Fixtures, results, standings and players for every XGamer eFootball tournament.",
};

const TABS = [
  ["live", "Live"],
  ["fixtures", "Fixtures"],
  ["results", "Results"],
  ["standings", "Standings"],
  ["players", "Players"],
] as const;
type Tab = (typeof TABS)[number][0];

const defaultTab = (t: PublicTournament): Tab =>
  t.status === "league"
    ? "fixtures"
    : t.status === "completed" || t.status === "knockout"
      ? "standings"
      : "players";

export default async function Tournaments({
  searchParams,
}: {
  searchParams: Promise<{ t?: string; tab?: string }>;
}) {
  const params = await searchParams;
  const list = await listTournaments();
  if (!list)
    return (
      <div className="page-shell py-12">
        <PageTitle
          label="COMPETE / EFOOTBALL"
          title="Tournaments."
          description="Fixtures, results, standings and players."
        />
        <Unavailable />
      </div>
    );
  const all = [...list.live, ...list.upcoming, ...list.past];
  const chosen = all.find((t) => t.id === params.t) ?? all[0];
  if (!chosen)
    return (
      <div className="page-shell py-12">
        <PageTitle
          label="COMPETE / EFOOTBALL"
          title="Tournaments."
          description="Fixtures, results, standings and players."
        />
        <p className="notice">
          No tournament is published yet. Join our Discord to hear about the
          next one.
        </p>
      </div>
    );
  const tab: Tab = TABS.some(([k]) => k === params.tab)
    ? (params.tab as Tab)
    : defaultTab(chosen);
  const [data, stream] = await Promise.all([
    getTournament(chosen.id),
    tab === "live" ? getLiveStream() : Promise.resolve(null),
  ]);
  const t = chosen;
  const format = formatChoice(t);
  const players = data?.players ?? [];
  const byId = new Map(players.map((p) => [p.id, p]));
  const who = (id: string) => {
    const p = byId.get(id);
    return p ? { name: p.name, code: p.code } : { name: "Player", code: "" };
  };
  const toRounds = (fixtures: PublicFixture[], newestFirst = false) => {
    const map = new Map<number, HubRound>();
    for (const f of fixtures) {
      const r = map.get(f.round) ?? { round: f.round, matches: [] };
      r.matches.push({
        id: f.id,
        home: who(f.home),
        away: who(f.away),
        homeScore: f.home_score,
        awayScore: f.away_score,
      });
      map.set(f.round, r);
    }
    const out = [...map.values()].sort((a, b) => a.round - b.round);
    return newestFirst ? out.reverse() : out;
  };
  const fixtures = data?.fixtures ?? [];
  const upcoming = fixtures.filter((f) => f.home_score === null);
  const done = fixtures.filter((f) => f.home_score !== null);
  const currentRound = upcoming.length
    ? Math.min(...upcoming.map((f) => f.round))
    : null;
  const qualified = new Set(data?.qualified ?? []);
  const knockoutOnly = format === "knockout";
  const href = (k: Tab) =>
    `/tournaments?t=${encodeURIComponent(t.id)}&tab=${k}`;

  return (
    <div className="page-shell py-12">
      <PageTitle
        label="COMPETE / EFOOTBALL"
        title="Tournaments."
        description="Pick a tournament to see its fixtures, results, standings and players."
      />
      <TournamentPicker
        current={t.id}
        groups={[
          { label: "Live", items: list.live },
          { label: "Upcoming", items: list.upcoming },
          { label: "Past", items: list.past },
        ]}
      />
      <header className="hub-head">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-2xl sm:text-3xl font-bold">{t.label}</h2>
          <span className={`status-pill status-${t.status}`}>
            {STATUS_LABEL[t.status]}
          </span>
        </div>
        <p className="text-slate-400 mt-2">
          {FORMAT_LABEL[format]}
          {format !== "knockout" && t.legs === 2 ? " · home & away" : ""}
          {format === "league_knockout" ? ` · Top ${t.qualifiers} qualify` : ""}
          {players.length ? ` · ${players.length} players` : ""}
          {t.starts_on
            ? ` · starts ${new Date(t.starts_on).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`
            : ""}
          {t.prize ? ` · Prize: ${t.prize}` : ""}
        </p>
        {t.description && (
          <p className="text-slate-300 mt-3 max-w-3xl">{t.description}</p>
        )}
        {t.status === "open" && (
          <Link href={`/register?t=${t.id}`} className="button-primary mt-4">
            Register now <ArrowUpRight size={16} />
          </Link>
        )}
      </header>
      <nav className="hub-tabs" aria-label="Tournament sections">
        {TABS.map(([k, label]) => (
          <Link
            key={k}
            href={href(k)}
            aria-current={k === tab ? "page" : undefined}
            className={k === tab ? "hub-tab hub-tab-on" : "hub-tab"}
          >
            {k === "live" && <span className="live-dot" aria-hidden="true" />}
            {label}
          </Link>
        ))}
      </nav>
      {t.status === "league" && <AutoRefresh />}
      {!data ? (
        <Unavailable />
      ) : tab === "live" ? (
        <div className="space-y-6">
          {stream ? (
            <LiveNow stream={stream} />
          ) : (
            <p className="notice">
              Not streaming right now. When we go live on YouTube, it shows up
              here.
            </p>
          )}
          {currentRound !== null && (
            <>
              <h3 className="text-xl font-bold">Now playing</h3>
              <RoundList
                search={false}
                rounds={toRounds(
                  upcoming.filter((f) => f.round === currentRound),
                )}
                empty=""
              />
            </>
          )}
        </div>
      ) : tab === "fixtures" ? (
        knockoutOnly ? (
          <KnockoutNote />
        ) : (
          <RoundList
            rounds={toRounds(upcoming)}
            empty={
              fixtures.length
                ? "Every match has been played. See Results."
                : "Fixtures appear here once the organizers generate them."
            }
          />
        )
      ) : tab === "results" ? (
        knockoutOnly ? (
          <KnockoutNote />
        ) : (
          <RoundList rounds={toRounds(done, true)} empty="No results yet." />
        )
      ) : tab === "standings" ? (
        <div className="space-y-6">
          {data.podium[0] && <PodiumStrip podium={data.podium} who={who} />}
          {format === "league_knockout" && qualified.size > 0 && (
            <section className="panel p-5">
              <h3 className="font-bold text-lg">
                Qualified for the knockout{" "}
                <span className="text-slate-400 font-normal">
                  (played in the eFootball app)
                </span>
              </h3>
              <p className="mt-2 text-slate-300">
                {[...qualified].map((id) => who(id).name).join(" · ")}
              </p>
            </section>
          )}
          {knockoutOnly ? (
            !data.podium[0] && <KnockoutNote />
          ) : (
            <LeaderboardClient
              teams={players.map((p) => ({
                id: p.id,
                name: p.name,
                group: null,
              }))}
              matches={played(fixtures)}
              links={Object.fromEntries(
                players.map((p) => [p.id, `/players/${p.code}`]),
              )}
              cutoff={format === "league_knockout" ? t.qualifiers : null}
            />
          )}
        </div>
      ) : players.length ? (
        <ul className="hub-players">
          {players.map((p) => (
            <li key={p.id}>
              <Link href={`/players/${p.code}`} className="panel hub-player">
                <span className="hub-avatar" aria-hidden="true">
                  {p.name.slice(0, 2).toUpperCase()}
                </span>
                <span className="min-w-0">
                  <strong>
                    {p.name}
                    {qualified.has(p.id) && (
                      <span className="qualified-badge">Qualified</span>
                    )}
                  </strong>
                  <span className="block text-sm text-slate-400">
                    {p.team ?? "—"} · {p.code}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="notice">
          {t.status === "open"
            ? "Registration is open. Confirmed players appear here."
            : "Players appear here once the organizers confirm them."}
        </p>
      )}
    </div>
  );
}

function KnockoutNote() {
  return (
    <p className="notice">
      Knockout matches are played in the eFootball app. Final positions appear
      here when the tournament ends.
    </p>
  );
}

function PodiumStrip({
  podium,
  who,
}: {
  podium: (string | null)[];
  who: (id: string) => { name: string; code: string };
}) {
  return (
    <ol className="podium-strip" aria-label="Final positions">
      {podium.map((id, i) =>
        id ? (
          <li key={i} className={`podium-card podium-${i + 1}`}>
            <Trophy aria-hidden="true" className="podium-icon" />
            <span className="podium-place">{PLACE_LABEL[i + 1]}</span>
            <Link href={`/players/${who(id).code}`} className="podium-name">
              {who(id).name}
            </Link>
          </li>
        ) : null,
      )}
    </ol>
  );
}
