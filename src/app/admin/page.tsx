import ControlCenter from "@/components/ControlCenter";
import { signOut } from "@/auth";
export const dynamic = "force-dynamic";
export default function Admin() {
  return (
    <ControlCenter
      signOutAction={async () => {
        "use server";
        await signOut({ redirectTo: "/" });
      }}
    />
  );
}
