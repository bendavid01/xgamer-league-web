import RegistrationForm from "@/components/RegistrationForm";
import { registrationConfigured } from "@/lib/configuration";
export const dynamic = "force-dynamic";
export default function Register() {
  return (
    <div className="page-shell py-12 max-w-2xl">
      <h1 className="text-4xl font-bold">Register to play</h1>
      <p className="text-slate-300 my-6">
        Send your application. An organizer will verify your entry before
        approval.
      </p>
      <RegistrationForm enabled={registrationConfigured()} />
    </div>
  );
}
