"use client";

import { useMemo, type ReactNode } from "react";
import {
  Area,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Activity } from "lucide-react";
import type { ReplayBall, ReplayMatch } from "@/lib/types";
import { pressureColor } from "@/lib/format";
import { Card, CardHeader } from "@/components/ui/Card";
import { LegendItem } from "@/components/ui/Controls";
import { TooltipBox, TooltipRow } from "./ChartTooltip";
import { useReducedMotion } from "./useReducedMotion";

const Y_AXIS_W = 44;
const RIGHT = 16;

const EVENT_META: Record<string, { label: string; glyph: string; color: string }> = {
  W: { label: "Wicket", glyph: "W", color: "#C24A40" },
  "6": { label: "Six", glyph: "6", color: "#B8862B" },
  "4": { label: "Four", glyph: "4", color: "#4A73A8" },
  BIG_OVER: { label: "Big over", glyph: "⚡", color: "#C9688A" },
};

function EventMarker(props: { cx?: number; cy?: number; event: string }) {
  const { cx = 0, cy = 0, event } = props;
  const m = EVENT_META[event];
  return (
    <g>
      <circle cx={cx} cy={cy} r={13} fill={m.color} opacity={0.18} />
      <circle cx={cx} cy={cy} r={9} fill="#F7F1E6" stroke={m.color} strokeWidth={2} />
      <text x={cx} y={cy + 3.5} textAnchor="middle" fontSize={10} fontWeight={700} fill="#2B2118" fontFamily="var(--font-display)">
        {m.glyph}
      </text>
    </g>
  );
}

export interface CurveMark {
  idx: number;
  glyph: string;
  color: string;
  title: string;
  active?: boolean;
}

function MarkDot(props: { cx?: number; cy?: number; m: CurveMark; onPick?: (idx: number) => void }) {
  const { cx = 0, cy = 0, m, onPick } = props;
  return (
    <g style={{ cursor: onPick ? "pointer" : undefined }} onClick={() => onPick?.(m.idx)}>
      {m.active && <circle cx={cx} cy={cy} r={15} fill="none" stroke={m.color} strokeWidth={2} opacity={0.7} />}
      <circle cx={cx} cy={cy} r={9} fill={m.color} stroke="#FFFAF2" strokeWidth={2} />
      <text x={cx} y={cy + 3.5} textAnchor="middle" fontSize={9.5} fontWeight={700} fill="#FFFAF2" fontFamily="var(--font-display)">
        {m.glyph}
      </text>
    </g>
  );
}

