"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { FloatingTip, TooltipBox } from "@/components/charts/ChartTooltip";
import { useWidth } from "@/components/charts/useWidth";

const GAP = 6;

/**
 * Bootstrap interval on a fixed 0–100 track (Pressure Rating scale).
 * Track, ticks, interval pill, rating dot and the two labels all use one scale,
 * so every row of a leaderboard lines up.
 */
export function ConfidenceBand({
  low,
  high,
  value,
  min = 0,
  max = 100,
  width = 150,
  showScale = false,
  labels = false,
  resamples,
}: {
  low: number;
  high: number;
  value: number;
  min?: number;
  max?: number;
  width?: number | string;
  showScale?: boolean;
  /** "low–high" under the pill's left end, "± x" under its right end. */
  labels?: boolean;
  /** Bootstrap resamples behind the interval (tooltip text). */
  resamples?: number;
}) {
  const pos = (v: number) => (Math.max(min, Math.min(max, v)) - min) / (max - min);
  const [ref, w] = useWidth<HTMLDivElement>();
  const lRef = useRef<HTMLSpanElement>(null);
  const rRef = useRef<HTMLSpanElement>(null);
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const lo = Math.round(low);
  const hi = Math.round(high);
  const half = ((high - low) / 2).toFixed(1);

  // Place the labels at the pill ends; if they would collide, split them around the pill centre.
  useLayoutEffect(() => {
    const l = lRef.current;
    const r = rRef.current;
    if (!labels || !l || !r || !w) return;
    const wl = l.offsetWidth;
    const wr = r.offsetWidth;
    const clamp = (x: number, ww: number) => Math.max(0, Math.min(w - ww, x));
    const a = pos(low) * w;
    const b = pos(high) * w;
    let L = clamp(a - wl / 2, wl);
    let R = clamp(b - wr / 2, wr);
    if (L + wl + GAP > R) {
      const mid = (a + b) / 2;
      L = mid - GAP / 2 - wl;
      R = mid + GAP / 2;
      if (R + wr > w) {
        L -= R + wr - w;
        R = w - wr;
      }
      if (L < 0) {
        R += -L;
        L = 0;
      }
    }
    l.style.transform = `translateX(${L}px)`;
    r.style.transform = `translateX(${R}px)`;
    l.style.opacity = r.style.opacity = "1";
  });

  const n = resamples ?? 1000;
  const tip =
    n > 0
      ? `90% of ${n.toLocaleString("en-US")} resamples rated this player between ${lo} and ${hi}.`
      : "Too few comparable players in this slice to resample, so no interval is shown.";

  return (
    <div
      ref={ref}
      className="relative"
      style={{ width }}
      role="img"
      aria-label={`Rating ${value.toFixed(1)}, 90% interval ${low.toFixed(1)} to ${high.toFixed(1)}`}
      onMouseMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        setHover({ x: e.clientX, y: r.top });
      }}
      onMouseLeave={() => setHover(null)}
    >
      <div className="relative h-3.5">
        {/* neutral 0–100 track with faint quarter ticks */}
        <div className="absolute inset-x-0 top-1/2 h-[2px] -translate-y-1/2 rounded-full bg-ink/[0.08]" />
        {[25, 50, 75].map((t) => (
          <div
            key={t}
            className="absolute top-1/2 h-[7px] w-px -translate-y-1/2 bg-ink/[0.13]"
            style={{ left: `${pos(t) * 100}%` }}
          />
        ))}
        {/* interval pill */}
        <div
          className="grow-x absolute top-1/2 h-[6px] -translate-y-1/2 rounded-full"
          style={{
            left: `${pos(low) * 100}%`,
            width: `${(pos(high) - pos(low)) * 100}%`,
            background: "linear-gradient(90deg, #C9688A 0%, #8E6A9C 50%, #4A73A8 100%)",
          }}
        />
        {/* rating */}
        <div
          className="absolute top-1/2 h-[10px] w-[10px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-text-100 ring-2 ring-bg-800"
          style={{ left: `${pos(value) * 100}%` }}
        />
      </div>
      {labels && (
        <div className="tnum relative mt-1 h-[14px] text-[11px] leading-[14px] text-text-400" aria-hidden>
          <span ref={lRef} className="absolute left-0 top-0 whitespace-nowrap opacity-0">
            {lo}–{hi}
          </span>
          <span ref={rRef} className="absolute left-0 top-0 whitespace-nowrap opacity-0">
            ± {half}
          </span>
        </div>
      )}
      {showScale && (
        <div className="tnum mt-1 flex justify-between text-[10px] text-text-400">
          <span>{min}</span>
          <span>{max}</span>
        </div>
      )}
      {hover && (
        <FloatingTip x={hover.x} y={hover.y}>
          <TooltipBox title="Bootstrap 90% interval">
            <div className="max-w-[230px] text-[12px] leading-snug">{tip}</div>
          </TooltipBox>
        </FloatingTip>
      )}
    </div>
  );
}
