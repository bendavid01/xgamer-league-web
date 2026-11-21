"use client";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import OmLayer from "./OmLayer";
import s from "./om.module.css";

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex]:not([tabindex="-1"])';

/**
 * Shared slide-over. Modal while open: Escape or the backdrop closes it, Tab stays
 * inside, and focus returns to whatever opened it.
 */
export default function OmDrawer({
  open,
  onClose,
  title,
  subtitle,
  side = "right",
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  side?: "right" | "left";
  children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const titleId = useId();

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    const body = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.querySelector<HTMLElement>("[data-drawer-close]")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        closeRef.current();
        return;
      }
      if (e.key !== "Tab" || !panel.current) return;
      const items = [
        ...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE),
      ].filter((el) => el.offsetParent !== null);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = body;
      if (opener?.isConnected) opener.focus();
    };
  }, [open]);

  if (!open) return null;
  return (
    <OmLayer>
      <div
        className={s.overlay}
        onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      >
        <div
          ref={panel}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className={`${s.drawer} ${side === "left" ? s.drawerLeft : ""}`}
        >
          <div className={s.drawerHead}>
            <div className="min-w-0">
              <h2 id={titleId} className={s.drawerTitle}>
                {title}
              </h2>
              {subtitle && <div className={s.drawerSub}>{subtitle}</div>}
            </div>
            <button
              type="button"
              data-drawer-close
              className={s.iconBtn}
              onClick={onClose}
              aria-label="Close"
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>
          <div className={s.drawerBody}>{children}</div>
        </div>
      </div>
    </OmLayer>
  );
}
