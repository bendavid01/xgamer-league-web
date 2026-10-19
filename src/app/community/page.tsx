import Link from "next/link";
import { PageTitle } from "@/components/LeagueUI";
export default function Community() {
  const invite = process.env.NEXT_PUBLIC_DISCORD_INVITE_URL;
  const valid =
    invite &&
    /^https:\/\/(discord\.gg\/|discord\.com\/invite\/)[a-zA-Z0-9-]+$/.test(
      invite,
    );
  return (
    <div className="page-shell py-12">
      <PageTitle
        label="BEYOND THE MATCH"
        title="Find your people."
        description="Match arrangements, score evidence and community updates belong with the league organizers."
      />
      <div className="grid md:grid-cols-2 gap-5">
        <article className="panel p-7">
          <p className="eyebrow">DISCORD</p>
          <h2 className="text-2xl font-bold mb-4">The community hub</h2>
          <p className="text-slate-400 leading-relaxed">
            Discord sign-in, verified tournament roles and match notifications
            are awaiting integration setup.
          </p>
          {valid ? (
            <a
              href={invite}
              target="_blank"
              rel="noopener noreferrer"
              className="button-primary mt-6"
            >
              Join Discord
            </a>
          ) : (
            <p className="mt-6 text-sm text-amber-300">
              Official invite not configured yet.
            </p>
          )}
        </article>
        <article className="panel p-7">
          <p className="eyebrow">WHATSAPP</p>
          <h2 className="text-2xl font-bold mb-4">A personal update</h2>
          <p className="text-slate-400 leading-relaxed">
            Phone guests will be verified manually by an administrator.
            Organizers send WhatsApp updates manually after approval and
            consent. No bot, automatic messages or phone verification is
            connected.
          </p>
          <Link className="inline-block text-cyan-300 mt-6" href="/register">
            Guest registration availability →
          </Link>
        </article>
      </div>
    </div>
  );
}
