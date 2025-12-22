"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AutoRefresh() {
  const router = useRouter();

  useEffect(() => {
    // Set up the interval (10 seconds = 10000ms)
    const intervalId = setInterval(() => {
      // router.refresh() triggers a data re-fetch for Server Components
      // WITHOUT reloading the whole browser page. It's seamless.
      console.log("♻️ Auto-refreshing data...");
      router.refresh();
    }, 10000);

    // Cleanup the timer when the component unmounts
    return () => clearInterval(intervalId);
  }, [router]);

  // This component renders nothing visible
  return null;
}