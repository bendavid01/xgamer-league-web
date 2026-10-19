"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
export default function AutoRefresh() {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible" && navigator.onLine)
        router.refresh();
    }, 30000);
    return () => clearInterval(timer);
  }, [router]);
  return null;
}
