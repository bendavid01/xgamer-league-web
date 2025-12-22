"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AutoRefresh() {
  const router = useRouter();

  useEffect(() => {
    // Set up the interval (30 seconds = 30000ms)
    const intervalId = setInterval(() => {
      // router.refresh() triggers a data re-fetch for Server Components
      // WITHOUT reloading the whole browser page. It's seamless.
      console.log("♻️ Auto-refreshing data...");
      router.refresh();
    }, 30000);

    // Cleanup the timer when the component unmounts
    return () => clearInterval(intervalId);
  }, [router]);

  // This component renders nothing visible
  return null;
}