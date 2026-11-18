"use client";

import { useId, useMemo, useState, type MouseEvent, type ReactNode } from "react";
import { Activity } from "lucide-react";
import type { ReplayBall, ReplayMatch } from "@/lib/types";
import { PRESSURE_SCALE_CSS, pressureScale } from "@/lib/format";
import { Card, CardHeader } from "@/components/ui/Card";
import { FloatingTip, TooltipBox, TooltipRow } from "./ChartTooltip";
import { monotonePath } from "@/components/ui/Sparkline";
import { useWidth } from "./useWidth";

/* ------------------------------------------------------------------ layout (px) */
const M = { left: 40, right: 12, top: 30 };
const PLOT_H = 236;
const AXIS_H = 22;
const STRIP_GAP = 10;
const STRIP_H = 14;
const HEIGHT = M.top + PLOT_H + AXIS_H + STRIP_GAP + STRIP_H + 2;
const INNINGS_GAP = 10; // px between the innings, in the chart and in the strip
const R = 9; // marker radius
const MIN_DIST = 2 * R + 2;

const INK = "#2B2118";
const MUTED = "#7A6A58";
const CREAM = "#FFFAF2";
const BLUE = "#4A73A8";
const ROSE = "#B23A62";

const EVENT_META: Record<string, { label: string; glyph: string; color: string }> = {
  W: { label: "Wicket", glyph: "W", color: "#C24A40" },
  "6": { label: "Six", glyph: "6", color: "#B8862B" },
  "4": { label: "Four", glyph: "4", color: "#4A73A8" },
  BIG_OVER: { label: "Big over", glyph: "⚡", color: "#C9688A" },
};

export interface CurveMark {
  idx: number;
  glyph: string;
  color: string;
  title: string;
  active?: boolean;
}

interface Placed {
  idx: number;
  glyph: string;
  color: string;
  title: string;
  active: boolean;
  kind: "mark" | "event";
  cx: number;
  cy: number; // true point on the curve
  px: number; // drawn position (kept inside the plot)
  py: number; // drawn position (offset when crowded)
  more: number; // markers folded into this one
}

/** One x-scale for the curve, the overs axis, the innings divider and the pressure strip. */
function useScale(balls: ReplayBall[], width: number) {
  return useMemo(() => {
    const n = balls.length;
    const split = balls.findIndex((b) => b.innings === 2);
    const gap = split > 0 ? INNINGS_GAP : 0;
    const plotW = Math.max(10, width - M.left - M.right);
    const u = (plotW - gap) / Math.max(n, 1);
    const off = (i: number) => (split > 0 && i >= split ? gap : 0);
    const slot = (i: number) => M.left + i * u + off(i); // left edge of ball i
    const x = (i: number) => slot(i) + u / 2; // centre of ball i
    const y = (wp: number) => M.top + (1 - wp / 100) * PLOT_H;
    const divider = split > 0 ? M.left + split * u + gap / 2 : null;
    const toIdx = (px: number) => {
      let i: number;
      if (split > 0 && px >= M.left + split * u + gap / 2) i = split + Math.floor((px - M.left - split * u - gap) / u);
      else i = Math.floor((px - M.left) / u);
      if (split > 0) i = px >= (divider as number) ? Math.max(split, i) : Math.min(split - 1, i);
      return Math.max(0, Math.min(n - 1, i));
    };
    return { n, split, u, slot, x, y, divider, toIdx, plotW, right: M.left + plotW };
  }, [balls, width]);
}

/** Place markers at their ball; when they crowd, offset them vertically (leader line) or fold them into a cluster. */
function place(items: Omit<Placed, "px" | "py" | "more">[], xmin: number, xmax: number): Placed[] {
  const top = M.top + R;
  const bottom = M.top + PLOT_H - R;
  const order = [...items].sort((a, b) => Number(b.active) - Number(a.active) || a.cx - b.cx);
  const out: Placed[] = [];
  for (const it of order) {
    const offsets = [0, -22, 22, -44, 44];
    let py: number | null = null;
    const px = Math.max(xmin, Math.min(xmax, it.cx));
    const base = Math.max(top, Math.min(bottom, it.cy));
    for (const dy of offsets) {
      const c = base + dy;
      if (c < top || c > bottom) continue;
      if (out.every((p) => Math.hypot(p.px - px, p.py - c) >= MIN_DIST)) {
        py = c;
        break;
      }
    }
    if (py === null && !out.length) py = base;
    if (py === null) {
      const near = out.reduce((a, b) => (Math.hypot(b.px - px, b.py - it.cy) < Math.hypot(a.px - px, a.py - it.cy) ? b : a));
      near.more += 1;
      near.title += `\n${it.title}`;
      continue;
    }
    out.push({ ...it, px, py, more: 0 });
  }
  return out.sort((a, b) => Number(a.active) - Number(b.active)); // selected marker drawn last (on top)
}

