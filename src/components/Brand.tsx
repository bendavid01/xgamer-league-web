export function XMark({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 80 80"
      fill="none"
      aria-hidden="true"
    >
      <path d="M6 8h20l17 21-12 15L6 14V8Z" fill="#67e8f9" />
      <path d="M54 8h20v6L26 72H6v-6L54 8Z" fill="#67e8f9" />
      <path d="m49 45 25 21v6H54L38 53l11-8Z" fill="#a78bfa" />
      <path d="m56 25 14-17h4v6L60 31l-4-6Z" fill="white" />
    </svg>
  );
}
export default function Brand() {
  return (
    <span className="brand">
      <XMark className="brand-mark" />
      <span>
        <span className="brand-name">
          XGAMER<span className="text-cyan-300">.</span>
        </span>
        <span className="brand-caption">PRO LEAGUE / 2.0</span>
      </span>
    </span>
  );
}
