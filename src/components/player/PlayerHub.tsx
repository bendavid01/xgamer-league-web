"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import {
  ArrowUpRight,
  History,
  LayoutDashboard,
  Lock,
  LogOut,
  Megaphone,
  Trophy,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { PlayerName } from "@/components/PlayerName";
import type { PlayerHubData } from "@/lib/player-account";
import s from "./player.module.css";

export type HubView =
  "overview" | "profile" | "tournaments" | "history" | "announcements";
export type OpenToJoin = { id: string; label: string; detail: string };

const VIEWS: [HubView, string, LucideIcon][] = [
  ["overview", "Overview", LayoutDashboard],
  ["profile", "My Profile", UserRound],
  ["tournaments", "Tournaments", Trophy],
  ["history", "History", History],
  ["announcements", "Announcements", Megaphone],
];

const ENTRY_LABEL: Record<string, [string, string]> = {
  approved: ["Confirmed", "green"],
  pending: ["Pending organizer approval", "amber"],
  waitlisted: ["Waitlisted", "amber"],
  rejected: ["Not accepted", "red"],
  withdrawn: ["Withdrawn", "red"],
};
const OUTCOME: Record<string, [string, string]> = {
  W: ["Win", "green"],
  D: ["Draw", "violet"],
  L: ["Loss", "red"],
};
const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });

/** The signed-in player's private hub. All data comes from the verified session. */
export default function PlayerHub({
  data,
  open,
  initialView,
}: {
  data: PlayerHubData;
  open: OpenToJoin[];
  initialView: HubView;
}) {
  const router = useRouter();
  const [view, setView] = useState<HubView>(initialView);
  const [signingOut, setSigningOut] = useState(false);

  const go = (v: HubView) => {
    setView(v);
    // Keep the view on reload without a navigation.
    const url = new URL(window.location.href);
    if (v === "overview") url.searchParams.delete("view");
    else url.searchParams.set("view", v);
    window.history.replaceState(null, "", url);
  };
  const signOut = async () => {
    setSigningOut(true);
    await fetch("/api/player/logout", { method: "POST" }).catch(() => null);
    router.replace("/login");
    router.refresh();
  };

  const navButton = ([key, label, Icon]: (typeof VIEWS)[number]) => (
    <button
      key={key}
      type="button"
      className={s.navItem}
      aria-current={view === key ? "page" : undefined}
      onClick={() => go(key)}
    >
      <Icon size={17} aria-hidden="true" />
      {label}
    </button>
  );
  const title = VIEWS.find(([k]) => k === view)![1];

  return (
    <div className={`${s.pw} ${s.hub}`}>
      <aside className={s.side} aria-label="Player hub">
        <div className={s.brand}>
          <span className={s.brandMark} aria-hidden="true">
            XG.
          </span>
          <span>
            <strong>Player Hub</strong>
            <span>XGamer Pro League</span>
          </span>
        </div>
        <nav aria-label="Hub sections">
          <ul className={s.nav}>
            {VIEWS.map((v) => (
              <li key={v[0]}>{navButton(v)}</li>
            ))}
          </ul>
        </nav>
        <div className={s.sideFoot}>
          <Link href="/" className={s.navItem}>
            <ArrowUpRight size={17} aria-hidden="true" /> Public site
          </Link>
          <button
            type="button"
            className={s.navItem}
            onClick={signOut}
            disabled={signingOut}
          >
            <LogOut size={17} aria-hidden="true" />
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      </aside>

      <div className={s.main}>
        <header className={s.top}>
          <span className={s.topTitle}>{title}</span>
          <span className="flex items-center gap-2">
            <span className={`${s.pill} ${s.mono}`} data-tone="cyan">
              {data.player.xgId}
            </span>
            <Link
              href="/"
              className={`${s.ghost} ${s.phoneOnly}`}
              aria-label="Public site"
            >
              <ArrowUpRight size={16} aria-hidden="true" />
            </Link>
            <button
              type="button"
              className={`${s.ghost} ${s.phoneOnly}`}
              onClick={signOut}
              disabled={signingOut}
              aria-label="Sign out"
            >
              <LogOut size={16} aria-hidden="true" />
            </button>
          </span>
        </header>
        <nav aria-label="Hub sections" className={s.mobileNav}>
          {VIEWS.map(navButton)}
        </nav>
        <div className={s.content}>
          {view === "overview" && <Overview data={data} open={open} go={go} />}
          {view === "profile" && <Profile data={data} />}
          {view === "tournaments" && <Tournaments data={data} open={open} />}
          {view === "history" && <HistoryView data={data} />}
          {view === "announcements" && <Announcements data={data} />}
        </div>
      </div>
    </div>
  );
}

