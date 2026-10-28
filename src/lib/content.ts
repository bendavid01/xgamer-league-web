import { cache } from "react";
import { client } from "./sanity/client";

/**
 * Published editorial content from Sanity (CM).
 * WHY: Only published documents are read (drafts are excluded) and every reader
 * fails soft, so the site never shows invented values when Sanity is unreachable.
 */
export type TournamentFormat = "league" | "knockout" | "league_knockout";
export type TournamentStatus =
  | "announced"
  | "registration_open"
  | "registration_closed"
  | "in_progress"
  | "completed";
export type RuleCard = { title: string; items: string[] };
export type Tournament = {
  title: string;
  slug: string | null;
  status: TournamentStatus;
  game: string | null;
  startDate: string | null;
  registrationDeadline: string | null;
  summary: string | null;
  format: TournamentFormat;
  playersNeeded: number;
  leagueOpponents: number | null;
  qualifiers: number | null;
  matchRules: RuleCard[];
  entryFee: number | null;
  prize: string | null;
};
export type Announcement = {
  _id: string;
  title: string;
  message: string;
  publishedAt: string;
  pinned: boolean;
  link: { label: string; href: string } | null;
};
export type RulesPage = {
  intro: string | null;
  lastReviewed: string | null;
  sections: { heading: string; points: string[] }[];
};
export type Faq = { _id: string; question: string; answer: string };

const published = `!(_id in path("drafts.**"))`;
const options = { next: { revalidate: 30 }, timeout: 8000 } as const;

const STATUSES: TournamentStatus[] = [
  "announced",
  "registration_open",
  "registration_closed",
  "in_progress",
  "completed",
];
const FORMATS: TournamentFormat[] = ["league", "knockout", "league_knockout"];

/** Drops incomplete or malformed documents instead of guessing values. */
export function normalizeTournament(raw: unknown): Tournament | null {
  if (!raw || typeof raw !== "object") return null;
  const t = raw as Record<string, unknown>;
  const str = (v: unknown) =>
    typeof v === "string" && v.trim() ? v.trim() : null;
  const int = (v: unknown) =>
    typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : null;
  const title = str(t.title);
  const players = int(t.playersNeeded);
  if (
    !title ||
    !players ||
    !STATUSES.includes(t.status as TournamentStatus) ||
    !FORMATS.includes(t.format as TournamentFormat)
  )
    return null;
  const format = t.format as TournamentFormat;
  const rules = Array.isArray(t.matchRules) ? t.matchRules : [];
  return {
    title,
    slug: str(t.slug),
    status: t.status as TournamentStatus,
    game: str(t.game),
    startDate: str(t.startDate),
    registrationDeadline: str(t.registrationDeadline),
    summary: str(t.summary),
    format,
    playersNeeded: players,
    leagueOpponents:
      format === "league_knockout" ? int(t.leagueOpponents) || null : null,
    qualifiers: format === "league_knockout" ? int(t.qualifiers) || null : null,
    matchRules: rules
      .map((r) => {
        const card = r as { title?: unknown; items?: unknown };
        const items = Array.isArray(card.items)
          ? card.items.map(str).filter((x): x is string => !!x)
          : [];
        const cardTitle = str(card.title);
        return cardTitle && items.length ? { title: cardTitle, items } : null;
      })
      .filter((x): x is RuleCard => !!x)
      .slice(0, 6),
    entryFee: int(t.entryFee),
    prize: str(t.prize),
  };
}

export const getFeaturedTournament = cache(
  async (): Promise<{ tournament: Tournament | null; available: boolean }> => {
    try {
      const raw = await client.fetch(
        `*[_type == "tournament" && showOnHomepage == true && ${published}] | order(_updatedAt desc)[0]{
          title, "slug": slug.current, status, game, startDate, registrationDeadline, summary,
          format, playersNeeded, leagueOpponents, qualifiers, matchRules[]{title, items}, entryFee, prize
        }`,
        {},
        options,
      );
      return { tournament: normalizeTournament(raw), available: true };
    } catch {
      console.error("Tournament content unavailable");
      return { tournament: null, available: false };
    }
  },
);

