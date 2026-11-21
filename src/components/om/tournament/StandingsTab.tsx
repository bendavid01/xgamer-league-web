"use client";
import { useState } from "react";
import { compress } from "../client";
import type { Act, Workspace } from "../types";
import s from "../om.module.css";

/** Standings & Podium: the league table, final positions and the champion photo. */
export default function StandingsTab({
  data,
  act,
  reload,
}: {
  data: Workspace;
  act: Act;
  reload: () => Promise<void>;
}) {
  const t = data.tournament;
  const admin = data.user.role === "admin";
  return (
    <div className="space-y-6">
      {t.format === "league" && <Standings data={data} />}
      {admin && ["knockout", "completed"].includes(t.status) && (
        <Podium data={data} act={act} reload={reload} />
      )}
    </div>
  );
}

function Standings({ data }: { data: Workspace }) {
  const t = data.tournament;
  const qualified = new Set(data.qualified);
  return (
    <section
      className="panel p-4 md:p-7 overflow-x-auto"
      aria-label="Standings"
    >
      <table className={`control-table ${s.numTable}`}>
        <thead>
          <tr>
            <th>#</th>
            <th>Player</th>
            <th>P</th>
            <th>W</th>
            <th>D</th>
            <th>L</th>
            <th>GD</th>
            <th>Pts</th>
          </tr>
        </thead>
        <tbody>
          {data.standings.map((p, i) => (
            <tr
              key={p.id}
              className={
                t.knockout && i === t.qualifiers - 1 ? "om-cutoff" : ""
              }
            >
              <td>{i + 1}</td>
              <td>
                {p.name}
                {qualified.has(p.id) && (
                  <span className="qualified-badge">Qualified</span>
                )}
              </td>
              <td>{p.played}</td>
              <td>{p.won}</td>
              <td>{p.drawn}</td>
              <td>{p.lost}</td>
              <td>{p.gd > 0 ? `+${p.gd}` : p.gd}</td>
              <td>
                <strong>{p.pts}</strong>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!data.standings.length && (
        <p className="text-slate-400 py-6">
          Approve players to start the table.
        </p>
      )}
      {t.knockout && data.standings.length > 0 && (
        <p className="text-xs text-slate-500 mt-3">
          Dashed line: the Top {t.qualifiers} cutoff for the knockout.
        </p>
      )}
    </section>
  );
}

function Podium({
  data,
  act,
  reload,
}: {
  data: Workspace;
  act: Act;
  reload: () => Promise<void>;
}) {
  const t = data.tournament;
  const approved = data.applications.filter((a) => a.status === "approved");
  const auto = t.format === "league" && !t.knockout;
  const [places, setPlaces] = useState<string[]>(
    data.podium.map((p) => p ?? ""),
  );
  const [consent, setConsent] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState("");
  const upload = async () => {
    if (!file) return;
    setState("Uploading…");
    try {
      const blob = await compress(file);
      const r = await fetch(
        `/api/admin/photo?t=${encodeURIComponent(t.id)}&consent=yes`,
        {
          method: "POST",
          headers: { "Content-Type": "image/jpeg" },
          body: blob,
        },
      );
      const v = await r.json();
      if (!r.ok) throw new Error(v.error);
      setFile(null);
      setConsent(false);
      await reload();
      setState("Photo saved.");
    } catch (e) {
      setState((e as Error).message);
    }
  };
  return (
    <>
      <form
        className="panel p-4 md:p-7 space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          void act(
            { action: "podium", places: places.map((p) => p || null) },
            "Final positions saved. They show on the website and player profiles.",
          );
        }}
      >
        <h3 className="text-xl font-bold">Final positions</h3>
        <p className="text-slate-400 -mt-3">
          {auto
            ? "Confirmed by an organizer when the league was finished. Change them only if needed."
            : "Enter who finished 1st, 2nd and 3rd in the knockout (eFootball app)."}
        </p>
        <div className="grid gap-5 md:grid-cols-3">
          {["1st — Champion", "2nd — Runner-up", "3rd"].map((label, i) => (
            <label className="block" key={label}>
              {label}
              <select
                className="control-input"
                value={places[i]}
                onChange={(e) => {
                  const next = [...places];
                  next[i] = e.target.value;
                  setPlaces(next);
                }}
              >
                <option value="">— Not set —</option>
                {approved.map((a) => (
                  <option
                    key={a.player_id}
                    value={a.player_id}
                    disabled={
                      places.includes(a.player_id) && places[i] !== a.player_id
                    }
                  >
                    {a.gaming_name} ({a.code})
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
        <div className="om-footer">
          <span />
          <button className="button-primary">Apply</button>
        </div>
      </form>
      <section className="panel p-4 md:p-7 space-y-4">
        <h3 className="text-xl font-bold">Champion photo</h3>
        <p className="text-slate-400">
          Shown on the Champions shelf. Upload only after the player agrees.
          Photos are resized automatically.
        </p>
        {data.photo && (
          <div className="flex flex-wrap items-end gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/admin/photo?t=${encodeURIComponent(t.id)}&v=${data.photo}`}
              alt="Current champion photo"
              className="om-photo"
            />
            <button
              className="button-secondary"
              onClick={() =>
                confirm("Remove the champion photo?") &&
                void act({ action: "remove_photo" }, "Photo removed.")
              }
            >
              Remove photo
            </button>
          </div>
        )}
        <input
          key={data.photo ?? 0}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="control-input"
          aria-label="Choose champion photo"
        />
        <label className="om-check">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
          />{" "}
          The player agreed to this photo being shown on the website
        </label>
        <div className="om-footer">
          <span role="status" className="text-sm text-slate-400">
            {state}
          </span>
          <button
            type="button"
            className="button-primary"
            disabled={!file || !consent}
            onClick={() => void upload()}
          >
            Apply
          </button>
        </div>
      </section>
    </>
  );
}
