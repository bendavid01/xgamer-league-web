"use client";
import type { Act, Home } from "./types";
import { PageHead } from "./ui";

const OPS = [
  // Approving or rejecting players is for main admins only.
  ["registrations", "View and contact players"],
  ["results", "Enter scores"],
  ["announcements", "Post announcements"],
] as const;

/** Coordinator access (main admins): who helps, and with what. */
export default function OmAccess({ data, act }: { data: Home; act: Act }) {
  return (
    <>
      <PageHead
        title="Coordinator access"
        sub="Helpers get only what you tick, in every tournament. They can never delete players or change roles."
      />
      <section className="panel p-4 md:p-7 space-y-6">
        {data.coordinators.length > 0 ? (
          <ul className="space-y-2">
            {data.coordinators.map((c) => (
              <li
                key={c.discord_id}
                className="om-card flex flex-wrap justify-between gap-2"
              >
                <span className="font-mono">{c.discord_id}</span>
                <span className="text-sm text-slate-400">
                  {c.active
                    ? c.operations
                        .map((o) => OPS.find(([k]) => k === o)?.[1] ?? o)
                        .join(", ") || "No access"
                    : "Access removed"}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-slate-400">No coordinators yet.</p>
        )}
        <form
          className="om-card"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void act(
              {
                action: "coordinator",
                discordId: f.get("discordId"),
                operations: f.getAll("operations"),
                active: f.get("active") === "on",
              },
              "Coordinator access saved.",
            );
          }}
        >
          <h2 className="text-lg font-bold mb-2">
            Add or change a coordinator
          </h2>
          <label className="block">
            Discord user ID (numbers)
            <input
              className="control-input"
              name="discordId"
              pattern="[0-9]{17,20}"
              inputMode="numeric"
              required
            />
          </label>
          <div className="om-checks mt-4">
            {OPS.map(([op, label]) => (
              <label className="om-check" key={op}>
                <input type="checkbox" name="operations" value={op} /> {label}
              </label>
            ))}
            <label className="om-check">
              <input type="checkbox" name="active" defaultChecked /> Access
              enabled (untick to remove)
            </label>
          </div>
          <div className="om-footer">
            <span />
            <button className="button-primary">Apply</button>
          </div>
        </form>
      </section>
    </>
  );
}
