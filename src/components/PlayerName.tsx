import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Only an XG ID has a public profile. Guests (code "GUEST") and unknown players
 * get no link, so a page never points at a profile that would 404.
 */
export const profileHref = (code: string, query = "") =>
  /^XG-\d{4,10}$/.test(code) ? `/players/${code}${query}` : null;

/** A small muted label shown next to a guest's real name. */
export function GuestBadge() {
  return (
    <span className="guest-badge" title="Single-tournament guest: no XG ID">
      Guest
    </span>
  );
}

/**
 * A player's name: a profile link for XG players, plain text plus a Guest badge
 * for guests. The guest's own name is always shown, never replaced.
 */
export function PlayerName({
  code,
  name,
  query,
  className,
  children,
  badge = true,
}: {
  code: string;
  name: string;
  query?: string;
  className?: string;
  /** Rendered instead of the name (e.g. "vs Name"). */
  children?: ReactNode;
  badge?: boolean;
}) {
  const href = profileHref(code, query);
  if (href)
    return (
      <Link href={href} className={className}>
        {children ?? name}
      </Link>
    );
  return (
    <span className={className}>
      {children ?? name}
      {badge && code === "GUEST" && (
        <>
          {" "}
          <GuestBadge />
        </>
      )}
    </span>
  );
}

/** The XG ID, or a Guest badge where a guest has none. */
export function PlayerCode({
  code,
  className,
}: {
  code: string;
  className?: string;
}) {
  return code === "GUEST" ? (
    <GuestBadge />
  ) : (
    <span className={className}>{code}</span>
  );
}
