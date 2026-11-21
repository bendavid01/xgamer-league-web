"use client";
import { useState } from "react";
import { ACTION_LABEL, shortDate } from "./labels";
import type { AuditRow } from "./types";
import { PageHead } from "./ui";
import s from "./om.module.css";

const roleOf = (a: AuditRow) =>
  a.actor_role ??
  (a.actor === "guest" ? "player" : /^\d+$/.test(a.actor) ? "admin" : "");
const whoOf = (a: AuditRow) =>
  a.actor_name ?? (a.actor === "guest" ? "Player" : a.actor);
const whatOf = (a: AuditRow) => a.summary ?? ACTION_LABEL[a.action] ?? a.action;

/** Append-only activity history (main admins). Search filters the loaded rows. */
export default function OmAudit({ rows }: { rows: AuditRow[] }) {
  const [q, setQ] = useState("");
  const term = q.trim().toLowerCase();
  const shown = term
    ? rows.filter((a) =>
        [
          whoOf(a),
          roleOf(a),
          whatOf(a),
          a.action,
          a.affected,
          a.tournament_name,
        ]
          .join(" ")
          .toLowerCase()
          .includes(term),
      )
    : rows;
  return (
    <>
      <PageHead
        title="Audit Log"
        sub="Every organizer and player action, newest first. Entries can't be edited or deleted."
      />
      <section className="panel" aria-label="Activity log">
        <div className={s.panelHead}>
          <input
            type="search"
            className={`control-input !mt-0 ${s.search}`}
            placeholder="Search who, what, player or tournament"
            aria-label="Search the activity log"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <span className={s.panelHint} aria-live="polite">
            {term
              ? `${shown.length} of ${rows.length} recent entries`
              : `${rows.length} most recent entries`}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className={`control-table om-log ${s.numTable}`}>
            <thead>
              <tr>
                <th>When</th>
                <th>Who</th>
                <th>What</th>
                <th>Affected</th>
                <th>Tournament</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((a) => {
                const role = roleOf(a);
                return (
                  <tr key={a.id}>
                    <td className="whitespace-nowrap">
                      {shortDate(a.created_at)}
                    </td>
                    <td>
                      <span title={a.actor}>{whoOf(a)}</span>
                      {role && (
                        <span className={`om-role om-role-${role}`}>
                          {role}
                        </span>
                      )}
                    </td>
                    <td>{whatOf(a)}</td>
                    <td>{a.affected ?? "—"}</td>
                    <td>{a.tournament_name ?? "—"}</td>
                    <td>
                      <details>
                        <summary>Before / after</summary>
                        <pre className="text-xs whitespace-pre-wrap break-all max-w-md">
                          {JSON.stringify(
                            { before: a.before_value, after: a.after_value },
                            null,
                            2,
                          )}
                        </pre>
                      </details>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!rows.length && <p className={s.empty}>Nothing recorded yet.</p>}
          {rows.length > 0 && !shown.length && (
            <p className={s.empty}>No entry matches “{q}”.</p>
          )}
        </div>
      </section>
    </>
  );
}
