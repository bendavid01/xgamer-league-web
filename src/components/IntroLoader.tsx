"use client";

import { useLayoutEffect, useRef } from "react";
import { usePathname } from "next/navigation";

// This function also runs inline in <head>. Keep its dependencies inside it.
function beginIntro() {
  const root = document.documentElement;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  if (location.pathname !== "/" || reduced.matches) return;
  try {
    const key = "xg:broadcast-intro:v1";
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "seen");
  } catch {
    return;
  }

  function finish() {
    root.removeAttribute("data-xg-intro");
    clearTimeout(deadline);
    document.removeEventListener("animationend", animationDone);
    document.removeEventListener("click", skip, true);
    document.removeEventListener("keydown", onKey);
    window.removeEventListener("pagehide", finish);
    window.removeEventListener("xg:intro-leave", finish);
    reduced.removeEventListener("change", finish);
  }
  function animationDone(event: AnimationEvent) {
    if (event.animationName === "xg-curtain") finish();
  }
  function skip(event: MouseEvent) {
    if (event.target instanceof Element && event.target.closest(".intro-skip"))
      finish();
  }
  function onKey(event: KeyboardEvent) {
    if (event.key === "Escape" || event.key === "Tab") finish();
  }

  // Arm the independent deadline before opting in, even before React hydrates.
  const deadline = window.setTimeout(finish, 1600);
  document.addEventListener("animationend", animationDone);
  document.addEventListener("click", skip, true);
  document.addEventListener("keydown", onKey);
  window.addEventListener("pagehide", finish);
  window.addEventListener("xg:intro-leave", finish);
  reduced.addEventListener("change", finish);
  root.dataset.xgIntro = "pending";
}

export function IntroPrepaint() {
  const pathname = usePathname();
  const lastPath = useRef(pathname);
  useLayoutEffect(() => {
    if (lastPath.current === pathname) return;
    lastPath.current = pathname;
    if (pathname === "/") beginIntro();
    else window.dispatchEvent(new Event("xg:intro-leave"));
  }, [pathname]);
  if (pathname !== "/") return null;
  return (
    <script
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: `(${beginIntro.toString()})();` }}
    />
  );
}

export default function IntroLoader() {
  if (usePathname() !== "/") return null;
  return (
    <div className="xg-intro">
      <div className="intro-art" aria-hidden="true">
        <span />
      </div>
      <div className="intro-progress" aria-hidden="true">
        <span />
      </div>
      <button type="button" className="intro-skip">
        Skip intro
      </button>
    </div>
  );
}
