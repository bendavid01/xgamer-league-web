"use client";
import { useState } from "react";
import { formatChoice, tournamentLabel, type FormatChoice } from "@/lib/labels";
import { nextSeason } from "../labels";
import type { Act, Competitions, Workspace } from "../types";
import { Choice, FormatChoices, PublishSwitch } from "../ui";

/**
 * New tournament, or "Run again as next season" (from = the finished tournament).
 * One-off cups have just a name; seasons belong to a competition.
 */
export default function NewTournament({
  competitions,
  act,
  cancel,
  from,
}: {
  competitions: Competitions;
  act: Act;
  cancel: () => void;
  from?: Workspace["tournament"];
}) {
  const fromKey = from?.competition?.toLowerCase();
  const [type, setType] = useState<"oneoff" | "season">(
    from ? "season" : "oneoff",
  );
  const [pick, setPick] = useState<string>(
    fromKey ?? (competitions.size ? [...competitions.keys()][0] : "__new"),
  );
  const [newName, setNewName] = useState(from && !fromKey ? from.name : "");
  const chosen = pick === "__new" ? undefined : competitions.get(pick);
  // A one-off cup run again becomes Season 1, so the new one is Season 2.
  const suggestion = from && !fromKey ? 2 : nextSeason(chosen);
  const [season, setSeason] = useState(String(suggestion));
  const [format, setFormat] = useState<FormatChoice>(
    from ? formatChoice(from) : "league",
  );
  const [published, setPublished] = useState(false);
  const competitionName = chosen?.name ?? newName.trim();
  const n = Number(season);
  const clash =
    type === "season" &&
    Number.isInteger(n) &&
    (chosen?.seasons.includes(n) ||
      [...competitions.values()].some(
        (c) =>
          c.name.toLowerCase() === newName.trim().toLowerCase() &&
          c.seasons.includes(n),
      ));
  return (
    <form
      className="om-card mb-6 space-y-5"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const ok = from
          ? await act(
              {
                action: "rerun",
                tournament: from.id,
                name: competitionName,
                season: n,
                published,
              },
              `${competitionName} · Season ${n} created with the same settings. Open registration in Setup & Announcements when ready.`,
            )
          : await act(
              {
                action: "create",
                name: type === "season" ? competitionName : f.get("name"),
                season: type === "season" ? n : null,
                format,
                published,
              },
              "Tournament created. Fill in the details in Setup & Announcements.",
            );
        if (ok) cancel();
      }}
    >
      <h3 className="text-lg font-bold">
        {from ? "Run again as next season" : "New tournament"}
      </h3>
      {from && (
        <p className="text-sm text-slate-400 -mt-3">
          Copies format, matches, qualifiers, entry fee, prize and description
          from {tournamentLabel(from)}. Players register again.
          {!fromKey &&
            ` ${from.name} becomes Season ${Math.max(1, n - 1) || 1}.`}
        </p>
      )}
      {!from && (
        <div>
          <p className="mb-2">Type</p>
          <div className="flex flex-wrap gap-3">
            <Choice
              name="type"
              value="oneoff"
              label="One-off cup"
              checked={type === "oneoff"}
              onChange={() => setType("oneoff")}
            />
            <Choice
              name="type"
              value="season"
              label="New season of a competition"
              checked={type === "season"}
              onChange={() => setType("season")}
            />
          </div>
        </div>
      )}
      {type === "oneoff" ? (
        <label className="block">
          Tournament name
          <input
            name="name"
            required
            minLength={2}
            maxLength={80}
            className="control-input"
            placeholder="XGamer Diwali Cup"
            autoFocus
          />
        </label>
      ) : (
        <div className="grid gap-5 md:grid-cols-2">
          <label className="block">
            Competition
            <select
              className="control-input"
              value={pick}
              onChange={(e) => {
                setPick(e.target.value);
                setSeason(String(nextSeason(competitions.get(e.target.value))));
              }}
            >
              {[...competitions].map(([key, c]) => (
                <option key={key} value={key}>
                  {c.name}
                </option>
              ))}
              <option value="__new">+ New competition</option>
            </select>
          </label>
          {pick === "__new" && (
            <label className="block">
              New competition name
              <input
                required
                minLength={2}
                maxLength={80}
                className="control-input"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="XGamer Pro League"
              />
            </label>
          )}
          <label className="block">
            Season number
            <input
              required
              type="number"
              min={1}
              max={999}
              inputMode="numeric"
              className="control-input"
              value={season}
              onChange={(e) => setSeason(e.target.value)}
              aria-describedby="season-help"
            />
            <span id="season-help" className="block text-xs mt-1">
              {clash ? (
                <span className="text-amber-200">
                  Season {n} already exists — pick another number.
                </span>
              ) : (
                <span className="text-slate-500">
                  Suggested: Season {suggestion}
                </span>
              )}
            </span>
          </label>
        </div>
      )}
      {!from && (
        <FormatChoices value={format} onChange={setFormat} name="newFormat" />
      )}
      <PublishSwitch value={published} onChange={setPublished} />
      <div className="om-footer">
        <button type="button" className="button-secondary" onClick={cancel}>
          Cancel
        </button>
        <button className="button-primary" disabled={!!clash}>
          Apply
        </button>
      </div>
    </form>
  );
}
