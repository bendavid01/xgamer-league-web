"use client";
import { useState } from "react";
import { RotateCcw, Trash2 } from "lucide-react";
import { formatChoice, tournamentLabel, type FormatChoice } from "@/lib/labels";
import { PHASE, fieldOpenFor, shortDate } from "../labels";
import type { Act, Competitions, Workspace } from "../types";
import { Choice, FormatChoices, PublishSwitch } from "../ui";
import NewTournament from "./NewTournament";

/** Setup & Announcements: settings, registration, next season, delete, updates. */
export default function SetupTab({
  data,
  act,
  competitions,
}: {
  data: Workspace;
  act: Act;
  competitions: Competitions;
}) {
  const t = data.tournament;
  const admin = data.user.role === "admin";
  const canAnnounce = admin || data.user.operations.includes("announcements");
  const [rerun, setRerun] = useState(false);
  return (
    <div className="space-y-6">
      {admin && t.status === "completed" && (
        <section className="panel p-4 md:p-7">
          <h3 className="text-xl font-bold">Next season</h3>
          {!rerun ? (
            <>
              <p className="text-slate-400 mt-1">
                Start a new tournament with these settings. Players register
                again.
              </p>
              <button
                className="button-secondary mt-4"
                onClick={() => setRerun(true)}
              >
                <RotateCcw size={16} aria-hidden="true" /> Run again as next
                season
              </button>
            </>
          ) : (
            <div className="mt-4">
              <NewTournament
                competitions={competitions}
                act={act}
                cancel={() => setRerun(false)}
                from={t}
              />
            </div>
          )}
        </section>
      )}
      {admin && <Settings data={data} act={act} />}
      {canAnnounce && <Announcements data={data} act={act} />}
      {admin && <DeleteTournament data={data} act={act} />}
    </div>
  );
}

