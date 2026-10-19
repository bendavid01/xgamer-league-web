import type { Metadata } from "next";
import Link from "next/link";
export const metadata: Metadata = {
  title: { default: "XGamer Organizer", template: "%s | XGamer Organizer" },
  description: "Private organizer workspace",
  robots: { index: false, follow: false },
  openGraph: {
    title: "XGamer Organizer",
    description: "Private organizer workspace",
  },
};
export default function OrganizerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-800 p-5 flex justify-between">
        <Link href="/admin">XGamer / Organizer</Link>
        <Link href="/">Public site ↗</Link>
      </header>
      <main id="content">{children}</main>
    </div>
  );
}
