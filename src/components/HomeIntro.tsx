"use client";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowUpRight, Trophy } from "lucide-react";
export default function HomeIntro() {
  const reduced = useReducedMotion();
  return (
    <section className="hero relative grid lg:grid-cols-[1.2fr_1fr] items-center gap-12 py-14 md:py-24">
      <div>
        <p className="eyebrow">
          X-GAMER PRO LEAGUE <span className="text-slate-500">/ 2.0</span>
        </p>
        <h1 className="hero-title">
          YOUR GAME.
          <br />
          YOUR <span className="text-cyan-300">LEGACY.</span>
        </h1>
        <p className="text-slate-400 max-w-lg text-lg leading-relaxed mt-6">
          One community. Every rivalry. The home of competitive eFootball, from
          the first fixture to the final whistle.
        </p>
        <div className="flex flex-wrap gap-3 mt-8">
          <Link className="button-primary" href="/competitions">
            Explore competitions <ArrowUpRight size={18} />
          </Link>
          <Link className="button-secondary" href="/matches">
            Match center
          </Link>
        </div>
        <p className="text-xs text-slate-500 mt-6">
          Public scores and standings · No account needed
        </p>
      </div>
      <motion.div
        initial={false}
        animate={reduced ? {} : { y: [0, -7, 0] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        className="arena-art"
        aria-hidden="true"
      >
        <div className="pitch">
          <div className="pitch-center" />
          <div className="pitch-goal left" />
          <div className="pitch-goal right" />
        </div>
        <div className="trophy-mark">
          <Trophy size={76} strokeWidth={1.2} />
        </div>
        <span className="art-label">THE NEXT CHAPTER</span>
        <span className="art-number">02</span>
      </motion.div>
    </section>
  );
}
