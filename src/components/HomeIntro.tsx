"use client";
import Link from "next/link";
import Image from "next/image";
import { ArrowDown, ArrowUpRight } from "lucide-react";
import { useEffect, useRef } from "react";
import { XMark } from "@/components/Brand";
import arena from "../../public/images/arena.jpg";
export default function HomeIntro() {
  const root = useRef<HTMLElement>(null);
  useEffect(() => {
    let dispose = () => {};
    let cancelled = false;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    async function start() {
      if (media.matches || !window.matchMedia("(min-width: 768px)").matches)
        return;
      const [{ gsap }, { ScrollTrigger }] = await Promise.all([
        import("gsap"),
        import("gsap/ScrollTrigger"),
      ]);
      if (cancelled || media.matches) return;
      gsap.registerPlugin(ScrollTrigger);
      const context = gsap.context(() => {
        const mm = gsap.matchMedia();
        mm.add(
          "(min-width: 768px) and (prefers-reduced-motion: no-preference)",
          () => {
            gsap.to(".hero-photo", {
              yPercent: 12,
              ease: "none",
              scrollTrigger: {
                trigger: root.current,
                start: "top top",
                end: "bottom top",
                scrub: 0.7,
              },
            });
            gsap.to(".hero-orbit", {
              rotation: 65,
              ease: "none",
              scrollTrigger: {
                trigger: root.current,
                start: "top top",
                end: "bottom top",
                scrub: 0.8,
              },
            });
          },
        );
        return () => mm.revert();
      }, root);
      dispose = () => context.revert();
    }
    void start();
    const changed = () => {
      dispose();
      if (!media.matches) void start();
    };
    media.addEventListener("change", changed);
    return () => {
      cancelled = true;
      dispose();
      media.removeEventListener("change", changed);
    };
  }, []);
  return (
    <section className="cinema-hero" ref={root}>
      <Image
        src={arena}
        alt="Floodlit football stadium beneath an evening sky"
        fill
        preload
        sizes="100vw"
        className="hero-photo"
        placeholder="blur"
      />
      <div className="hero-shade" />
      <div className="hero-orbit" aria-hidden="true">
        <span />
        <XMark className="orbit-mark" />
      </div>
      <div className="hero-topline">
        <span>XGAMER PRO LEAGUE / 2.0</span>
        <span>eFOOTBALL. REAL RIVALRIES.</span>
      </div>
      <div className="hero-copy">
        <h1 className="cinema-title">
          <span>Your game.</span>
          <span>Your next</span>
          <span>
            <i>great</i> rivalry.
          </span>
        </h1>
      </div>
      <div className="hero-bottom">
        <a className="scroll-cue" href="#the-league">
          <ArrowDown size={19} />
          <span>SCROLL TO THE ARENA</span>
        </a>
        <div className="hero-description">
          <p>
            For the ones who feel every goal.
            <br />A competitive eFootball community.
            <br />A place to leave your mark.
          </p>
          <Link className="button-primary" href="/competitions">
            Find your competition <ArrowUpRight size={18} />
          </Link>
          <Link className="hero-sub-link" href="/matches">
            Match center ↗
          </Link>
        </div>
      </div>
      <span className="hero-corner" aria-hidden="true">
        +
      </span>
    </section>
  );
}
