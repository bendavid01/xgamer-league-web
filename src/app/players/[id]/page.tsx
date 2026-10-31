import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import Link from "next/link";
import { Medal, Trophy } from "lucide-react";
import { getProfile, type CareerEntry } from "@/lib/profile";
import { codeNumber, playerCode } from "@/lib/codes";
import { FORMAT_LABEL, ordinal, PLACE_LABEL } from "@/lib/labels";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const profile = await getProfile((await params).id).catch(() => null);
  return profile
    ? {
        title: `${profile.player.name} (${profile.player.code})`,
        description: `${profile.player.name}'s XGamer career: trophies, results and head-to-head.`,
      }
    : { title: "Player" };
}

const STATUS: Record<string, string> = {
  open: "Registration open",
  locked: "Starting soon",
  league: "In progress",
  knockout: "Knockout in eFootball app",
  completed: "Finished",
  draft: "To be announced",
};

export default async function PlayerProfile({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const no = codeNumber(id);
  if (!no) notFound();
  if (id !== playerCode(no)) permanentRedirect(`/players/${playerCode(no)}`);
  const profile = await getProfile(id);
  if (!profile) notFound();
  const { player, trophies, totals, career, form, history, next, headToHead } =
    profile;
  const since = new Date(player.since).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="page-shell py-12 profile">
      <header className="profile-head">
        <span className="profile-avatar" aria-hidden="true">
          {player.name.slice(0, 2).toUpperCase()}
        </span>
        <div className="min-w-0">
          <p className="eyebrow">PLAYER PROFILE</p>
          <h1 className="page-title">{player.name}</h1>
          <p className="text-slate-400 mt-2">
            {player.team && <>{player.team} · </>}
            <span className="font-mono text-cyan-300">{player.code}</span> ·
            Member since {since}
          </p>
        </div>
      </header>

      <section className="trophy-cabinet" aria-label="Trophies">
        {(
          [
            ["gold", "Champion", trophies.gold],
            ["silver", "Runner-up", trophies.silver],
            ["bronze", "Third place", trophies.bronze],
          ] as const
        ).map(([tone, label, n], i) => (
          <div
            key={tone}
            className={`trophy-medal trophy-${tone} ${n ? "trophy-won" : ""}`}
            style={{ animationDelay: `${i * 120}ms` }}
          >
            {tone === "gold" ? (
              <Trophy aria-hidden="true" />
            ) : (
              <Medal aria-hidden="true" />
            )}
            <strong>{n}</strong>
            <span>{label}</span>
          </div>
        ))}
      </section>

      <section aria-labelledby="totals" className="mt-10">
        <h2 id="totals" className="profile-h2">
          Career totals
        </h2>
        <dl className="profile-stats">
          {(
            [
              ["Tournaments", totals.tournaments],
              ["Matches", totals.matches],
              ["Won", totals.won],
              ["Drawn", totals.drawn],
              ["Lost", totals.lost],
              ["Win rate", `${totals.winRate}%`],
              ["Goals for", totals.gf],
              ["Goals against", totals.ga],
              ["Goal difference", totals.gd > 0 ? `+${totals.gd}` : totals.gd],
              ["Best finish", totals.best ? ordinal(totals.best) : "—"],
              ["Knockouts reached", totals.knockouts],
            ] as const
          ).map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        {form.length > 0 && (
          <p className="profile-form">
            <span className="text-slate-400 text-sm">Last {form.length}:</span>
            {form.map((o, i) => (
              <span key={i} className={`form-chip form-${o}`} title={o}>
                {o}
              </span>
            ))}
          </p>
        )}
      </section>

      <section aria-labelledby="career" className="mt-12">
        <h2 id="career" className="profile-h2">
          Tournaments
        </h2>
        {career.length ? (
          <ul className="career-list">
            {career.map((c) => (
              <CareerCard key={c.id} c={c} />
            ))}
          </ul>
        ) : (
          <p className="notice">No tournaments yet.</p>
        )}
      </section>

      {next.length > 0 && (
        <section aria-labelledby="next" className="mt-12">
          <h2 id="next" className="profile-h2">
            Next fixtures
          </h2>
          <ul className="hub-round">
            {next.map((m) => (
              <li key={m.id} className="hub-row">
                <span className="hub-name text-slate-400 text-sm">
                  {m.tournamentLabel} · R{m.round}
                </span>
                <span className="hub-vs">{m.home ? "vs" : "@"}</span>
                <Link
                  href={`/players/${m.opponent.code}`}
                  className="hub-name hub-away"
                >
                  {m.opponent.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {headToHead.length > 0 && (
        <section aria-labelledby="h2h" className="mt-12">
          <h2 id="h2h" className="profile-h2">
            Head-to-head
          </h2>
          <div className="panel overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead className="text-slate-400 text-xs uppercase border-b border-slate-800">
                <tr>
                  {["Opponent", "P", "W", "D", "L", "GF", "GA"].map((h) => (
                    <th key={h} scope="col" className="px-4 py-3 text-left">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {headToHead.map((r) => (
                  <tr key={r.code} className="border-b border-slate-800/60">
                    <th scope="row" className="px-4 py-3 text-left">
                      <Link
                        href={`/players/${r.code}`}
                        className="hover:text-cyan-300"
                      >
                        {r.name}
                      </Link>
                    </th>
                    {[r.p, r.w, r.d, r.l, r.gf, r.ga].map((n, i) => (
                      <td key={i} className="px-4 font-mono text-slate-300">
                        {n}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {history.length > 0 && (
        <section aria-labelledby="history" className="mt-12">
          <h2 id="history" className="profile-h2">
            Match history
          </h2>
          <ul className="hub-round">
            {history.map((m) => (
              <li key={m.id} className="hub-row">
                <span className={`form-chip form-${m.outcome}`}>
                  {m.outcome}
                </span>
                <span className="hub-score">
                  {m.gf} – {m.ga}
                </span>
                <span className="hub-name hub-away">
                  <Link
                    href={`/players/${m.opponent.code}`}
                    className="hover:text-cyan-300"
                  >
                    {m.home ? "vs" : "@"} {m.opponent.name}
                  </Link>
                  <span className="block text-xs text-slate-500">
                    {m.tournamentLabel} · Round {m.round}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function CareerCard({ c }: { c: CareerEntry }) {
  return (
    <li className={`panel career-card ${c.podium ? `career-${c.podium}` : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href={`/tournaments?t=${c.id}`}
            className="font-bold text-lg hover:text-cyan-300"
          >
            {c.label}
          </Link>
          <p className="text-sm text-slate-400">
            {FORMAT_LABEL[c.format]} · {STATUS[c.status] ?? c.status}
            {c.qualified && <span className="qualified-badge">Qualified</span>}
          </p>
        </div>
        {c.podium ? (
          <span className={`place-badge place-${c.podium}`}>
            {c.podium === 1 ? (
              <Trophy size={18} aria-hidden="true" />
            ) : (
              <Medal size={18} aria-hidden="true" />
            )}
            {PLACE_LABEL[c.podium]}
          </span>
        ) : c.position ? (
          <span className="place-badge">
            {c.finished ? "Finished" : "Now"} {ordinal(c.position)}
            <span className="text-slate-500"> of {c.field}</span>
          </span>
        ) : null}
      </div>
      {c.played > 0 && (
        <p className="career-line">
          <span>
            <b>{c.played}</b> played
          </span>
          <span>
            <b>{c.won}</b>W <b>{c.drawn}</b>D <b>{c.lost}</b>L
          </span>
          <span>
            Goals <b>{c.gf}</b>–<b>{c.ga}</b>
          </span>
          <span>
            <b>{c.pts}</b> pts
          </span>
        </p>
      )}
    </li>
  );
}
