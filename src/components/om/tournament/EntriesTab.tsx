"use client";
import { useState } from "react";
import ReturningPlayers, {
  NewPlayerApplications,
} from "@/components/RegistrationRequests";
import { FILTERS, SOURCE_TAG, fieldOpenFor } from "../labels";
import OmDrawer from "../OmDrawer";
import PlayerDetails from "../player/PlayerDetails";
import { ContactButton } from "../player/WhatsAppSection";
import type { Act, Workspace } from "../types";
import { Tabs, XgId, type TabDef } from "../ui";

/** Entries & Roster: the roster, new-player applications and returning players. */
export default function EntriesTab({
  data,
  act,
  reload,
  changed,
}: {
  data: Workspace;
  act: Act;
  reload: () => Promise<void>;
  changed: () => void;
}) {
  const t = data.tournament;
  const can = (op: string) =>
    data.user.role === "admin" || data.user.operations.includes(op);
  const rosterOpen =
    ["draft", "open", "locked"].includes(t.status) && !data.fixtures.length;
  const subs: TabDef[] = [
    ...(can("registrations")
      ? [
          {
            key: "roster",
            label: "Roster",
            count: data.applications.filter((a) => a.status === "pending")
              .length,
          },
        ]
      : []),
    ...(data.newPlayerRequests
      ? [
          {
            key: "new",
            label: "New applications",
            count: data.newPlayerRequests.length,
          },
        ]
      : []),
    ...(data.returningRequests
      ? [
          {
            key: "returning",
            label: "Returning players",
            count: data.returningRequests.length,
          },
        ]
      : []),
  ];
  const [sub, setSub] = useState(subs[0]?.key ?? "roster");
  const current = subs.some((x) => x.key === sub) ? sub : subs[0]?.key;
  return (
    <div className="space-y-5">
      {subs.length > 1 && (
        <Tabs
          sub
          label="Entries"
          tabs={subs}
          value={current ?? ""}
          onChange={setSub}
        />
      )}
      {current === "roster" && (
        <Roster data={data} act={act} reload={reload} changed={changed} />
      )}
      {current === "new" && data.newPlayerRequests && (
        <NewPlayerApplications
          requests={data.newPlayerRequests}
          rosterOpen={rosterOpen}
          act={act}
          nextXgId={data.nextAvailableXgId}
        />
      )}
      {current === "returning" && data.returningRequests && (
        <ReturningPlayers
          requests={data.returningRequests}
          rosterOpen={rosterOpen}
          act={act}
        />
      )}
    </div>
  );
}

