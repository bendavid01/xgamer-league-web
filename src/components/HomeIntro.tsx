"use client";
import Link from "next/link";
import { getImageProps } from "next/image";
import { ArrowDown, ArrowUpRight } from "lucide-react";
import { useEffect, useRef } from "react";

export default function HomeIntro() {
  const root = useRef<HTMLElement>(null);
  useEffect(() => {
    const hero = root.current;
    if (!hero || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver(([entry]) => {
      hero.dataset.inView = String(entry.isIntersecting);
    });
    observer.observe(hero);
    return () => observer.disconnect();
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
      <div className="hero-media">
        <div className="hero-atmosphere" aria-hidden="true" />
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
        <span className="crest-shine" aria-hidden="true" />
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
            Organised eFootball leagues and cups. Register, get confirmed on
            WhatsApp, and follow every fixture here.
          </p>
          <Link className="button-primary hero-join" href="/register">
            Register now <ArrowUpRight size={18} />
          </Link>
          <Link className="hero-sub-link" href="/tournaments">
            Fixtures &amp; tables ↗
          </Link>
        </div>
      </div>
    </section>
  );
}
