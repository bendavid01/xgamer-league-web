/** Decorative Champions artwork (no data). Hidden from screen readers. */

// Leaf angles along the left branch, bottom to top (SVG degrees, y down).
const LEAVES = [114, 134, 154, 174, 194, 214, 234];
const at = (deg: number) => {
  const r = (deg * Math.PI) / 180;
  return [60 + 42 * Math.cos(r), 50 + 42 * Math.sin(r)].map((v) =>
    v.toFixed(1),
  );
};

export function LaurelTrophy({
  tone = "gold",
  className,
}: {
  tone?: "gold" | "muted";
  className?: string;
}) {
  const gold = tone === "gold";
  const [sx, sy] = at(LEAVES[0] - 6);
  const [ex, ey] = at(LEAVES[LEAVES.length - 1] + 4);
  return (
    <svg
      viewBox="0 0 120 100"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {gold && (
        <defs>
          <linearGradient id="xg-cup-gold" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fef3c7" />
            <stop offset="0.45" stopColor="#fbbf24" />
            <stop offset="1" stopColor="#b45309" />
          </linearGradient>
          <linearGradient id="xg-leaf-gold" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fde68a" />
            <stop offset="1" stopColor="#d97706" />
          </linearGradient>
        </defs>
      )}
      {[false, true].map((mirror) => (
        <g
          key={String(mirror)}
          transform={mirror ? "translate(120 0) scale(-1 1)" : undefined}
        >
          <path
            d={`M${sx} ${sy}A42 42 0 0 1 ${ex} ${ey}`}
            fill="none"
            stroke={gold ? "#d97706" : "#334155"}
            strokeWidth="2"
            strokeLinecap="round"
          />
          {LEAVES.map((deg) => {
            const [x, y] = at(deg);
            return (
              <ellipse
                key={deg}
                cx={x}
                cy={y}
                rx="8.2"
                ry="3.5"
                transform={`rotate(${deg + 60} ${x} ${y})`}
                fill={gold ? "url(#xg-leaf-gold)" : "#334155"}
              />
            );
          })}
        </g>
      ))}
      <g
        fill={gold ? "url(#xg-cup-gold)" : "none"}
        stroke={gold ? "none" : "#64748b"}
        strokeWidth="2.4"
        strokeLinejoin="round"
      >
        <path d="M46 26H74V36C74 46 68 53 60 53C52 53 46 46 46 36Z" />
        <path d="M57 53H63V60H57Z" />
        <rect x="50" y="60" width="20" height="5" rx="1.5" />
        <rect x="46" y="65" width="28" height="5" rx="1.5" />
      </g>
      <g
        fill="none"
        stroke={gold ? "#f59e0b" : "#64748b"}
        strokeWidth="3"
        strokeLinecap="round"
      >
        <path d="M46 29H40C40 37 43 41 48 42" />
        <path d="M74 29H80C80 37 77 41 72 42" />
      </g>
      <path
        d="M60 31L62.6 36L60 41L57.4 36Z"
        fill={gold ? "#fffbeb" : "#64748b"}
        opacity={gold ? 0.85 : 0.7}
      />
    </svg>
  );
}

/** The 2–1–3 podium blocks shown while final positions are pending. */
export function PodiumSteps() {
  return (
    <div className="champ-steps" aria-hidden="true">
      <span className="champ-step champ-step-2">2</span>
      <span className="champ-step champ-step-1">1</span>
      <span className="champ-step champ-step-3">3</span>
    </div>
  );
}
