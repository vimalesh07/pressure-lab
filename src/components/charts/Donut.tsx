"use client";

import { useState } from "react";
import type { DismissalSlice } from "@/lib/types";

const COLORS = ["#B23A62", "#4A73A8", "#7C67A6", "#B8862B", "#5B9BB8", "#7A6A58"];

/** Donut with a 2px surface gap between slices and a direct-labelled legend. */
export function Donut({ slices, size = 120, centerLabel = "total" }: { slices: DismissalSlice[]; size?: number; centerLabel?: string }) {
  const [active, setActive] = useState<number | null>(null);
  const total = slices.reduce((s, x) => s + x.count, 0);
  const r = size / 2 - 8;
  const c = 2 * Math.PI * r;
  let acc = 0;
  return (
    <div className="flex items-center gap-4">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={slices.map((s) => `${s.type} ${s.count}`).join(", ")}>
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          {slices.map((s, i) => {
            const len = (s.count / total) * c;
            const el = (
              <circle
                key={s.type}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={COLORS[i % COLORS.length]}
                strokeWidth={active === i ? 14 : 11}
                strokeDasharray={`${Math.max(0, len - 2.5)} ${c}`}
                strokeDashoffset={-acc}
                opacity={active === null || active === i ? 1 : 0.35}
                onMouseEnter={() => setActive(i)}
                onMouseLeave={() => setActive(null)}
                style={{ transition: "opacity .2s, stroke-width .2s" }}
              />
            );
            acc += len;
            return el;
          })}
        </g>
        <text x="50%" y="48%" textAnchor="middle" fontSize={22} fontWeight={600} fill="#2B2118" fontFamily="var(--font-display)" className="tnum">
          {active === null ? total : slices[active].count}
        </text>
        <text x="50%" y="63%" textAnchor="middle" fontSize={10} fill="#7A6A58">
          {active === null ? centerLabel : `${Math.round((slices[active].count / total) * 100)}%`}
        </text>
      </svg>
      <ul className="min-w-0 flex-1 space-y-1">
        {slices.map((s, i) => (
          <li
            key={s.type}
            className="flex items-center justify-between gap-2 text-[12px]"
            onMouseEnter={() => setActive(i)}
            onMouseLeave={() => setActive(null)}
          >
            <span className="flex min-w-0 items-center gap-1.5 text-text-400">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
              <span className="truncate">{s.type}</span>
            </span>
            <span className="tnum font-semibold text-text-100">{s.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
