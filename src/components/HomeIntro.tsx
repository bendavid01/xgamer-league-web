"use client";
import Link from "next/link";
import { getImageProps } from "next/image";
import { ArrowDown, ArrowUpRight } from "lucide-react";
import { useEffect, useRef } from "react";

// Particle positions are fixed so server and client render the same markup.
const PARTICLES = [
  [8, 72, 0, 9],
  [16, 30, 2.4, 11],
  [24, 84, 4.1, 10],
  [31, 55, 1.2, 12],
  [38, 18, 5.6, 9],
  [62, 78, 0.8, 10],
  [69, 26, 3.3, 12],
  [76, 62, 6.2, 9],
  [83, 40, 1.8, 11],
  [91, 80, 4.7, 10],
  [12, 50, 7.1, 12],
  [88, 15, 2.9, 9],
] as const;

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
              yPercent: 10,
              ease: "none",
              scrollTrigger: {
                trigger: root.current,
                start: "top top",
                end: "bottom top",
                scrub: 0.7,
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

  const common = { alt: "XGamer Pro League crest", sizes: "100vw" };
  const {
    props: { srcSet: desktop },
  } = getImageProps({
    ...common,
    src: "/images/xgamer-crest-wide.webp",
    width: 1920,
    height: 1080,
    quality: 80,
  });
  const {
    props: { srcSet: mobile, ...rest },
  } = getImageProps({
    ...common,
    src: "/images/xgamer-crest-mobile.webp",
    width: 1000,
    height: 780,
    quality: 80,
    preload: true,
  });

  return (
    <section
      className="cinema-hero crest-hero"
      ref={root}
      aria-labelledby="hero-title"
    >
      <div className="hero-media" aria-hidden="false">
        <picture>
          <source media="(min-width: 768px)" srcSet={desktop} />
          <img
            {...rest}
            srcSet={mobile}
            alt="XGamer Pro League crest"
            className="hero-photo"
            fetchPriority="high"
          />
        </picture>
        <span className="crest-glow" aria-hidden="true" />
        <span className="crest-shine" aria-hidden="true" />
        <div className="hero-particles" aria-hidden="true">
          {PARTICLES.map(([x, y, delay, duration], i) => (
            <span
              key={i}
              style={
                {
                  left: `${x}%`,
                  top: `${y}%`,
                  animationDelay: `${delay}s`,
                  animationDuration: `${duration}s`,
                } as React.CSSProperties
              }
            />
          ))}
        </div>
      </div>
      <div className="hero-shade" />
      <div className="hero-topline">
        <span>XGAMER PRO LEAGUE / 2.0</span>
        <span>eFOOTBALL. REAL RIVALRIES.</span>
      </div>
      <h1 id="hero-title" className="sr-only">
        XGamer Pro League — competitive eFootball
      </h1>
      <div className="hero-bottom">
        <a className="scroll-cue" href="#whats-on">
          <ArrowDown size={19} />
          <span>WHAT’S ON NOW</span>
        </a>
        <div className="hero-description">
          <p>
            Organised eFootball leagues and cups.
            <br />
            Register, get confirmed on WhatsApp,
            <br />
            then follow every fixture and table here.
          </p>
          <Link className="button-primary hero-join" href="/register">
            Register now <ArrowUpRight size={18} />
          </Link>
          <Link className="hero-sub-link" href="/tournaments">
            Fixtures &amp; tables ↗
          </Link>
        </div>
      </div>
      <span className="hero-corner" aria-hidden="true">
        +
      </span>
    </section>
  );
}
