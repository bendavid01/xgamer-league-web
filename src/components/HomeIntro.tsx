"use client";
import Link from "next/link";
import {
  motion,
  useReducedMotion,
  useMotionValue,
  useSpring,
} from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import { XMark } from "@/components/Brand";
export default function HomeIntro() {
  const reduced = useReducedMotion();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotateX = useSpring(y, { stiffness: 140, damping: 24 });
  const rotateY = useSpring(x, { stiffness: 140, damping: 24 });
  return (
    <section className="hero relative grid lg:grid-cols-[1.2fr_1fr] items-center gap-12 py-14 md:py-24">
      <div className="hero-copy">
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
          <Link className="insight-link" href="/community">
            Find your community →
          </Link>
        </div>
        <p className="text-xs text-slate-500 mt-6">
          Public scores and standings · No account needed
        </p>
      </div>
      <motion.div
        initial={false}
        style={{ rotateX, rotateY, transformPerspective: 900 }}
        onPointerMove={(e) => {
          if (reduced || e.pointerType !== "mouse") return;
          const rect = e.currentTarget.getBoundingClientRect();
          x.set(((e.clientX - rect.left) / rect.width - 0.5) * 8);
          y.set(-((e.clientY - rect.top) / rect.height - 0.5) * 8);
        }}
        onPointerLeave={() => {
          x.set(0);
          y.set(0);
        }}
        className="arena-art"
        aria-hidden="true"
      >
        <div className="pitch">
          <div className="pitch-center" />
          {[
            [18, 30],
            [28, 65],
            [43, 20],
            [52, 55],
            [72, 35],
            [80, 70],
          ].map(([left, top], i) => (
            <span
              className="pitch-player"
              key={i}
              style={{
                left: `${left}%`,
                top: `${top}%`,
                animationDelay: `${i * 90}ms`,
              }}
            />
          ))}
          <div className="pitch-goal left" />
          <div className="pitch-goal right" />
        </div>
        <div className="trophy-mark">
          <XMark className="arena-emblem" />
        </div>
        <span className="art-label">THE NEXT CHAPTER</span>
        <span className="art-number">02</span>
      </motion.div>
    </section>
  );
}
