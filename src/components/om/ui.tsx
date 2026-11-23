"use client";
import { useRef, type ReactNode } from "react";
import { FORMAT_CHOICES, FORMAT_LABEL, type FormatChoice } from "@/lib/labels";
import s from "./om.module.css";

export type TabDef = { key: string; label: string; count?: number };

/** Accessible tab strip: arrow keys move between tabs, Home/End jump. */
export function Tabs({
  tabs,
  value,
  onChange,
  label,
  sub = false,
}: {
  tabs: TabDef[];
  value: string;
  onChange: (v: string) => void;
  label: string;
  sub?: boolean;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const move = (i: number) => {
    const n = (i + tabs.length) % tabs.length;
    refs.current[n]?.focus();
    onChange(tabs[n].key);
  };
  return (
    <div role="tablist" aria-label={label} className={sub ? s.subtabs : s.tabs}>
      {tabs.map((t, i) => (
        <button
          key={t.key}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          role="tab"
          id={`tab-${t.key}`}
          aria-selected={t.key === value}
          tabIndex={t.key === value ? 0 : -1}
          className={s.tab}
          onClick={(e) => {
            // On phones the strip scrolls: bring a half-hidden tab fully into view.
            e.currentTarget.scrollIntoView({ block: "nearest", inline: "nearest" });
            onChange(t.key);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") move(i + 1);
            else if (e.key === "ArrowLeft") move(i - 1);
            else if (e.key === "Home") move(0);
            else if (e.key === "End") move(tabs.length - 1);
            else return;
            e.preventDefault();
          }}
        >
          {t.label}
          {t.count !== undefined && t.count > 0 && (
            <span className={s.count}>{t.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}

export function Choice(props: {
  name: string;
  value: string;
  label: string;
  defaultChecked?: boolean;
  checked?: boolean;
  onChange?: () => void;
}) {
  const { label, ...input } = props;
  return (
    <label className="om-choice">
      <input type="radio" {...input} /> {label}
    </label>
  );
}

export function FormatChoices({
  value,
  onChange,
  name,
}: {
  value: FormatChoice;
  onChange: (f: FormatChoice) => void;
  name: string;
}) {
  return (
    <div>
      <p className="mb-2">Format</p>
      <div className="flex flex-wrap gap-3">
        {FORMAT_CHOICES.map((f) => (
          <Choice
            key={f}
            name={name}
            value={f}
            label={FORMAT_LABEL[f]}
            checked={value === f}
            onChange={() => onChange(f)}
          />
        ))}
      </div>
    </div>
  );
}

export function PublishSwitch({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="om-switch">
      <input
        type="checkbox"
        role="switch"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span aria-hidden="true" className="om-switch-track" />
      <span>
        Publish on website{" "}
        <span className="text-slate-400 text-sm">
          {value ? "— visible to everyone" : "— only organizers can see it"}
        </span>
      </span>
    </label>
  );
}

/** Error and success lines used by every self-contained panel. */
export function Feedback({ error, notice }: { error: string; notice: string }) {
  return (
    <>
      {error && (
        <p role="alert" className="notice text-amber-200">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="notice text-cyan-200">
          {notice}
        </p>
      )}
    </>
  );
}

/** Section heading row: title, optional description and actions on the right. */
export function PageHead({
  title,
  sub,
  children,
  id,
}: {
  title: string;
  sub?: ReactNode;
  children?: ReactNode;
  id?: string;
}) {
  return (
    <div className={s.pageHead}>
      <div className="min-w-0">
        <h1 id={id} className={s.pageTitle}>
          {title}
        </h1>
        {sub && <p className={s.pageSub}>{sub}</p>}
      </div>
      {children && <div className={s.pageActions}>{children}</div>}
    </div>
  );
}

/** Permanent XG ID, always monospace and cyan. */
export function XgId({ code }: { code: string }) {
  return <span className={s.xgid}>{code}</span>;
}
