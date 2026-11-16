"use client";

import { useEffect, useRef, useState } from "react";
import { fmtInt } from "@/lib/format";

/** Animated number; jumps straight to the value when reduced motion is requested. */
export function CountUp({
  value,
  duration = 1400,
  format = fmtInt,
  className,
}: {
  value: number;
  duration?: number;
  format?: (n: number) => string;
  className?: string;
}) {
  const [shown, setShown] = useState(0);
  const raf = useRef<number | null>(null);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(value);
      return;
    }
    const start = performance.now();
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / duration);
      setShown(value * (1 - Math.pow(1 - k, 4)));
      if (k < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [value, duration]);
  return (
    <span className={className}>
      <span aria-hidden>{format(shown)}</span>
      <span className="sr-only">{format(value)}</span>
    </span>
  );
}