function Roster({
  data,
  act,
  reload,
  changed,
}: {
  data: Workspace;
  act: Act;
  reload: () => Promise<void>;
  changed: () => void;
}) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number][0]>("pending");
  const [details, setDetails] = useState<string | null>(null);
  const canDetails =
    data.user.role === "admin" ||
    data.user.operations.includes("registrations");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const fieldOpen = fieldOpenFor(data.tournament.status);
  const admin = data.user.role === "admin";
  const visible = data.applications.filter(
    (a) => filter === "all" || a.status === filter,
  );
  const items = () =>
    data.applications
      .filter((a) => selected.has(a.id))
      .map(({ id, revision }) => ({ id, revision }));
  const [reason, setReason] = useState("");
  const review = async (status: string, verified: boolean, done: string) => {
    if (
      await act(
        { action: "review", status, verified, items: items(), reason },
        done,
      )
    ) {
      setSelected(new Set());
      setReason("");
    }
  };
  const detailsName = data.applications.find(
    (a) => a.player_id === details,
  )?.gaming_name;
  return (
    <section className="panel p-4 md:p-6 space-y-5" aria-label="Roster">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Show">
        {FILTERS.map(([key, label]) => (
          <button
            key={key}
            className={`om-chip ${filter === key ? "om-chip-on" : ""}`}
            aria-pressed={filter === key}
            onClick={() => {
              setFilter(key);
              setSelected(new Set());
            }}
          >
            {label}
            <span className="om-chip-count">
              {key === "all"
                ? data.applications.length
                : data.applications.filter((a) => a.status === key).length}
            </span>
          </button>
        ))}
      </div>
      {!fieldOpen && (
        <p className="notice">
          Fixtures exist, so player changes are locked. Reset fixtures (before
          any score) to change players.
        </p>
      )}
      <OmDrawer
        open={!!details}
        onClose={() => setDetails(null)}
        title="Player details"
        subtitle={detailsName}
      >
        {details && (
          <PlayerDetails
            key={details}
            tournament={data.tournament.id}
            playerId={details}
            changed={async () => {
              await reload();
              changed();
            }}
          />
        )}
      </OmDrawer>
      {admin && fieldOpen && selected.size > 0 && (
        <div className="om-bulk">
          <label className="block w-full">
            Reason for this decision
            <textarea
              className="control-input"
              rows={2}
              minLength={10}
              maxLength={300}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <span className="block text-xs text-slate-400">
              Recorded in the activity log. Leave phone numbers, verification
              codes and credentials out of this note.
            </span>
          </label>
          <button
            className="button-primary"
            disabled={reason.trim().length < 10}
            onClick={() => {
              if (
                confirm(
                  "Approve the selected players? Confirm you verified them on WhatsApp.",
                )
              )
                void review(
                  "approved",
                  true,
                  "Approved. They now appear on the website.",
                );
            }}
          >
            Approve selected ({selected.size})
          </button>
          <button
            className="button-secondary"
            disabled={reason.trim().length < 10}
            onClick={() => void review("rejected", false, "Rejected.")}
          >
            Reject selected
          </button>
          <button
            className="button-secondary"
            onClick={() => setSelected(new Set())}
          >
            Clear
          </button>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="control-table om-table">
          <thead>
            <tr>
              <th>
                <input
                  type="checkbox"
                  aria-label="Select all shown"
                  disabled={!fieldOpen || !admin}
                  checked={
                    visible.length > 0 &&
                    visible.every((a) => selected.has(a.id))
                  }
                  onChange={(e) =>
                    setSelected(
                      e.target.checked
                        ? new Set(visible.map((a) => a.id))
                        : new Set(),
                    )
                  }
                />
              </th>
              <th>Player</th>
              <th>WhatsApp</th>
              <th>Status</th>
              <th>eFootball ID</th>
              {admin && <th className="sr-only">Remove</th>}
            </tr>
          </thead>
          <tbody>
            {visible.map((a) => (
              <tr key={a.id}>
                <td>
                  <input
                    type="checkbox"
                    aria-label={`Select ${a.gaming_name}`}
                    disabled={!fieldOpen || !admin}
                    checked={selected.has(a.id)}
                    onChange={(e) => {
                      const next = new Set(selected);
                      if (e.target.checked) next.add(a.id);
                      else next.delete(a.id);
                      setSelected(next);
                    }}
                  />
                </td>
                <td>
                  <strong>{a.gaming_name}</strong>
                  <span className="block text-xs text-slate-400">
                    {a.team_name ?? "Team not recorded"} ·{" "}
                    <XgId code={a.code} />
                    {a.team_name_source && (
                      <span className="om-source">
                        {SOURCE_TAG[a.team_name_source]}
                      </span>
                    )}
                  </span>
                  {canDetails && (
                    <button
                      className="om-link"
                      onClick={() => setDetails(a.player_id)}
                    >
                      Edit details
                    </button>
                  )}
                </td>
                <td data-label="WhatsApp">
                  {a.contact && (
                    <span className="whitespace-nowrap">
                      <span className="font-mono">{a.contact}</span>{" "}
                      <ContactButton
                        tournament={data.tournament.id}
                        playerId={a.player_id}
                        purpose="registration_check"
                      />
                    </span>
                  )}
                </td>
                <td>
                  <span className={`om-status om-${a.status}`}>{a.status}</span>
                </td>
                <td data-label="eFootball ID">
                  <span className="font-mono">{a.efootballId ?? "—"}</span>
                </td>
                {admin && (
                  <td>
                    <button
                      className="om-danger"
                      disabled={!fieldOpen}
                      title={
                        fieldOpen
                          ? "Remove from this tournament"
                          : "Reset fixtures first"
                      }
                      onClick={() => {
                        if (
                          confirm(
                            `Remove ${a.gaming_name} from ${data.tournament.name}? This is recorded in the activity log.`,
                          )
                        )
                          void act(
                            {
                              action: "remove",
                              id: a.id,
                              revision: a.revision,
                            },
                            `${a.gaming_name} removed.`,
                          );
                      }}
                    >
                      Remove
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {!visible.length && (
          <p className="text-slate-400 py-6">Nobody here yet.</p>
        )}
      </div>
    </section>
  );
}
