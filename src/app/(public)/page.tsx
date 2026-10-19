import Link from "next/link";
import { getPublicAnnouncements } from "@/lib/announcements";
import { communityLinks } from "@/lib/community";
export const dynamic = "force-dynamic";
export default async function Home() {
  const announcements = await getPublicAnnouncements();
  return (
    <div className="page-shell py-12 space-y-12">
      <section className="max-w-2xl">
        <p className="eyebrow">XGAMER / 2.0</p>
        <h1 className="text-5xl md:text-7xl font-bold">
          Your next rivalry starts here.
        </h1>
        <p className="text-slate-300 my-6">
          Join our eFootball community. Apply to play and follow the latest
          league updates.
        </p>
        <div className="flex flex-wrap gap-4">
          <Link href="/register" className="button-primary">
            Register to play ↗
          </Link>
          <a
            href={communityLinks[0].href}
            className="button-secondary"
            target="_blank"
            rel="noopener noreferrer"
          >
            Join Discord ↗
          </a>
        </div>
      </section>
      <section aria-labelledby="announcements">
        <h2 id="announcements" className="text-3xl mb-5">
          Announcements
        </h2>
        {announcements === null ? (
          <p>Updates are temporarily unavailable. Check back shortly.</p>
        ) : announcements.length ? (
          <div className="space-y-4">
            {announcements.map((a) => (
              <article key={a.id} className="panel p-6">
                <h3 className="text-xl font-semibold">{a.title}</h3>
                <p className="mt-3 whitespace-pre-wrap break-words">
                  {a.message}
                </p>
              </article>
            ))}
          </div>
        ) : (
          <p>League updates will appear here when published.</p>
        )}
      </section>
    </div>
  );
}
