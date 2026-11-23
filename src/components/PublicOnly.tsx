"use client";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/** Public site chrome (the footer) that the player hub leaves out. */
export default function PublicOnly({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const hidden =
    pathname === "/dashboard" || pathname.startsWith("/dashboard/");
  return hidden ? null : <>{children}</>;
}