function Settings({ data, act }: { data: Workspace; act: Act }) {
  const t = data.tournament;
  const fieldOpen = fieldOpenFor(t.status);
  const [format, setFormat] = useState<FormatChoice>(formatChoice(t));
  const [seasonal, setSeasonal] = useState(!!t.season);
  const [published, setPublished] = useState(t.published);
  const closesLocal = t.registration_closes
    ? new Date(new Date(t.registration_closes).getTime() + 5.5 * 3600e3)
        .toISOString()
        .slice(0, 16)
    : "";
  return (
    <>
      <section className="panel p-4 md:p-7">
        <h3 className="text-xl font-bold">Registration</h3>
        <p className="text-slate-400 mt-1">
          {PHASE[t.status]}
          {!t.published &&
            t.status === "draft" &&
            " · Opening registration also publishes it on the website."}
        </p>
        <div className="flex flex-wrap gap-3 mt-4">
          <button
            className="button-primary"
            disabled={!fieldOpen || t.status === "open"}
            onClick={() =>
              void act(
                { action: "registration", open: true },
                "Registration is open on the website.",
              )
            }
          >
            Open registration
          </button>
          <button
            className="button-secondary"
            disabled={!fieldOpen || t.status !== "open"}
            onClick={() =>
              void act(
                { action: "registration", open: false },
                "Registration closed.",
              )
            }
          >
            Close registration
          </button>
        </div>
      </section>

      <form
        className="panel p-4 md:p-7 space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const num = (k: string) =>
            f.get(k) === "" || f.get(k) === null ? null : Number(f.get(k));
          const closes = String(f.get("registrationCloses") ?? "");
          void act(
            {
              action: "configure",
              revision: t.revision,
              name: f.get("name"),
              season: seasonal ? num("season") : null,
              published,
              format,
              qualifiers: Number(f.get("qualifiers") ?? t.qualifiers),
              legs: Number(f.get("legs") ?? t.legs),
              perPlayer: format !== "knockout" ? num("perPlayer") : null,
              startsOn: f.get("startsOn") || null,
              registrationCloses: closes ? `${closes}:00+05:30` : null,
              entryFee: num("entryFee"),
              prize: f.get("prize") ?? "",
              description: f.get("description") ?? "",
            },
            "Settings saved.",
          );
        }}
      >
        <h3 className="text-xl font-bold">Tournament settings</h3>
        <div className="flex flex-wrap gap-3">
          <Choice
            name="setupType"
            value="oneoff"
            label="One-off cup"
            checked={!seasonal}
            onChange={() => setSeasonal(false)}
          />
          <Choice
            name="setupType"
            value="season"
            label="Season of a competition"
            checked={seasonal}
            onChange={() => setSeasonal(true)}
          />
        </div>
        <div className="grid gap-5 md:grid-cols-[1fr_12rem]">
          <label className="block">
            {seasonal ? "Competition name" : "Tournament name"}
            <input
              name="name"
              defaultValue={t.competition ?? t.name}
              required
              minLength={2}
              maxLength={80}
              className="control-input"
            />
          </label>
          {seasonal && (
            <label className="block">
              Season number
              <input
                name="season"
                type="number"
                min={1}
                max={999}
                required
                defaultValue={t.season ?? 1}
                className="control-input"
                inputMode="numeric"
              />
            </label>
          )}
        </div>
        <PublishSwitch value={published} onChange={setPublished} />
        <fieldset
          disabled={!fieldOpen}
          className="space-y-5 disabled:opacity-60"
        >
          {!fieldOpen && (
            <p className="text-sm text-amber-200">
              Format settings are locked because fixtures exist.
            </p>
          )}
          <FormatChoices
            value={format}
            onChange={setFormat}
            name="formatChoice"
          />
          {format !== "knockout" && (
            <>
              <div>
                <p className="mb-2">League matches</p>
                <div className="flex flex-wrap gap-3">
                  <Choice
                    name="legs"
                    value="1"
                    label="Single (play each opponent once)"
                    defaultChecked={t.legs === 1}
                  />
                  <Choice
                    name="legs"
                    value="2"
                    label="Home & away (twice)"
                    defaultChecked={t.legs === 2}
                  />
                </div>
              </div>
              <label className="block">
                Matches per player{" "}
                <span className="text-slate-500">
                  (optional — empty means everyone plays everyone)
                </span>
                <input
                  name="perPlayer"
                  type="number"
                  min={1}
                  max={127}
                  defaultValue={t.opponents ?? ""}
                  className="control-input"
                  inputMode="numeric"
                />
              </label>
              {format === "league_knockout" && (
                <label className="block">
                  Players who qualify for the knockout
                  <select
                    name="qualifiers"
                    defaultValue={t.qualifiers}
                    className="control-input"
                  >
                    {[2, 4, 8, 16, 32].map((q) => (
                      <option key={q} value={q}>
                        Top {q}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </>
          )}
        </fieldset>
        <h3 className="text-xl font-bold pt-2">Shown on the website</h3>
        <p className="text-sm text-slate-400 -mt-3">
          Optional. Empty fields are hidden from the website.
        </p>
        <div className="grid gap-5 md:grid-cols-2">
          <label className="block">
            Start date
            <input
              name="startsOn"
              type="date"
              defaultValue={t.starts_on ?? ""}
              className="control-input"
            />
          </label>
          <label className="block">
            Registration closes (IST)
            <input
              name="registrationCloses"
              type="datetime-local"
              defaultValue={closesLocal}
              className="control-input"
            />
          </label>
          <label className="block">
            Entry fee (₹) <span className="text-slate-500">0 = free</span>
            <input
              name="entryFee"
              type="number"
              min={0}
              defaultValue={t.entry_fee ?? ""}
              className="control-input"
              inputMode="numeric"
            />
          </label>
          <label className="block">
            Prize
            <input
              name="prize"
              maxLength={80}
              defaultValue={t.prize ?? ""}
              className="control-input"
              placeholder="₹5,000 prize pool"
            />
          </label>
        </div>
        <label className="block">
          Short description
          <textarea
            name="description"
            maxLength={400}
            rows={3}
            defaultValue={t.description ?? ""}
            className="control-input"
          />
        </label>
        <div className="om-footer">
          <span />
          <button className="button-primary">Apply</button>
        </div>
      </form>
    </>
  );
}

function DeleteTournament({ data, act }: { data: Workspace; act: Act }) {
  const t = data.tournament;
  const [confirmName, setConfirmName] = useState("");
  const label = tournamentLabel(t);
  return (
    <section className="panel p-4 md:p-7 om-danger-zone">
      <h3 className="text-xl font-bold">Delete tournament</h3>
      <p className="text-slate-400 mt-1">
        Removes it from the website and the Organizer Manager. It stays in the
        activity log and can be restored from the tournament list.
      </p>
      <label className="block mt-4">
        Type <strong className="text-white">{label}</strong> to confirm
        <input
          className="control-input"
          value={confirmName}
          onChange={(e) => setConfirmName(e.target.value)}
          autoComplete="off"
        />
      </label>
      <div className="om-footer">
        <span />
        <button
          className="om-danger-button"
          disabled={
            ![t.name, label].some(
              (n) => n.toLowerCase() === confirmName.trim().toLowerCase(),
            )
          }
          onClick={() =>
            void act(
              { action: "delete_tournament", confirm: confirmName },
              `${label} deleted. Restore it from the tournament list if needed.`,
            )
          }
        >
          <Trash2 size={16} aria-hidden="true" /> Delete tournament
        </button>
      </div>
    </section>
  );
}

function Announcements({ data, act }: { data: Workspace; act: Act }) {
  return (
    <div className="space-y-4">
      <form
        className="panel p-4 md:p-7 space-y-5"
        onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const f = new FormData(form);
          if (
            await act(
              {
                action: "announce",
                title: f.get("title"),
                message: f.get("message"),
              },
              "Update posted on the website.",
            )
          )
            form.reset();
        }}
      >
        <h3 className="text-xl font-bold">Post an announcement</h3>
        <p className="text-sm text-slate-400 -mt-3">
          Shows in the tournament&apos;s Updates tab on the website, newest
          first.
        </p>
        <label className="block">
          Title
          <input
            name="title"
            required
            maxLength={120}
            className="control-input"
          />
        </label>
        <label className="block">
          Message
          <textarea
            required
            name="message"
            maxLength={2000}
            className="control-input"
            rows={5}
          />
        </label>
        <div className="om-footer">
          <span />
          <button className="button-primary">Apply</button>
        </div>
      </form>
      {data.announcements.map((a) => (
        <article key={a.id} className="panel p-5">
          <p className="text-xs text-slate-500">{shortDate(a.created_at)}</p>
          <h4 className="font-semibold">{a.title}</h4>
          <p className="text-slate-300 mt-2 whitespace-pre-wrap">{a.message}</p>
        </article>
      ))}
    </div>
  );
}
