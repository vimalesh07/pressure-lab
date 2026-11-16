"use client";

import { useId } from "react";
import { ratingTier } from "@/lib/format";
import { CountUp } from "./CountUp";

/** Semi-circle 0–100 gauge with the calm → extreme pressure gradient. */
export function PressureGauge({
  value,
  size = 200,
  label = "Pressure Rating",
  showTier = true,
}: {
  value: number;
  size?: number;
  label?: string;
  showTier?: boolean;
}) {
  const id = useId().replace(/:/g, "");
  const stroke = Math.round(size * 0.075);
  const pad = 3;
  // the arc's round end caps reach stroke/2 beyond the path in every direction
  const r = size / 2 - stroke / 2 - pad;
  const cx = size / 2;
  const cy = r + stroke / 2 + pad;
  const h = cy + stroke / 2 + pad;
  const arc = Math.PI * r;
  const pct = Math.max(0, Math.min(100, value)) / 100;
  const angle = Math.PI * (1 - pct);
  const kx = cx + r * Math.cos(angle);
  const ky = cy - r * Math.sin(angle);
  const d = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;
  return (
    <div className="inline-flex flex-col items-center" style={{ width: size }}>
      <div className="relative" style={{ width: size, height: h }}>
        <svg width={size} height={h} viewBox={`0 0 ${size} ${h}`} role="img" aria-label={`${label}: ${value.toFixed(1)} out of 100`} className="block">
          <defs>
            <linearGradient id={`g${id}`} gradientUnits="userSpaceOnUse" x1={cx - r} x2={cx + r} y1="0" y2="0">
              <stop offset="0" stopColor="#4A73A8" />
              <stop offset="0.35" stopColor="#7C67A6" />
              <stop offset="0.72" stopColor="#B23A62" />
              <stop offset="1" stopColor="#C2453F" />
            </linearGradient>
          </defs>
          <path d={d} fill="none" stroke="rgba(60,40,20,0.08)" strokeWidth={stroke} strokeLinecap="round" />
          {pct > 0 && <path
            d={d}
            fill="none"
            stroke={`url(#g${id})`}
            strokeWidth={stroke}
            strokeLinecap="round"
            className="gauge-fill"
            style={{ ["--len" as string]: arc, ["--off" as string]: arc * (1 - pct) }}
          />}
          <circle cx={kx} cy={ky} r={stroke * 0.36} fill="#FFFAF2" stroke="rgba(60,40,20,0.25)" strokeWidth={1} />
        </svg>
        {/* value sits inside the arc, just above the baseline */}
        <div className="absolute inset-x-0 flex justify-center" style={{ bottom: stroke * 0.2, fontSize: Math.round(size * 0.2) }}>
          <CountUp value={value} format={(n) => n.toFixed(1)} className="tnum font-display font-semibold leading-none tracking-tight" />
        </div>
      </div>
      {/* 0 and 100 centred under the two ends of the arc */}
      <div className="relative h-4 w-full text-[10px] text-text-400 tnum" aria-hidden>
        <span className="absolute -translate-x-1/2" style={{ left: cx - r }}>0</span>
        <span className="absolute -translate-x-1/2" style={{ left: cx + r }}>100</span>
      </div>
      {showTier && (
        <div className="text-center">
          <div className="text-[11px] uppercase tracking-[0.14em] text-text-400">{label}</div>
          <div className="font-display text-[13px] font-semibold text-pink-300">{ratingTier(value)}</div>
        </div>
      )}
    </div>
  );
}
