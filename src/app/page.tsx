import HomeIntro from "@/components/HomeIntro";

export default function Home() {
  return (
    <main className="min-h-screen bg-void bg-cyber-grid bg-fixed">
      {/* HomeIntro handles the Hero animation.
        It is a client component, but 'page.tsx' remains a Server Component.
      */}
      <HomeIntro />
    </main>
  );
}