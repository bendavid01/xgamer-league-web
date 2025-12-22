import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Trophy, ShieldCheck } from "lucide-react";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "X-Gamer Pro League",
  description: "Official eFootball Tournament Tracker",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-void text-slate-100 antialiased`}>
        
        {/* Navbar */}
        <header className="fixed top-0 w-full z-50 border-b border-glass-border bg-glass-surface backdrop-blur-md">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              
              {/* Logo */}
              <div className="flex items-center gap-2">
                <Trophy className="h-6 w-6 text-neon-cyan" />
                <span className="font-bold text-xl tracking-wider text-white">
                  X-GAMER <span className="text-neon-purple">LEAGUE</span>
                </span>
              </div>

              {/* Security Badge */}
              <div className="flex items-center gap-2 text-xs text-slate-400 border border-slate-800 px-3 py-1 rounded-full bg-slate-950/50">
                <ShieldCheck className="h-3 w-3 text-green-400" />
                <span>SECURE</span>
              </div>
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="pt-20 pb-10 min-h-screen relative z-10">
            {children}
        </main>

        {/* Footer */}
        <footer className="border-t border-glass-border bg-slate-950 py-6 mt-auto">
          <div className="text-center text-slate-500 text-sm">
            <p>&copy; 2024 X-Gamer League. Secure & Static PWA.</p>
          </div>
        </footer>

      </body>
    </html>
  );
}