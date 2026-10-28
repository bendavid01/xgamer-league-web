import type { Tournament } from "@/lib/content";

/**
 * Animated diagram of the published format: every slot → qualifiers → bracket → champion.
 * WHY: built only from published numbers, so it redraws when organizers change the format.
 * Pure SVG + CSS (no client JS); reduced-motion users see the finished state.
 */
const W = 400,
  H = 240,
  CHAMP_X = 384;

type Point = { x: number; y: number };

// WHY: at least 8 rows whenever possible, so each qualifier gets its own row/lane.
function pipLayout(n: number) {
  const cols = Math.max(1, Math.ceil(n / 8));
  const rows = Math.ceil(n / cols);
  const gap = Math.min(18, 196 / Math.max(rows, cols));
  const width = (cols - 1) * gap,
    height = (rows - 1) * gap;
  const x0 = 70 - width / 2,
    y0 = H / 2 - height / 2;
  return {
    cols,
    rows,
    pips: Array.from({ length: n }, (_, i) => ({
      x: x0 + (i % cols) * gap,
      y: y0 + Math.floor(i / cols) * gap,
    })),
  };
}

/** Evenly spaced column of nodes centred vertically. */
function column(count: number, x: number, spacing: number): Point[] {
  const top = H / 2 - ((count - 1) * spacing) / 2;
  return Array.from({ length: count }, (_, i) => ({ x, y: top + i * spacing }));
}

/** One illustrative qualifier per row, scattered across columns. */
function chosen(cols: number, rows: number, q: number) {
  return Array.from({ length: q }, (_, i) => {
    const row = Math.floor((i * rows) / q);
    return row * cols + ((i * 3 + 1) % cols);
  });
}

const elbow = (a: Point, b: Point) => {
  const mx = (a.x + b.x) / 2;
  return `M${a.x} ${a.y} H${mx} V${b.y} H${b.x}`;
};

export default function FormatFunnel({
  tournament,
}: {
  tournament: Tournament;
}) {
  const n = tournament.playersNeeded;
  const q =
    tournament.format === "league_knockout"
      ? tournament.qualifiers
      : tournament.format === "knockout"
        ? Math.min(8, n)
        : null;
  const { pips, cols, rows } = pipLayout(n);
  const picked = q
    ? chosen(cols, rows, q)
    : Array.from({ length: rows }, (_, r) => r * cols + ((r * 3 + 1) % cols));
  const qualifiers = q ? column(q, 196, Math.min(26, 200 / q)) : [];

  // Knockout rounds from the qualifier column down to the final.
  const rounds: Point[][] = [qualifiers];
  if (q) {
    const span = CHAMP_X - 30 - 196;
    const steps = Math.log2(q);
    for (let r = 1; r <= steps; r++) {
      const prev = rounds[r - 1];
      rounds.push(
        Array.from({ length: prev.length / 2 }, (_, i) => ({
          x: 196 + (span * r) / steps,
          y: (prev[2 * i].y + prev[2 * i + 1].y) / 2,
        })),
      );
    }
  }
  const final = q ? rounds[rounds.length - 1][0] : null;
  const champion = { x: CHAMP_X, y: final?.y ?? H / 2 };

  // WHY: lines leave from the grid's edge on the qualifier's row, so they never cross other pips.
  const edge = Math.max(...pips.map((p) => p.x)) + 9;
  const fromRow = (p: Point) => ({ x: edge, y: p.y });
  const feed = q
    ? picked.map((p, i) => elbow(fromRow(pips[p]), qualifiers[i]))
    : picked.map((p) => elbow(fromRow(pips[p]), champion));
  const bracket: { d: string; round: number }[] = [];
  for (let r = 1; r < rounds.length; r++)
    rounds[r].forEach((node, i) => {
      bracket.push({ d: elbow(rounds[r - 1][2 * i], node), round: r });
      bracket.push({ d: elbow(rounds[r - 1][2 * i + 1], node), round: r });
    });
  if (final)
    bracket.push({
      d: `M${final.x} ${final.y} H${champion.x}`,
      round: rounds.length,
    });

  const description = q
    ? `${n} players, the top ${q} reach a knockout bracket, one champion.`
    : `${n} players play a league; the top of the table is champion.`;

  return (
    <figure className="funnel" aria-label={description}>
      <svg viewBox={`0 0 ${W} ${H}`} aria-hidden="true" className="funnel-svg">
        <defs>
          <radialGradient id="champ-glow">
            <stop offset="0%" stopColor="#c4b5fd" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#a78bfa" stopOpacity="0" />
          </radialGradient>
        </defs>
        {pips.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={n > 32 ? 3.2 : 4.2}
            className={picked.includes(i) ? "pip pip-picked" : "pip"}
            style={{ "--i": i } as React.CSSProperties}
          />
        ))}
        {feed.map((d, i) => (
          <path
            key={d}
            d={d}
            pathLength={1}
            className="funnel-line"
            style={{ "--i": i } as React.CSSProperties}
          />
        ))}
        {bracket.map(({ d, round }, i) => (
          <path
            key={`${d}-${i}`}
            d={d}
            pathLength={1}
            className="bracket-line"
            style={{ "--r": round } as React.CSSProperties}
          />
        ))}
        {qualifiers.map((p, i) => (
          <circle
            key={`q${i}`}
            cx={p.x}
            cy={p.y}
            r={4.5}
            className="q-node"
            style={{ "--i": i } as React.CSSProperties}
          />
        ))}
        <circle
          cx={champion.x}
          cy={champion.y}
          r={18}
          fill="url(#champ-glow)"
          className="champ-glow"
        />
        <path
          className="champ-star"
          transform={`translate(${champion.x} ${champion.y})`}
          d="M0 -8 L2.4 -2.5 L8 -2.5 L3.5 1 L5.2 7 L0 3.6 L-5.2 7 L-3.5 1 L-8 -2.5 L-2.4 -2.5 Z"
        />
      </svg>
      <figcaption className="funnel-labels">
        <span style={{ left: `${(70 / W) * 100}%` }}>{n} players</span>
        {q && (
          <span style={{ left: `${(196 / W) * 100}%` }}>
            {tournament.format === "knockout" ? "Last 8" : `Top ${q}`}
          </span>
        )}
        <span
          style={{ left: `${(CHAMP_X / W) * 100}%` }}
          className="funnel-champ"
        >
          Champion
        </span>
      </figcaption>
    </figure>
  );
}
