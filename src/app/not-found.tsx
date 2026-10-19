import Link from "next/link";
export default function NotFound() {
  return (
    <div className="page-shell py-20">
      <p className="eyebrow">404</p>
      <h1 className="page-title">Outside the arena.</h1>
      <p className="text-slate-400 my-6">
        This page or participant could not be found.
      </p>
      <Link className="button-primary" href="/">
        Back to the arena
      </Link>
    </div>
  );
}