function overTicks(balls: ReplayBall[], compact: boolean) {
  const want = compact ? [10, 20] : [5, 10, 15, 20];
  const ticks: { idx: number; label: string }[] = [];
  for (const inn of [1, 2]) {
    for (const k of want) {
      let last = -1;
      balls.forEach((b, i) => {
        if (b.innings === inn && Math.floor(parseFloat(b.over)) === k - 1) last = i;
      });
      if (last >= 0) ticks.push({ idx: last, label: k === want[0] && inn === 1 ? `Ov ${k}` : String(k) });
    }
  }
  return ticks;
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
  const uid = useId().replace(/:/g, "");
  const [wrap, width] = useWidth<HTMLDivElement>();
  const balls = match.balls;
  const S = useScale(balls, width);
  const [hover, setHover] = useState<{ idx: number; strip: boolean } | null>(null);
  const markAt = useMemo(() => new Map((marks ?? []).map((m) => [m.idx, m])), [marks]);
  const compact = S.plotW < 460;

  const paths = useMemo(() => {
    if (!width) return [];
    const parts = S.split > 0 ? [balls.slice(0, S.split), balls.slice(S.split)] : [balls];
    return parts.map((seg) => {
      const pts = seg.map((b) => [S.x(b.idx), S.y(b.wp)] as [number, number]);
      const d = monotonePath(pts);
      const y50 = S.y(50);
      const area = pts.length ? `${d}L${pts[pts.length - 1][0].toFixed(1)},${y50}L${pts[0][0].toFixed(1)},${y50}Z` : "";
      return { d, area };
    });
  }, [balls, S, width]);

  const placed = useMemo(() => {
    if (!width) return [];
    const src = marks
      ? marks
          .filter((m) => balls[m.idx])
          .map((m) => ({ idx: m.idx, glyph: m.glyph, color: m.color, title: m.title, active: !!m.active, kind: "mark" as const }))
      : balls
          .filter((b) => b.event && b.note)
          .map((b) => ({
            idx: b.idx,
            glyph: EVENT_META[b.event!].glyph,
            color: EVENT_META[b.event!].color,
            title: b.note!,
            active: false,
            kind: "event" as const,
          }));
    return place(
      src.map((m) => ({ ...m, cx: S.x(m.idx), cy: S.y(balls[m.idx].wp) })),
      M.left + R + 5,
      S.right - R - 5,
    );
  }, [marks, balls, S, width]);

  const ticks = useMemo(() => overTicks(balls, compact), [balls, compact]);
  const stripY = M.top + PLOT_H + AXIS_H + STRIP_GAP;
  const hb = hover ? balls[hover.idx] : undefined;

  const onMove = (e: MouseEvent<SVGRectElement>) => {
    const r = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
    const lx = e.clientX - r.left;
    const ly = e.clientY - r.top;
    setHover({ idx: S.toIdx(lx), strip: ly >= stripY - 4 });
  };

  const tip = (() => {
    if (!hb || !wrap.current) return null;
    const r = wrap.current.getBoundingClientRect();
    const batting = hb.innings === 1 ? match.teamA : match.teamB;
    if (hover!.strip) {
      return (
        <FloatingTip x={r.left + S.x(hb.idx)} y={r.top + stripY + STRIP_H} below>
          <TooltipBox title={`Over ${hb.over} · ${batting} batting`}>
            <TooltipRow label="Pressure index" value={hb.pressure.toFixed(2)} color={pressureScale(hb.pressure)} />
            <TooltipRow label={`${match.teamA} win prob.`} value={`${hb.wp.toFixed(0)}%`} />
          </TooltipBox>
        </FloatingTip>
      );
    }
    const m = markAt.get(hb.idx);
    const pm = placed.find((p) => p.idx === hb.idx);
    return (
      <FloatingTip x={r.left + S.x(hb.idx)} y={r.top + (pm ? pm.py - R : S.y(hb.wp))}>
        <TooltipBox title={m?.title ?? hb.note ?? `Over ${hb.over} · ${batting} batting`}>
          <TooltipRow label={`${match.teamA} win prob.`} value={`${hb.wp.toFixed(0)}%`} />
          <TooltipRow label="Pressure index" value={hb.pressure.toFixed(2)} color={pressureScale(hb.pressure)} />
          {pm && pm.more > 0 && <div className="pt-1 text-[11px]">+{pm.more} more nearby marked ball{pm.more > 1 ? "s" : ""}</div>}
        </TooltipBox>
      </FloatingTip>
    );
  })();

  const inningsLabel = (n: 1 | 2) =>
    compact
      ? `Inn ${n} · ${n === 1 ? match.scoreA : match.scoreB}`
      : `${n === 1 ? "1st" : "2nd"} innings · ${n === 1 ? match.teamA : match.teamB} ${n === 1 ? match.scoreA : match.scoreB}`;

  return (
    <Card index={index} glow="pink" className={`p-5 md:p-6 ${className ?? ""}`}>
      <CardHeader
        icon={<Activity size={16} />}
        title={title}
        subtitle={`${match.teamA} win probability. Above the 50% line = ${match.teamA} ahead, below = ${match.teamB} ahead.`}
        right={
          legend ?? (
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
          )
        }
      />

      <div ref={wrap} className="relative w-full" style={{ height: HEIGHT }}>
        {width > 0 && (
          <svg
            width={width}
            height={HEIGHT}
            viewBox={`0 0 ${width} ${HEIGHT}`}
            role="img"
            aria-label={`${match.teamA} win probability over ${balls.length} deliveries, with the pressure index of each delivery underneath`}
            className="block select-none"
            onMouseLeave={() => setHover(null)}
          >
            <defs>
              <linearGradient id={`wp${uid}`} gradientUnits="userSpaceOnUse" x1="0" y1={M.top} x2="0" y2={M.top + PLOT_H}>
                <stop offset="0" stopColor={BLUE} stopOpacity={0.42} />
                <stop offset="0.5" stopColor={BLUE} stopOpacity={0.03} />
                <stop offset="0.5" stopColor={ROSE} stopOpacity={0.03} />
                <stop offset="1" stopColor={ROSE} stopOpacity={0.46} />
              </linearGradient>
              <clipPath id={`clip${uid}`}>
                <rect x={M.left} y={M.top} width={S.plotW} height={PLOT_H} />
              </clipPath>
            </defs>

            {/* second-innings tint */}
            {S.divider !== null && (
              <rect x={S.divider} y={M.top} width={S.right - S.divider} height={PLOT_H} fill="rgba(60,40,20,0.022)" />
            )}

            {/* y grid */}
            {[0, 25, 50, 75, 100].map((t) => (
              <g key={t}>
                {t !== 50 && <line x1={M.left} x2={S.right} y1={S.y(t)} y2={S.y(t)} stroke="rgba(60,40,20,0.06)" />}
                <text x={M.left - 8} y={S.y(t) + 3.5} textAnchor="end" fontSize={11} fill={MUTED} className="tnum">
                  {t}%
                </text>
              </g>
            ))}
            <line x1={M.left} x2={S.right} y1={S.y(50)} y2={S.y(50)} stroke="rgba(60,40,20,0.3)" strokeDasharray="4 4" />

            {/* innings divider + labels */}
            {S.divider !== null && (
              <line x1={S.divider} x2={S.divider} y1={M.top - 6} y2={stripY + STRIP_H} stroke="rgba(60,40,20,0.22)" />
            )}
            <text x={M.left} y={14} fontSize={11} fill={MUTED}>
              {inningsLabel(1)}
            </text>
            {S.divider !== null && (
              <text x={S.divider + 6} y={14} fontSize={11} fill={MUTED}>
                {inningsLabel(2)}
              </text>
            )}

            {/* curve */}
            <g clipPath={`url(#clip${uid})`}>
              {paths.map((p, i) => (
                <path key={`a${i}`} d={p.area} fill={`url(#wp${uid})`} />
              ))}
              {paths.map((p, i) => (
                <path key={`l${i}`} d={p.d} fill="none" stroke={INK} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              ))}
            </g>

            {/* team-ahead labels, pinned inside the plot */}
            <text
              x={S.right - 8}
              y={M.top + 15}
              textAnchor="end"
              fontSize={11}
              fontWeight={600}
              fill="var(--blue-300)"
              stroke={CREAM}
              strokeWidth={3}
              paintOrder="stroke"
            >
              ▲ {match.teamA} ahead
            </text>
            <text
              x={S.right - 8}
              y={M.top + PLOT_H - 8}
              textAnchor="end"
              fontSize={11}
              fontWeight={600}
              fill="var(--pink-300)"
              stroke={CREAM}
              strokeWidth={3}
              paintOrder="stroke"
            >
              ▼ {match.teamB} ahead
            </text>

            {/* overs axis */}
            {ticks.map((t) => {
              const tx = S.slot(t.idx) + S.u;
              return (
                <g key={`${t.idx}`}>
                  <line x1={tx} x2={tx} y1={M.top + PLOT_H} y2={M.top + PLOT_H + 4} stroke="rgba(60,40,20,0.25)" />
                  <text x={tx} y={M.top + PLOT_H + 16} textAnchor="middle" fontSize={11} fill={MUTED} className="tnum">
                    {t.label}
                  </text>
                </g>
              );
            })}

            {/* pressure strip: one crisp segment per delivery */}
            <g shapeRendering="crispEdges">
              {balls.map((b, i) => (
                <rect
                  key={i}
                  x={S.slot(i)}
                  y={stripY}
                  width={Math.max(0.6, S.u > 2.5 ? S.u - 0.75 : S.u)}
                  height={STRIP_H}
                  fill={pressureScale(b.pressure)}
                />
              ))}
            </g>

            {/* hover guide (chart + strip) */}
            {hb && (
              <g pointerEvents="none">
                <line x1={S.x(hb.idx)} x2={S.x(hb.idx)} y1={M.top} y2={M.top + PLOT_H} stroke="rgba(60,40,20,0.28)" />
                <circle cx={S.x(hb.idx)} cy={S.y(hb.wp)} r={4.5} fill="#C9688A" stroke={CREAM} strokeWidth={2} />
                <rect
                  x={S.slot(hb.idx) - 1}
                  y={stripY - 2}
                  width={Math.max(3, S.u) + 2}
                  height={STRIP_H + 4}
                  fill="none"
                  stroke={INK}
                  strokeWidth={1.25}
                  rx={1}
                />
              </g>
            )}

            {/* pointer capture (below markers so markers stay clickable) */}
            <rect
              x={M.left}
              y={M.top}
              width={S.plotW}
              height={stripY + STRIP_H - M.top}
              fill="transparent"
              onMouseMove={onMove}
            />

            {/* markers */}
            {placed.map((p) => (
              <g
                key={`m${p.idx}`}
                style={{ cursor: onPick ? "pointer" : undefined }}
                onClick={() => onPick?.(p.idx)}
                onMouseEnter={() => setHover({ idx: p.idx, strip: false })}
              >
                {(p.py !== p.cy || p.px !== p.cx) && (
                  <>
                    <line x1={p.cx} x2={p.px} y1={p.cy} y2={p.py} stroke={p.color} strokeWidth={1.25} opacity={0.7} />
                    <circle cx={p.cx} cy={p.cy} r={2.5} fill={p.color} />
                  </>
                )}
                {p.active && <circle cx={p.px} cy={p.py} r={R + 5} fill={CREAM} stroke={p.color} strokeWidth={2.25} />}
                {p.kind === "mark" ? (
                  <circle cx={p.px} cy={p.py} r={R} fill={p.color} stroke={CREAM} strokeWidth={2} />
                ) : (
                  <circle cx={p.px} cy={p.py} r={R} fill={CREAM} stroke={p.color} strokeWidth={2} />
                )}
                <text
                  x={p.px}
                  y={p.py + 3.5}
                  textAnchor="middle"
                  fontSize={9.5}
                  fontWeight={700}
                  fill={p.kind === "mark" ? CREAM : INK}
                  fontFamily="var(--font-display)"
                >
                  {p.glyph}
                </text>
                {p.more > 0 && (
                  <g>
                    <rect x={p.px + (p.px + 21 > S.right ? -21 : 5)} y={p.py - R - 7} width={16} height={11} rx={5.5} fill={INK} />
                    <text x={p.px + (p.px + 21 > S.right ? -13 : 13)} y={p.py - R + 1} textAnchor="middle" fontSize={8} fontWeight={700} fill={CREAM}>
                      +{p.more}
                    </text>
                  </g>
                )}
                <title>{p.title}</title>
              </g>
            ))}
          </svg>
        )}
      </div>
      {tip}

      {/* pressure legend, aligned with the plot */}
      <div style={{ marginLeft: M.left, marginRight: M.right }} className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[11.5px] text-text-400">
        <span>Pressure index per delivery · hover a segment to find the ball</span>
        <span className="flex items-center gap-2">
          <span>Calm</span>
          <span className="relative inline-block">
            <span className="block h-2 w-32 rounded-[2px]" style={{ background: PRESSURE_SCALE_CSS }} />
            <span className="tnum absolute -bottom-3.5 left-0 -translate-x-1/2 text-[9.5px]">0</span>
            <span className="tnum absolute -bottom-3.5 left-1/2 -translate-x-1/2 text-[9.5px]">0.5</span>
            <span className="tnum absolute -bottom-3.5 left-full -translate-x-1/2 text-[9.5px]">1</span>
          </span>
          <span>Extreme</span>
        </span>
      </div>
      <div className="h-3" aria-hidden />
    </Card>
  );
}
