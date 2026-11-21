"use client";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import OmLayer from "./OmLayer";
import s from "./om.module.css";

export type JumpItem = {
  id: string;
  group: "Pages" | "Tournaments" | "Players";
  label: string;
  hint?: string;
  mono?: boolean;
  run: () => void;
};

/** Ctrl+K / ⌘K: jump to a page, a tournament or a player. */
export default function OmQuickJump({
  open,
  onClose,
  items,
  loading,
}: {
  open: boolean;
  onClose: () => void;
  items: JumpItem[];
  loading: boolean;
}) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();

  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    const hits = term
      ? items.filter((i) =>
          `${i.label} ${i.hint ?? ""}`.toLowerCase().includes(term),
        )
      : items.filter((i) => i.group !== "Players");
    return hits.slice(0, 40);
  }, [items, q]);

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    input.current?.focus();
    return () => {
      if (opener?.isConnected) opener.focus();
    };
  }, [open]);

  if (!open) return null;
  const pick = (i: JumpItem) => {
    onClose();
    setQ("");
    setActive(0);
    i.run();
  };
  const close = () => {
    onClose();
    setQ("");
    setActive(0);
  };
  return (
    <OmLayer>
      <div
        className={s.overlay}
        onMouseDown={(e) => e.target === e.currentTarget && close()}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Quick jump"
          className={s.jump}
        >
          <div className={s.jumpField}>
            <Search size={18} aria-hidden="true" />
            <input
              ref={input}
              role="combobox"
              aria-expanded="true"
              aria-controls={listId}
              aria-activedescendant={
                results[active] ? `${listId}-${active}` : undefined
              }
              aria-label="Search pages, tournaments and players"
              placeholder="Search pages, tournaments, players or XG IDs…"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setActive(0);
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") close();
                else if (e.key === "ArrowDown")
                  setActive((a) => Math.min(a + 1, results.length - 1));
                else if (e.key === "ArrowUp")
                  setActive((a) => Math.max(a - 1, 0));
                else if (e.key === "Enter" && results[active])
                  pick(results[active]);
                else if (e.key === "Tab") e.preventDefault();
                else return;
                e.preventDefault();
              }}
            />
            <kbd className={s.kbd}>Esc</kbd>
          </div>
          <ul id={listId} role="listbox" className={s.jumpList}>
            {results.map((item, i) => {
              const head = i === 0 || results[i - 1].group !== item.group;
              return (
                <li key={item.id} role="presentation">
                  {head && <p className={s.jumpGroup}>{item.group}</p>}
                  <div
                    id={`${listId}-${i}`}
                    role="option"
                    aria-selected={i === active}
                    className={s.jumpItem}
                    onMouseEnter={() => setActive(i)}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      pick(item);
                    }}
                  >
                    <span className={item.mono ? s.xgid : ""}>
                      {item.label}
                    </span>
                    {item.hint && (
                      <span className={s.jumpHint}>{item.hint}</span>
                    )}
                  </div>
                </li>
              );
            })}
            {!results.length && (
              <li className={s.jumpEmpty}>
                {loading ? "Loading players…" : "No matches."}
              </li>
            )}
            {q.trim() === "" && (
              <li className={s.jumpEmpty}>
                Type to search players by name, team or XG ID.
              </li>
            )}
          </ul>
        </div>
      </div>
    </OmLayer>
  );
}
