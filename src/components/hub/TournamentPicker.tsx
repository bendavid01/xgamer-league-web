"use client";
import { useRouter } from "next/navigation";

type Option = { id: string; label: string };

/** The tournament selector at the top of the Tournaments hub. */
export default function TournamentPicker({
  groups,
  current,
}: {
  groups: { label: string; items: Option[] }[];
  current: string;
}) {
  const router = useRouter();
  return (
    <form action="/tournaments" className="hub-picker">
      <label htmlFor="hub-t" className="hub-picker-label">
        Tournament
      </label>
      <select
        id="hub-t"
        name="t"
        defaultValue={current}
        onChange={(e) =>
          router.push(`/tournaments?t=${encodeURIComponent(e.target.value)}`)
        }
      >
        {groups
          .filter((g) => g.items.length)
          .map((g) => (
            <optgroup key={g.label} label={g.label}>
              {g.items.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </optgroup>
          ))}
      </select>
      <noscript>
        <button className="button-secondary">Show</button>
      </noscript>
    </form>
  );
}
