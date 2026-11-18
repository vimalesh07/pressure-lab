"use client";

import { useId, useState } from "react";
import type { SparkPoint } from "@/lib/types";
import { fmtDate } from "@/lib/format";
import { FloatingTip, TooltipBox, TooltipRow } from "@/components/charts/ChartTooltip";

type Pt = [number, number];

/** Monotone cubic (Fritsch–Carlson) path through points sorted by x: smooth, never overshoots. */
export function monotonePath(p: Pt[]): string {
  const n = p.length;
  if (n < 2) return "";
  if (n === 2) return `M${p[0][0]},${p[0][1]}L${p[1][0]},${p[1][1]}`;
  const dx: number[] = [];
  const s: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(p[i + 1][0] - p[i][0]);
    s.push((p[i + 1][1] - p[i][1]) / dx[i]);
  }
  const m: number[] = [s[0]];
  for (let i = 1; i < n - 1; i++) m.push(s[i - 1] * s[i] <= 0 ? 0 : (s[i - 1] + s[i]) / 2);
  m.push(s[n - 2]);
  for (let i = 0; i < n - 1; i++) {
    if (s[i] === 0) {
      m[i] = m[i + 1] = 0;
      continue;
    }
    const a = m[i] / s[i];
    const b = m[i + 1] / s[i];
    const h = a * a + b * b;
    if (h > 9) {
      const t = 3 / Math.sqrt(h);
      m[i] = t * a * s[i];
      m[i + 1] = t * b * s[i];
    }
  }
  const f = (v: number) => v.toFixed(1);
  let d = `M${f(p[0][0])},${f(p[0][1])}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += `C${f(p[i][0] + h)},${f(p[i][1] + m[i] * h)} ${f(p[i + 1][0] - h)},${f(p[i + 1][1] - m[i + 1] * h)} ${f(p[i + 1][0])},${f(p[i + 1][1])}`;
  }
  return d;
}

/**
 * Match-by-match pressure scores (0–100, oldest → newest).
 * Pass the same `min` / `max` to every row so the lines can be compared.
 * `normal` draws a faint dashed baseline at the player's non-pressure level.
 */
export function Sparkline({
  values,
  points,
  normal,
  width = 104,
  height = 32,
  min = 0,
  max = 100,
  stroke = "var(--pink-300)",
}: {
  values: number[];
  points?: SparkPoint[];
  normal?: number | null;
  width?: number;
  height?: number;
  min?: number;
  max?: number;
  stroke?: string;
}) {
  const uid = useId().replace(/:/g, "");
  const [hi, setHi] = useState<{ i: number; x: number; y: number } | null>(null);
  if (values.length < 2) {
    return (
      <svg width={width} height={height} aria-label="Not enough pressure innings" role="img">
        <line x1={4} x2={width - 4} y1={height / 2} y2={height / 2} stroke="rgba(60,40,20,0.12)" strokeDasharray="2 3" />
      </svg>
    );
  }
  const padX = 4;
  const padY = 4;
  const span = max - min || 1;
  const x = (i: number) => padX + (i / (values.length - 1)) * (width - padX * 2);
  const y = (v: number) => padY + (1 - (Math.max(min, Math.min(max, v)) - min) / span) * (height - padY * 2);
  const pts: Pt[] = values.map((v, i) => [x(i), y(v)]);
  const d = monotonePath(pts);
  const base = height - padY;
  const area = `${d}L${x(values.length - 1).toFixed(1)},${base}L${x(0).toFixed(1)},${base}Z`;
  const last = values.length - 1;
  const step = (width - padX * 2) / (values.length - 1);
  const p = hi ? points?.[hi.i] : undefined;

  return (
    <span className="relative inline-flex h-full items-center">
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`Last ${values.length} pressure matches, latest ${values[last]}${normal != null ? `, normal level ${normal}` : ""}`}
        className="block overflow-visible"
        onMouseLeave={() => setHi(null)}
      >
        <defs>
          <linearGradient id={uid} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={stroke} stopOpacity="0.2" />
            <stop offset="1" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
        </defs>
        {normal != null && (
          <line
            x1={padX}
            x2={width - padX}
            y1={y(normal)}
            y2={y(normal)}
            stroke="rgba(60,40,20,0.32)"
            strokeWidth={1}
            strokeDasharray="2 2.5"
          />
        )}
        <path d={area} fill={`url(#${uid})`} />
        <path d={d} fill="none" stroke={stroke} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={x(last)} cy={y(values[last])} r={2.8} fill={stroke} stroke="var(--bg-800)" strokeWidth={1.4} />
        {hi && <circle cx={x(hi.i)} cy={y(values[hi.i])} r={3.2} fill="var(--bg-800)" stroke={stroke} strokeWidth={1.6} />}
        {values.map((_, i) => (
          <rect
            key={i}
            x={x(i) - step / 2}
            y={0}
            width={step}
            height={height}
            fill="transparent"
            onMouseEnter={(e) => {
              const r = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
              setHi({ i, x: r.left + x(i), y: r.top + y(values[i]) });
            }}
          />
        ))}
      </svg>
      {hi && (
        <FloatingTip x={hi.x} y={hi.y}>
          <TooltipBox title={p ? p.label : `Match ${hi.i + 1} of ${values.length}`}>
            {p && <TooltipRow label="Date" value={fmtDate(p.date)} />}
            <TooltipRow label="Pressure rating" value={values[hi.i]} />
            {normal != null && <TooltipRow label="Normal level" value={normal} />}
          </TooltipBox>
        </FloatingTip>
      )}
    </span>
  );
}