export const getAnnouncements = cache(
  async (limit = 5): Promise<Announcement[] | null> => {
    try {
      const rows = await client.fetch<Announcement[]>(
        `*[_type == "announcement" && ${published} && defined(title) && defined(message) && publishedAt <= now()]
          | order(pinned desc, publishedAt desc)[0...$limit]{
          _id, title, message, publishedAt, "pinned": coalesce(pinned, false),
          "link": select(defined(link.label) && defined(link.href) => {"label": link.label, "href": link.href}, null)
        }`,
        { limit },
        options,
      );
      return (rows ?? []).map((a) => {
        const href = a.link ? safeHref(a.link.href) : null;
        return { ...a, link: a.link && href ? { ...a.link, href } : null };
      });
    } catch {
      console.error("Announcements unavailable");
      return null;
    }
  },
);

export const getRulesContent = cache(
  async (): Promise<{ page: RulesPage | null; faqs: Faq[] }> => {
    try {
      const data = await client.fetch<{
        page: RulesPage | null;
        faqs: Faq[] | null;
      }>(
        `{
          "page": *[_type == "rulesPage" && _id == "rulesPage"][0]{
            intro, lastReviewed, "sections": coalesce(sections[defined(heading)]{heading, "points": coalesce(points, [])}, [])
          },
          "faqs": *[_type == "faq" && ${published} && defined(question) && defined(answer)] | order(order asc, _createdAt asc){_id, question, answer}
        }`,
        {},
        options,
      );
      const page =
        data.page && data.page.sections.some((s) => s.points.length)
          ? data.page
          : null;
      return { page, faqs: data.faqs ?? [] };
    } catch {
      console.error("Rules content unavailable");
      return { page: null, faqs: [] };
    }
  },
);

/** Only https or same-site links may be rendered from CMS content. */
export function safeHref(href: string) {
  if (href.startsWith("/") && !href.startsWith("//")) return href;
  try {
    return new URL(href).protocol === "https:" ? href : null;
  } catch {
    return null;
  }
}

const FORMAT_LABEL: Record<TournamentFormat, string> = {
  league: "League",
  knockout: "Knockout",
  league_knockout: "League + Knockout",
};

/** Plain-language format facts derived only from published values. */
export function describeFormat(t: Tournament) {
  const n = t.playersNeeded;
  const facts: string[] = [];
  if (t.format === "league") {
    facts.push(`Round robin: everyone plays everyone once`);
    facts.push(`${n - 1} matches per player`);
  } else if (t.format === "knockout") {
    const rounds = Math.ceil(Math.log2(n));
    facts.push(`Single elimination — lose once and you're out`);
    facts.push(`${rounds} rounds to win the cup`);
  } else {
    facts.push(
      t.leagueOpponents
        ? `League phase: ${t.leagueOpponents} matches per player`
        : `League phase: everyone plays everyone once`,
    );
    if (t.qualifiers)
      facts.push(`Top ${t.qualifiers} qualify for the knockout`);
  }
  return { label: FORMAT_LABEL[t.format], facts };
}

const IST = "Asia/Kolkata";
export function formatDate(value: string | null, withTime = false) {
  if (!value) return null;
  // WHY: Sanity "date" fields have no time zone; anchor them to midday IST.
  const date = new Date(
    /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00+05:30` : value,
  );
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: IST,
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "numeric", minute: "2-digit" } : {}),
  }).format(date);
}

export function formatRupees(value: number | null) {
  if (value === null) return null;
  return value === 0
    ? "Free"
    : `₹${new Intl.NumberFormat("en-IN").format(value)}`;
}

export type CallToAction = {
  label: string;
  href: string;
  external: boolean;
  note: string | null;
};

/** One primary action, driven by the published tournament status. */
export function primaryAction(
  t: Tournament | null,
  discord: string,
): CallToAction {
  switch (t?.status) {
    case "registration_open":
      return {
        label: "Register now",
        href: "/register",
        external: false,
        note: t.registrationDeadline
          ? `Registration closes ${formatDate(t.registrationDeadline, true)}`
          : null,
      };
    case "registration_closed":
      return {
        label: "View tournament",
        href: "/tournament",
        external: false,
        note: "Registration is closed",
      };
    case "in_progress":
      return {
        label: "Fixtures & results",
        href: "/matches",
        external: false,
        note: "Tournament in progress",
      };
    case "completed":
      return {
        label: "Final standings",
        href: "/table",
        external: false,
        note: "Tournament completed",
      };
    default:
      return {
        label: "Get updates on Discord",
        href: discord,
        external: true,
        note: t ? "Registration opens soon" : null,
      };
  }
}