function Overview({
  data,
  open,
  go,
}: {
  data: PlayerHubData;
  open: OpenToJoin[];
  go: (v: HubView) => void;
}) {
  const p = data.player;
  const t = data.career?.totals;
  const active = data.entries.filter((e) => e.tournamentStatus !== "completed");
  const recent = data.pastMatches.slice(0, 3);
  return (
    <div className={s.section}>
      <section className={s.welcome} aria-labelledby="welcome-h">
        <div>
          <p className={s.eyebrow}>Welcome back</p>
          <h1 id="welcome-h">{p.displayNickname ?? p.gamingName}</h1>
          {p.displayNickname && (
            <span className={`${s.pill} mt-2`} data-tone="violet">
              <Lock size={12} aria-hidden="true" /> Nickname locked
            </span>
          )}
        </div>
        <span className={s.idBadge} aria-label={`XG ID ${p.xgId}`}>
          {p.xgId}
        </span>
      </section>

      <div className={s.stats}>
        {(
          [
            ["Matches", t?.matches ?? 0],
            ["Wins", t?.won ?? 0],
            ["Win rate", `${t?.winRate ?? 0}%`],
            ["Goals", t?.gf ?? 0],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className={s.stat}>
            <span className={s.statLabel}>{label}</span>
            <span className={s.statValue}>{value}</span>
          </div>
        ))}
      </div>

      <div className={s.split}>
        <section className={s.panel} aria-labelledby="active-h">
          <div className={s.panelHead}>
            <h2 id="active-h">Your tournaments</h2>
            <button
              type="button"
              className={s.link}
              onClick={() => go("tournaments")}
            >
              All tournaments →
            </button>
          </div>
          {active.length ? (
            <ul className={s.rows}>
              {active.slice(0, 3).map((e) => (
                <EntryRow key={e.tournamentId} e={e} />
              ))}
            </ul>
          ) : open.length ? (
            <div className={s.panelBody}>
              <p className="mb-3 text-sm">
                <strong>{open[0].label}</strong> is open for entries.
              </p>
              <button
                type="button"
                className={s.primary}
                onClick={() => go("tournaments")}
              >
                Join in one click
              </button>
            </div>
          ) : (
            <p className={s.empty}>No active tournaments right now.</p>
          )}
        </section>

        <section className={s.panel} aria-labelledby="recent-h">
          <div className={s.panelHead}>
            <h2 id="recent-h">Recent matches</h2>
            <button
              type="button"
              className={s.link}
              onClick={() => go("history")}
            >
              Full history →
            </button>
          </div>
          {recent.length ? (
            <ul className={s.rows}>
              {recent.map((m) => (
                <li key={m.id} className={s.row}>
                  <span>
                    <span className={s.rowTitle}>
                      {m.home ? "vs" : "@"}{" "}
                      <PlayerName
                        code={m.opponent.code}
                        name={m.opponent.name}
                      />
                    </span>
                    <span className={s.rowSub}>
                      {m.tournamentLabel} · Round {m.round}
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className={s.mono}>
                      {m.gf}–{m.ga}
                    </span>
                    <Outcome o={m.outcome} />
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className={s.empty}>
              Your results appear here after your first match.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

function EntryRow({ e }: { e: PlayerHubData["entries"][number] }) {
  const [label, tone] = ENTRY_LABEL[e.status] ?? [e.status, "violet"];
  return (
    <li className={s.row}>
      <span>
        <span className={s.rowTitle}>{e.tournament}</span>
        <span className={s.rowSub}>
          {e.team ? `Team: ${e.team} · ` : ""}Entered {shortDate(e.enteredAt)}
        </span>
      </span>
      <span className={s.pill} data-tone={tone}>
        {label}
      </span>
    </li>
  );
}

function Outcome({ o }: { o: "W" | "D" | "L" | null }) {
  if (!o) return <span className={s.pill}>Not played</span>;
  const [label, tone] = OUTCOME[o];
  return (
    <span className={s.pill} data-tone={tone}>
      {label}
    </span>
  );
}

function Profile({ data }: { data: PlayerHubData }) {
  const p = data.player;
  const fields: [string, string, boolean][] = [
    ["Display nickname", p.displayNickname ?? "Not set yet", p.nicknameLocked],
    ["XG ID", p.xgId, true],
    ["Gaming name", p.gamingName, true],
    ["eFootball ID", p.efootballId ?? "Not added yet", true],
    ["Club", p.club ?? "Not recorded", true],
    ["Account status", "Active · sign-in enabled", true],
  ];
  return (
    <div className={s.section}>
      <section className={s.panel} aria-labelledby="identity-h">
        <div className={s.panelHead}>
          <h2 id="identity-h">Identity</h2>
          <span className={s.pill} data-tone="violet">
            <Lock size={12} aria-hidden="true" /> Read only
          </span>
        </div>
        <dl className={`${s.fields} ${s.panelBody}`}>
          {fields.map(([label, value, locked]) => (
            <div key={label} className={s.idField}>
              <dt>
                {label}
                {locked && <Lock size={11} aria-label="Locked" />}
              </dt>
              <dd
                className={
                  label === "XG ID" || label === "eFootball ID"
                    ? s.mono
                    : undefined
                }
              >
                {value}
              </dd>
            </div>
          ))}
        </dl>
      </section>
      <p className={s.note}>
        Identity fields are locked for fair play. Contact an organizer on
        WhatsApp for updates (in-app Change Requests coming next).
      </p>
    </div>
  );
}

function Tournaments({
  data,
  open,
}: {
  data: PlayerHubData;
  open: OpenToJoin[];
}) {
  const active = data.entries.filter((e) => e.tournamentStatus !== "completed");
  const done = data.entries.filter((e) => e.tournamentStatus === "completed");
  return (
    <div className={s.section}>
      <section className={s.panel} aria-labelledby="open-h">
        <div className={s.panelHead}>
          <h2 id="open-h">Open for entries</h2>
          <span className={s.hint}>
            Entries wait for an organizer&apos;s approval.
          </span>
        </div>
        {open.length ? (
          <ul className={s.rows}>
            {open.map((t) => (
              <JoinRow key={t.id} t={t} />
            ))}
          </ul>
        ) : (
          <p className={s.empty}>
            No other tournament is open right now. New ones appear here.
          </p>
        )}
      </section>
      <section className={s.panel} aria-labelledby="mine-h">
        <div className={s.panelHead}>
          <h2 id="mine-h">Active entries</h2>
        </div>
        {active.length ? (
          <ul className={s.rows}>
            {active.map((e) => (
              <EntryRow key={e.tournamentId} e={e} />
            ))}
          </ul>
        ) : (
          <p className={s.empty}>You have no active entries.</p>
        )}
      </section>
      <section className={s.panel} aria-labelledby="done-h">
        <div className={s.panelHead}>
          <h2 id="done-h">Completed</h2>
        </div>
        {done.length ? (
          <ul className={s.rows}>
            {done.map((e) => (
              <EntryRow key={e.tournamentId} e={e} />
            ))}
          </ul>
        ) : (
          <p className={s.empty}>Finished tournaments appear here.</p>
        )}
      </section>
    </div>
  );
}

function JoinRow({ t }: { t: OpenToJoin }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const teamName = String(
      new FormData(e.currentTarget).get("teamName") ?? "",
    );
    const res = await fetch(
      `/api/player/tournaments/${encodeURIComponent(t.id)}/join`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamName }),
      },
    ).catch(() => null);
    const body = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    if (res?.ok) {
      setMessage({
        ok: true,
        text:
          body.status === "waitlisted"
            ? "You're on the waitlist. An organizer will confirm if a place opens."
            : "Entry sent. It's pending until an organizer approves it.",
      });
      router.refresh();
    } else
      setMessage({
        ok: false,
        text: body.error ?? "We couldn't send your entry. Please try again.",
      });
  };
  return (
    <li className={s.row}>
      <span>
        <span className={s.rowTitle}>{t.label}</span>
        <span className={s.rowSub}>{t.detail}</span>
      </span>
      <form className={s.joinForm} onSubmit={submit}>
        <label className={s.field}>
          Tournament team name
          <input
            name="teamName"
            required
            minLength={2}
            maxLength={40}
            className={s.input}
            placeholder="Your eFootball team"
            disabled={busy || message?.ok}
          />
        </label>
        <button className={s.primary} disabled={busy || message?.ok}>
          {busy ? "Sending…" : "Join"}
        </button>
      </form>
      {message && (
        <p
          role={message.ok ? "status" : "alert"}
          className={`${message.ok ? s.success : s.error} w-full`}
        >
          {message.text}
        </p>
      )}
    </li>
  );
}

function HistoryView({ data }: { data: PlayerHubData }) {
  const rows = data.pastMatches;
  return (
    <section className={s.panel} aria-labelledby="history-h">
      <div className={s.panelHead}>
        <h2 id="history-h">Match history</h2>
        <span className={s.hint}>{rows.length} played</span>
      </div>
      {rows.length ? (
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr>
                <th scope="col">Opponent</th>
                <th scope="col">Event</th>
                <th scope="col">Score</th>
                <th scope="col">Result</th>
                <th scope="col">Round</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id}>
                  <td>
                    {m.home ? "vs " : "@ "}
                    <PlayerName code={m.opponent.code} name={m.opponent.name} />
                  </td>
                  <td>{m.tournamentLabel}</td>
                  <td className={s.mono}>
                    {m.gf}–{m.ga}
                  </td>
                  <td>
                    <Outcome o={m.outcome} />
                  </td>
                  <td>Round {m.round}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className={s.empty}>No results yet.</p>
      )}
    </section>
  );
}

function Announcements({ data }: { data: PlayerHubData }) {
  return (
    <section className={s.panel} aria-labelledby="news-h">
      <div className={s.panelHead}>
        <h2 id="news-h">Announcements</h2>
        <span className={s.hint}>From your tournaments</span>
      </div>
      {data.announcements.length ? (
        data.announcements.map((a) => {
          const where = data.entries.find(
            (e) => e.tournamentId === a.tournamentId,
          );
          return (
            <article key={a.id} className={s.announcement}>
              <span className={s.hint}>
                {where?.tournament ?? "Tournament"} · {shortDate(a.createdAt)}
              </span>
              <h3>{a.title}</h3>
              <p>{a.message}</p>
            </article>
          );
        })
      ) : (
        <p className={s.empty}>No announcements yet.</p>
      )}
    </section>
  );
}
