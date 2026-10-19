import { PageTitle } from "@/components/LeagueUI";
import RegistrationForm from "@/components/RegistrationForm";
export const dynamic = "force-dynamic";
export default function Register() {
  const enabled =
    process.env.REGISTRATION_ENABLED === "true" &&
    !!process.env.DATABASE_URL &&
    !!process.env.PRIVATE_DATA_KEY;
  return (
    <div className="page-shell py-12">
      <PageTitle
        label="YOUR NEXT CHAPTER"
        title="Earn your place."
        description="XGamer 2.0 • October 24, 2026. Sixty-four competitors. One road to the final."
      />
      <div className="grid lg:grid-cols-[1fr_1.2fr] gap-10 mt-10">
        <aside>
          <div className="text-8xl font-black text-cyan-200">
            64<span className="text-3xl text-slate-500"> / 08</span>
          </div>
          <h2 className="text-3xl mt-6">
            The field is limited.
            <br />
            Your ambition isn’t.
          </h2>
          <p className="text-slate-400 leading-7 mt-5">
            Play four different opponents in the league phase. Climb the unified
            standings. Reach the top eight to qualify for the knockout rounds.
          </p>
          <p className="notice mt-8">
            An organizer verifies your contact and game identity before
            approval. Keep your player ID safe; it stays with your registration.
          </p>
        </aside>
        <RegistrationForm enabled={enabled} />
      </div>
    </div>
  );
}