export function WpCurveCard({
  match,
  index,
  className,
  marks,
  onPick,
  title = "Win probability, ball by ball",
  legend,
}: {
  match: ReplayMatch;
  index?: number;
  className?: string;
  /** Optional player markers; when given they replace the generic event markers. */
  marks?: CurveMark[];
  onPick?: (idx: number) => void;
  title?: string;
  legend?: ReactNode;
}) {
  const reduce = useReducedMotion();
  const total = match.balls.length;
  const split = match.balls.findIndex((b) => b.innings === 2);
  const events = marks ? [] : match.balls.filter((b) => b.event && b.note);
  const markAt = useMemo(() => new Map((marks ?? []).map((m) => [m.idx, m])), [marks]);

  const pressureGradient = useMemo(() => {
    const stops = match.balls.map((b, i) => `${pressureColor(b.pressure)} ${((i / (total - 1)) * 100).toFixed(2)}%`);
    return `linear-gradient(90deg, ${stops.join(", ")})`;
  }, [match.balls, total]);

  const ticks = Array.from({ length: 8 }, (_, i) => (i + 1) * 30 - 1).filter((t) => t < total);

  return (
    <Card index={index} glow="pink" className={`p-5 md:p-6 ${className ?? ""}`}>
      <CardHeader
        icon={<Activity size={16} />}
        title={title}
        subtitle={`${match.teamA} win probability. Above the 50% line = ${match.teamA} ahead, below = ${match.teamB} ahead.`}
        right={legend ?? (
          <div className="hidden flex-wrap justify-end gap-x-4 gap-y-1 md:flex">
            {Object.entries(EVENT_META)
              .filter(([k]) => k !== "4")
              .map(([k, m]) => (
                <span key={k} className="inline-flex items-center gap-1.5 text-[12px] text-text-400">
                  <span
                    className="grid h-4 w-4 place-items-center rounded-full text-[9px] font-bold text-text-100"
                    style={{ border: `1.5px solid ${m.color}` }}
                  >
                    {m.glyph}
                  </span>
                  {m.label}
                </span>
              ))}
          </div>
        )}
      />

      <div className="relative h-[300px]">
        <div className="pointer-events-none absolute right-5 top-6 z-10 text-[11px] font-semibold text-blue-300">▲ {match.teamA} ahead</div>
        <div className="pointer-events-none absolute bottom-7 right-5 z-10 text-[11px] font-semibold text-pink-300">▼ {match.teamB} ahead</div>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={match.balls} margin={{ top: 22, right: RIGHT, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="wpSplit" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#4A73A8" stopOpacity={0.45} />
                <stop offset="0.5" stopColor="#4A73A8" stopOpacity={0.02} />
                <stop offset="0.5" stopColor="#B23A62" stopOpacity={0.02} />
                <stop offset="1" stopColor="#B23A62" stopOpacity={0.5} />
              </linearGradient>
            </defs>
            <ReferenceArea
              x1={0}
              x2={split - 1}
              fill="transparent"
              label={{ value: `1st innings · ${match.teamA} ${match.scoreA}`, position: "insideTopLeft", fill: "#7A6A58", fontSize: 11, dy: -20 }}
            />
            <ReferenceArea
              x1={split}
              x2={total - 1}
              fill="rgba(60,40,20,0.018)"
              label={{ value: `2nd innings · ${match.teamB} ${match.scoreB}`, position: "insideTopLeft", fill: "#7A6A58", fontSize: 11, dy: -20 }}
            />
            <XAxis
              dataKey="idx"
              type="number"
              domain={[0, total - 1]}
              ticks={ticks}
              tickFormatter={(v: number) => `Ov ${(((v + 1) / 6) % 20 || 20).toFixed(0)}`}
              tickLine={false}
              axisLine={false}
              height={22}
            />
            <YAxis
              domain={[0, 100]}
              ticks={[0, 25, 50, 75, 100]}
              tickFormatter={(v) => `${v}%`}
              width={Y_AXIS_W}
              tickLine={false}
              axisLine={false}
            />
            <ReferenceLine y={50} stroke="rgba(60,40,20,0.22)" strokeDasharray="4 4" />
            <ReferenceLine x={split - 0.5} stroke="rgba(60,40,20,0.18)" />
            <Area
              type="monotone"
              dataKey="wp"
              baseValue={50}
              stroke="none"
              fill="url(#wpSplit)"
              isAnimationActive={!reduce}
              animationDuration={1400}
            />
            <Line
              type="monotone"
              dataKey="wp"
              stroke="#2B2118"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 5, fill: "#C9688A", stroke: "#F7F1E6", strokeWidth: 2 }}
              isAnimationActive={!reduce}
              animationDuration={1600}
            />
            {events.map((b) => (
              <ReferenceDot
                key={b.idx}
                x={b.idx}
                y={b.wp}
                r={9}
                ifOverflow="visible"
                shape={(p: { cx?: number; cy?: number }) => <EventMarker {...p} event={b.event!} />}
              />
            ))}
            {(marks ?? []).map((m) => {
              const b = match.balls[m.idx];
              return b ? (
                <ReferenceDot
                  key={`m${m.idx}`}
                  x={m.idx}
                  y={b.wp}
                  r={9}
                  ifOverflow="visible"
                  shape={(p: { cx?: number; cy?: number }) => <MarkDot {...p} m={m} onPick={onPick} />}
                />
              ) : null;
            })}
            <Tooltip
              cursor={{ stroke: "rgba(60,40,20,0.25)", strokeWidth: 1 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const b = payload[0].payload as ReplayBall;
                const batting = b.innings === 1 ? match.teamA : match.teamB;
                return (
                  <TooltipBox title={markAt.get(b.idx)?.title ?? b.note ?? `Over ${b.over} · ${batting} batting`}>
                    <TooltipRow label={`${match.teamA} win prob.`} value={`${b.wp.toFixed(0)}%`} />
                    <TooltipRow label="Pressure index" value={b.pressure.toFixed(2)} color={pressureColor(b.pressure)} />
                  </TooltipBox>
                );
              }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Glowing pressure band, aligned with the plot area */}
      <div style={{ marginLeft: Y_AXIS_W, marginRight: RIGHT }} className="mt-3">
        <div className="relative h-4">
          <div className="absolute inset-0 rounded-full opacity-70 blur-md" style={{ background: pressureGradient }} />
          <div className="grow-x absolute inset-0 rounded-full" style={{ background: pressureGradient }} />
        </div>
        <div className="mt-2 flex items-center justify-between text-[11.5px] text-text-400">
          <span>Pressure index per delivery</span>
          <span className="flex items-center gap-2">
            Calm
            <span className="bar-pressure h-1.5 w-24 rounded-full" />
            Extreme
          </span>
        </div>
      </div>
      <div className="sr-only">
        <LegendItem color="#fff" label="Win probability line" shape="line" />
      </div>
    </Card>
  );
}
