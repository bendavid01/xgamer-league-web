"use client";
import { useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { communityLinks } from "@/lib/community";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
const filters = ["All channels", "Connect", "Watch", "Follow"] as const;
export default function CommunityChannels() {
  const [filter, setFilter] = useState<string>("All channels");
  const reduced = useReducedMotion();
  const channels = communityLinks.filter(
    (link) => filter === "All channels" || link.category === filter,
  );
  return (
    <section aria-label="Official community channels" className="mt-12">
      <div className="flex flex-wrap items-center justify-between gap-5 mb-6">
        <h2 className="text-2xl font-bold">Your way into XGamer.</h2>
        <div
          className="channel-filters"
          role="group"
          aria-label="Filter channels"
        >
          {filters.map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={filter === item}
              onClick={() => setFilter(item)}
            >
              {item}
            </button>
          ))}
        </div>
      </div>
      <p className="sr-only" role="status">
        {channels.length} channels shown
      </p>
      <div className="relative grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <AnimatePresence initial={false} mode="popLayout">
          {channels.map((link) => (
            <motion.div
              key={link.name}
              layout={!reduced}
              initial={{ opacity: 0, y: reduced ? 0 : 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{
                duration: reduced ? 0 : 0.22,
                layout: { type: "spring", stiffness: 340, damping: 32 },
              }}
            >
              <a
                className="channel-card panel h-full"
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                key={link.name}
              >
                <div className="flex justify-between items-start">
                  <span className="channel-mark">{link.mark}</span>
                  <ArrowUpRight size={20} aria-hidden="true" />
                </div>
                <p className="text-xs text-cyan-300 mt-8 mb-2 uppercase tracking-widest">
                  {link.category}
                </p>
                <h3 className="text-2xl font-bold">{link.name}</h3>
                <p className="text-sm text-slate-400 leading-relaxed mt-3 flex-1">
                  {link.description}
                </p>
                <span className="text-sm font-semibold mt-7">
                  {link.action}
                  <span className="sr-only"> (opens in a new tab)</span>
                </span>
              </a>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </section>
  );
}
