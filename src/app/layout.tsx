import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar"; // ✅ The new Navbar

const inter = Inter({ subsets: ["latin"] });

// ✅ Keep your metadata
export const metadata: Metadata = {
  title: "X-Gamer Pro League",
  description: "Official eFootball Tournament Tracker",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <div className="min-h-screen bg-slate-950 text-slate-200 selection:bg-cyan-500/30 flex flex-col">
          
          {/* ✅ New Global Navigation */}
          <Navbar /> 
          
          {/* Main Content */}
          <main className="flex-grow">
            {children}
          </main>

          {/* Footer (Restored) */}
          <footer className="border-t border-slate-800/50 bg-slate-950 py-6 mt-auto">
            <div className="text-center text-slate-500 text-sm">
              <p>&copy; 2026 X-Gamer League. Secure & Static PWA.</p>
            </div>
          </footer>

        </div>
      </body>
    </html>
  );
}