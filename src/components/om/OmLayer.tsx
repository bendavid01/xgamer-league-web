"use client";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { omMono, omSans } from "./fonts";
import s from "./om.module.css";

/**
 * Renders overlays (drawers, quick jump) at the end of <body>, outside the page's
 * animated route wrapper, so `position: fixed` covers the whole viewport and sits
 * above the site navigation. The wrapper carries the OM theme and fonts.
 */
export default function OmLayer({ children }: { children: ReactNode }) {
  return createPortal(
    <div className={`${s.ws} ${omSans.variable} ${omMono.variable}`}>
      {children}
    </div>,
    document.body,
  );
}
