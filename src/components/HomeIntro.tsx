"use client";

import { useRef } from "react";
import Link from "next/link";
import { Trophy, Swords } from "lucide-react"; // Ensure icons are imported here
import gsap from "gsap";
import { useGSAP } from "@gsap/react";

export default function HomeIntro() {
  // 1. Create a container ref to scope animations (best performance)
  const containerRef = useRef<HTMLDivElement>(null);

  // 2. The Animation Logic
  useGSAP(() => {
    const tl = gsap.timeline({ defaults: { ease: "power2.out" } });

    // Badge: Pop in
    tl.from(".hero-badge", {
      y: -20,
      opacity: 0,
      duration: 0.6,
      ease: "back.out(1.7)"
    })
    // Title: Slide up + Fade
    .from(".hero-title", {
      y: 30,
      opacity: 0,
      duration: 0.8,
      stagger: 0.1
    }, "-=0.4")
    // Cards: Staggered entrance from bottom
    .from(".dashboard-card", {
      y: 50,
      opacity: 0,
      duration: 0.8,
      stagger: 0.15,
      clearProps: "all" // Fixes conflicts with hover effects after animation
    }, "-=0.4");

  }, { scope: containerRef }); // Scope ensures we only animate elements inside this component

  return (
    <div ref={containerRef} className="max-w-7xl mx-auto px-4 py-12 flex flex-col justify-center min-h-[85vh]">
      
      {/* Header */}
      <div className="mb-12 text-center space-y-4">
        <span className="hero-badge inline-block py-1 px-3 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs font-mono tracking-widest uppercase">
          ● Season 1 is Live
        </span>
        <h1 className="hero-title text-4xl md:text-6xl font-black text-white tracking-tighter">
          WELCOME TO THE <br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-500">
            ARENA
          </span>
        </h1>
      </div>

      {/* Dashboard Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 max-w-4xl mx-auto w-full">
        
        {/* Match Center Card */}
        <Link 
          href="/matches"
          className="dashboard-card group relative h-64 md:h-80 rounded-3xl overflow-hidden border border-slate-800 bg-slate-900/50 hover:border-cyan-500/50 transition-all duration-300"
        >
          <div className="absolute inset-0 bg-gradient-to-b from-transparent to-slate-950/90 z-10" />
          <div className="absolute bottom-0 left-0 p-6 z-20">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 rounded-lg bg-cyan-500/20 text-cyan-400">
                <Swords size={24} />
              </div>
              <span className="text-cyan-400 font-mono text-sm tracking-wider">MATCH CENTER</span>
            </div>
            <h3 className="text-2xl font-bold text-white mb-1 group-hover:text-cyan-400 transition-colors">
              View Matches
            </h3>
            <p className="text-slate-400 text-sm">Live scores, schedules & results</p>
          </div>
        </Link>

        {/* Leaderboard Card */}
        <Link 
          href="/table"
          className="dashboard-card group relative h-64 md:h-80 rounded-3xl overflow-hidden border border-slate-800 bg-slate-900/50 hover:border-purple-500/50 transition-all duration-300"
        >
          <div className="absolute inset-0 bg-gradient-to-b from-transparent to-slate-950/90 z-10" />
          <div className="absolute bottom-0 left-0 p-6 z-20">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 rounded-lg bg-purple-500/20 text-purple-400">
                <Trophy size={24} />
              </div>
              <span className="text-purple-400 font-mono text-sm tracking-wider">STANDINGS</span>
            </div>
            <h3 className="text-2xl font-bold text-white mb-1 group-hover:text-purple-400 transition-colors">
              Leaderboard
            </h3>
            <p className="text-slate-400 text-sm">Track team rankings & stats</p>
          </div>
        </Link>

      </div>
    </div>
  );
}