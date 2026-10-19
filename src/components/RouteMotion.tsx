"use client";
import { usePathname } from "next/navigation";
import { MotionConfig } from "framer-motion";

export default function RouteMotion({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  return (
    <MotionConfig reducedMotion="user">
      <div key={pathname} className="route-motion">
        {children}
      </div>
    </MotionConfig>
  );
}
