import OrganizerGate from "@/components/OrganizerGate";
export const dynamic = "force-dynamic";
export default function Layout({ children }: { children: React.ReactNode }) {
  return <OrganizerGate>{children}</OrganizerGate>;
}
