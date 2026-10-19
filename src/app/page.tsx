import HomeIntro from "@/components/HomeIntro";
import EditorialReveal from "@/components/EditorialReveal";
import { XMark } from "@/components/Brand";
import { MatchCard, Unavailable } from "@/components/LeagueUI";
import { getLeague } from "@/lib/league";
import { communityLinks } from "@/lib/community";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
export const revalidate = 30;
export default async function Home() {
  const { teams, matches, available } = await getLeague();
  const featured = [
    ...matches.filter((m) => m.status === "live"),
    ...matches.filter((m) => m.status === "scheduled"),
    ...matches.filter((m) => m.status === "completed").reverse(),
  ].slice(0, 3);
  return (
    <div className="editorial-home">
      <HomeIntro />
      <div className="panel flex flex-wrap items-center justify-between gap-5 p-6 my-5">
        <div>
          <p className="eyebrow !mb-2">OCTOBER 24 / THE NEXT CHAPTER</p>
          <h2 className="text-2xl md:text-3xl font-semibold">
            64 players. Eight finalists. One champion.
          </h2>
        </div>
        <Link href="/cup" className="button-primary">
          Explore the October Cup <ArrowUpRight size={18} />
        </Link>
      </div>
      <div className="arena-strip">
        <span>PLAY WITH PURPOSE.</span>
        <XMark />
        <span>COMPETE WITH RESPECT.</span>
        <XMark />
        <span>MAKE IT YOURS.</span>
      </div>
      <section id="the-league" className="league-story page-shell">
        <EditorialReveal>
          <div className="section-index">
            <span>01 / THE LEAGUE</span>
            <span>ONE COMMUNITY. EVERY RIVALRY.</span>
          </div>
          <h2 className="statement">
            More than
            <br />a <span>final score.</span>
          </h2>
        </EditorialReveal>
        <div className="story-bottom">
          <div className="story-emblem" aria-hidden="true">
            <XMark />
            <span>BUILT FOR THE GAME</span>
          </div>
          <div>
            <p className="story-copy">
              The tension before kick-off. The comeback nobody saw coming. The
              rival who makes you better. This is where your next chapter
              begins.
            </p>
            <Link href="/players" className="editorial-link">
              Meet the competitors <ArrowUpRight size={20} />
            </Link>
          </div>
        </div>
        <div className="editorial-stats">
          {[
            [teams.length, "PARTICIPANTS"],
            [matches.length, "FIXTURES"],
            [matches.filter((m) => m.status === "completed").length, "RESULTS"],
          ].map(([n, label]) => (
            <div key={label}>
              <strong>
                {available ? n : "—"}
                <small>/</small>
              </strong>
              <span>{label}</span>
            </div>
          ))}
        </div>
      </section>
      <section className="arena-section">
        <div className="page-shell">
          <EditorialReveal>
            <div className="section-index">
              <span>02 / MATCH CENTER</span>
              <span>EVERY FIXTURE. EVERY FINISH.</span>
            </div>
            <div className="section-heading">
              <h2>
                Inside
                <br />
                <i>the arena.</i>
              </h2>
              <Link href="/matches" className="editorial-link">
                All matches <ArrowUpRight size={20} />
              </Link>
            </div>
          </EditorialReveal>
          {!available ? (
            <Unavailable />
          ) : featured.length ? (
            <div className="grid md:grid-cols-3 gap-4">
              {featured.map((m) => (
                <MatchCard key={m._id} match={m} />
              ))}
            </div>
          ) : (
            <div className="fixture-empty">
              <span className="fixture-symbol" aria-hidden="true">
                ↗
              </span>
              <div>
                <span className="section-index">THE NEXT KICK-OFF</span>
                <h3>
                  The stage is set.
                  <br />
                  The next rivalry is coming.
                </h3>
                <p>Fixtures appear here when the organizers publish them.</p>
              </div>
              <Link href="/competitions" className="button-secondary">
                Explore competitions <ArrowUpRight size={18} />
              </Link>
            </div>
          )}
        </div>
      </section>
      <section className="page-shell journey-section">
        <EditorialReveal>
          <div className="section-index">
            <span>03 / YOUR NEXT MOVE</span>
            <span>THERE’S A PLACE FOR YOU HERE.</span>
          </div>
          <h2 className="statement">
            Raise
            <br />
            <i>your game.</i>
          </h2>
        </EditorialReveal>
        <div className="journey-rows">
          {[
            [
              "01",
              "Find your competition",
              "From the first round to the final whistle.",
              "/competitions",
            ],
            [
              "02",
              "Follow the climb",
              "Standings, points and the pursuit of the top.",
              "/table",
            ],
            [
              "03",
              "Step into the league",
              "Explore entry and verification details.",
              "/register",
            ],
          ].map(([n, title, copy, href]) => (
            <Link href={href} key={n} className="journey-row">
              <span>{n}</span>
              <div>
                <h3>{title}</h3>
                <p>{copy}</p>
              </div>
              <ArrowUpRight />
            </Link>
          ))}
        </div>
      </section>
      <section className="community-finale page-shell">
        <div className="section-index">
          <span>04 / BEYOND THE GAME</span>
          <span>XGAMER / ALWAYS CONNECTED</span>
        </div>
        <EditorialReveal>
          <h2>
            Find your people.
            <br />
            <i>Fuel your rivalry.</i>
          </h2>
        </EditorialReveal>
        <div className="finale-bottom">
          <p>
            The final whistle is just the beginning.
            <br />
            Meet the community. Arrange your next match.
            <br />
            Come back stronger.
          </p>
          <a
            href={communityLinks[0].href}
            target="_blank"
            rel="noopener noreferrer"
            className="button-primary"
          >
            Join our Discord <ArrowUpRight size={18} />
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
          <Link href="/community" className="editorial-link">
            All eight channels <ArrowUpRight size={20} />
          </Link>
        </div>
        <XMark className="finale-mark" />
      </section>
    </div>
  );
}
