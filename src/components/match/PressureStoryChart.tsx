"use client";

import { useMemo, useState, type KeyboardEvent } from "react";
import type { EvidenceDelivery, ReplayBall } from "@/lib/types";
import { cx } from "@/lib/format";
import { monotonePath } from "@/components/ui/Sparkline";
import { FloatingTip } from "@/components/charts/ChartTooltip";
import { useWidth } from "@/components/charts/useWidth";
import { useReducedMotion } from "@/components/charts/useReducedMotion";
import { BallTip } from "./BallTip";
import { BAD, BORDER, GOOD, outcomeWord, positions, sideOf, signed1, type MatchView } from "./model";

/* ------------------------------------------------------------------ layout */
const H = 280;
const M = { left: 48, right: 18, top: 20, bottom: 28 };
const LINE = "#3A3A3A";
const GREY = "#9A8C7E";
const T = 0.5; // |WPA| threshold for green / red
const BADGE = ["①", "②", "③"];

function markerColor(wpa: number) {
  return wpa > T ? GOOD : wpa < -T ? BAD : null; // null = grey hollow
}

/** "OUT — caught, b Akash Singh" / "SIX off Mohsin Khan" / "WICKET — Virat Kohli caught" */
function momentText(d: EvidenceDelivery, side: "bat" | "bowl") {
  const how = d.outcome.match(/\(([^)]+)\)/)?.[1]?.toLowerCase();
  if (d.wicket) {
    return side === "bat"
      ? `OUT${how ? ` — ${how}` : ""}, b ${d.bowler ?? d.opponent}`
      : `WICKET — ${d.batter ?? d.opponent}${how ? ` ${how}` : ""}`;
  }
  const w = outcomeWord(d).replace(/ \(.*\)/, "");
  return `${w} ${side === "bat" ? "off" : "to"} ${side === "bat" ? d.bowler ?? d.opponent : d.batter ?? d.opponent}`;
}

export function PressureStoryChart({
  view,
  onPick,
  pinned,
}: {
  view: MatchView;
  onPick?: (idx: number) => void;
  pinned?: number | null;
}) {
  const reduce = useReducedMotion();
  const [wrap, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const [focus, setFocus] = useState<number | null>(null); // highlighted from a key-moment card
  const role = view.player.role;
  const mine = view.player.deliveries;
  const surname = view.player.name.split(" ").slice(-1)[0];

  // the innings the player was most involved in
  const inn = useMemo(() => {
    const c = [0, 0, 0];
    for (const d of mine) c[d.innings]++;
    return c[2] > c[1] ? 2 : 1;
  }, [mine]);
  const balls = useMemo(() => view.curve.filter((b) => b.innings === inn), [view.curve, inn]);
  const pos = useMemo(() => positions(balls), [balls]);
  const myBalls = useMemo(() => mine.filter((d) => d.innings === inn).sort((a, b) => a.idx - b.idx), [mine, inn]);
  const markers = useMemo(() => myBalls.filter((d) => d.isPressure), [myBalls]);
  const side: "bat" | "bowl" = myBalls.length ? sideOf(myBalls[0], role) : "bat";

  // zoom: first to last ball the player was involved in, ±0.5 over, snapped to whole overs
  const first = myBalls.length ? pos.get(myBalls[0].idx) ?? 0 : 0;
  const last = myBalls.length ? pos.get(myBalls[myBalls.length - 1].idx) ?? 20 : 20;
  const x0 = Math.max(0, Math.floor(first - 0.5));
  const x1 = Math.min(20, Math.max(x0 + 1, Math.ceil(last + 0.5)));
  const lastD = myBalls[myBalls.length - 1];
  const outBall = side === "bat" && lastD?.wicket ? lastD : null;

  const plotW = Math.max(10, width - M.left - M.right);
  const plotH = H - M.top - M.bottom;
  const x = (p: number) => M.left + ((p - x0) / (x1 - x0)) * plotW;
  const y = (wp: number) => M.top + (1 - wp / 100) * plotH;
  const teamWp = (b: ReplayBall) => (view.player.isA ? b.wp : 100 - b.wp);
  const ballAt = useMemo(() => new Map(balls.map((b) => [b.idx, b])), [balls]);

  // line: only the stretch the player was involved in (stops at his dismissal)
  const drawn = balls.filter((b) => {
    const p = pos.get(b.idx) ?? 0;
    return p >= x0 && p <= (outBall ? last : x1);
  });
  const linePts = drawn.map((b) => [x(pos.get(b.idx) ?? 0), y(teamWp(b))] as [number, number]);
  const line = monotonePath(linePts);
  const lineY = (px: number) => {
    for (let i = 1; i < linePts.length; i++) {
      if (linePts[i][0] >= px) {
        const [ax, ay] = linePts[i - 1];
        const [bx, by] = linePts[i];
        return ay + ((px - ax) / Math.max(1e-6, bx - ax)) * (by - ay);
      }
    }
    return linePts.length ? linePts[linePts.length - 1][1] : y(50);
  };

  // marker geometry: diameter 6–14 px by |WPA|, wickets 16 px
  const maxAbs = Math.max(1, ...markers.map((d) => Math.abs(d.wpa)));
  const diam = (d: EvidenceDelivery) => (d.wicket ? 16 : 6 + 8 * Math.min(1, Math.abs(d.wpa) / maxAbs));
  const top3 = [...markers].sort((a, b) => Math.abs(b.wpa) - Math.abs(a.wpa)).slice(0, 3);

  // numbers for tiles and the sentence (pressure balls only)
  const nDots = markers.filter((d) => d.runs === 0 && !d.wicket && d.outcome !== "wide").length;
  const bnd = markers.filter((d) => d.outcome === "four" || d.outcome === "six");
  const bndWpa = bnd.reduce((a, d) => a + d.wpa, 0);
  const wk = markers.filter((d) => d.wicket);
  const wkWpa = wk.reduce((a, d) => a + d.wpa, 0);
  const net = markers.reduce((a, d) => a + d.wpa, 0);
  const worst = markers.reduce<EvidenceDelivery | null>((a, d) => (d.wpa < (a?.wpa ?? 0) ? d : a), null);

  const sentence = (() => {
    if (!markers.length) return `${surname} had no pressure balls in this innings.`;
    const open =
      side === "bat"
        ? bnd.length
          ? `Scored freely under pressure (${signed1(bndWpa)} from boundaries)`
          : `Found no boundaries under pressure (${nDots} dots)`
        : wk.length
          ? `Took ${wk.length} wicket${wk.length > 1 ? "s" : ""} under pressure (${signed1(wkWpa)})`
          : `Built pressure with ${nDots} dot${nDots === 1 ? "" : "s"} but took no pressure wickets`;
    const hurt =
      worst && worst.wpa < -2
        ? ` but the ${worst.over} ${worst.wicket && side === "bat" ? "dismissal" : outcomeWord(worst).toLowerCase().replace(/ \(.*\)/, "")} cost ${signed1(worst.wpa)}`
        : "";
    const verdict = net >= 5 ? "clearly positive" : net >= 0 ? "slightly positive" : net > -5 ? "slightly negative" : "clearly negative";
    return `${open}${hurt}, so ${surname}'s net pressure impact was ${verdict} (${signed1(net)}).`;
  })();

  const active = hover ?? focus;
  const ad = active !== null ? markers.find((d) => d.idx === active) : undefined;
  const ab = ad ? ballAt.get(ad.idx) : undefined;

  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    if (!markers.length) return;
    const i = active === null ? -1 : markers.findIndex((d) => d.idx === active);
    if (e.key === "ArrowRight") {
      e.preventDefault();
      setHover(markers[Math.min(markers.length - 1, i + 1)].idx);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      setHover(markers[Math.max(0, (i < 0 ? markers.length : i) - 1)].idx);
    } else if ((e.key === "Enter" || e.key === " ") && active !== null) {
      e.preventDefault();
      onPick?.(active);
    } else if (e.key === "Escape") {
      setHover(null);
      setFocus(null);
    }
  };

  const tile = (k: string, v: string, tone?: string) => (
    <div className="rounded-xl border bg-white px-3 py-2" style={{ borderColor: BORDER }}>
      <div className={cx("tnum font-display text-[20px] font-semibold leading-tight", tone)}>{v}</div>
      <div className="text-[11.5px] text-text-400">{k}</div>
    </div>
  );

  return (
    <div>
      {/* summary tiles + sentence */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {tile("Pressure balls", String(markers.length))}
        {tile("Dots", String(nDots))}
        {tile(side === "bat" ? "Boundaries" : "Boundaries conceded", String(bnd.length))}
        {tile("Net pressure WPA", signed1(net), net >= 0 ? "text-[#2F7D5B]" : "text-[#C0453B]")}
      </div>
      <p className="mt-2 text-[13.5px] leading-relaxed text-text-100">{sentence}</p>

      {/* legend: exactly the marks on the chart */}
      <div className="mt-3 flex flex-wrap items-center justify-end gap-x-4 gap-y-1 text-[11.5px] text-text-400">
        <span className="inline-flex items-center gap-1.5">
          <svg width="12" height="12" aria-hidden><circle cx="6" cy="6" r="5" fill={GOOD} /></svg> WPA &gt; +{T}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <svg width="12" height="12" aria-hidden><circle cx="6" cy="6" r="5" fill={BAD} /></svg> WPA &lt; −{T}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <svg width="12" height="12" aria-hidden><circle cx="6" cy="6" r="4.3" fill="white" stroke={GREY} strokeWidth="1.4" /></svg> in between
        </span>
        <span className="inline-flex items-center gap-1.5">
          <svg width="16" height="16" aria-hidden>
            <circle cx="8" cy="8" r="7.5" fill={side === "bat" ? BAD : GOOD} />
            <text x="8" y="11" textAnchor="middle" fontSize="9" fontWeight="700" fill="white">W</text>
          </svg>
          wicket
        </span>
        <span>size = |WPA|</span>
      </div>

      {/* the chart */}
      <div ref={wrap} className="relative mt-1 w-full" style={{ height: H }}>
        {width > 0 && (
          <svg
            width={width}
            height={H}
            viewBox={`0 0 ${width} ${H}`}
            tabIndex={0}
            role="img"
            aria-label={`${view.player.team} win probability from over ${x0} to ${x1}, with ${view.player.name}'s ${markers.length} pressure balls. Arrow keys step through them, Enter opens one in Over by Over.`}
            className="block select-none rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3B6FB6]/60"
            onKeyDown={onKey}
            onBlur={() => setHover(null)}
          >
            {/* y axis */}
            {[0, 25, 50, 75, 100].map((t) => (
              <g key={t}>
                {t !== 50 && <line x1={M.left} x2={M.left + plotW} y1={y(t)} y2={y(t)} stroke="rgba(60,40,20,0.07)" />}
                <text x={M.left - 8} y={y(t) + 3.5} textAnchor="end" fontSize={10.5} fill="#8A7A6A" className="tnum">
                  {t}%
                </text>
              </g>
            ))}
            <line x1={M.left} x2={M.left + plotW} y1={y(50)} y2={y(50)} stroke="rgba(60,40,20,0.4)" strokeDasharray="4 4" />
            <text x={M.left + plotW - 2} y={y(50) - 5} textAnchor="end" fontSize={10.5} fontWeight={600} fill="#5E5046">
              Even
            </text>
            <text x={M.left} y={11} fontSize={10.5} fill="#8A7A6A">
              {view.player.team} win probability
            </text>

            {/* x axis: one tick per over */}
            {Array.from({ length: x1 - x0 + 1 }, (_, k) => x0 + k).map((o) => (
              <g key={o}>
                <line x1={x(o)} x2={x(o)} y1={M.top + plotH} y2={M.top + plotH + 4} stroke="rgba(60,40,20,0.3)" />
                {(x1 - x0 <= 12 || o % 2 === 0) && (
                  <text x={x(o)} y={M.top + plotH + 17} textAnchor="middle" fontSize={10.5} fill="#8A7A6A" className="tnum">
                    {o}
                  </text>
                )}
              </g>
            ))}
            <text x={M.left + plotW} y={H - 1} textAnchor="end" fontSize={10} fill="#8A7A6A">
              overs
            </text>

            {/* line */}
            <path
              key={`${view.id}-${view.player.id}`}
              d={line}
              fill="none"
              stroke={LINE}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              pathLength={1}
              className={reduce ? "" : "ms-draw"}
            />

            {/* dismissal */}
            {outBall && (
              <g pointerEvents="none">
                <line x1={x(last)} x2={x(last)} y1={M.top} y2={M.top + plotH} stroke={BAD} strokeDasharray="4 3" strokeWidth={1.2} />
                <text x={x(last) + 5} y={M.top + 10} fontSize={10.5} fontWeight={700} fill={BAD}>
                  OUT {outBall.over}
                </text>
              </g>
            )}

            {/* hairline at the hovered / highlighted pressure ball */}
            {ad && (
              <line x1={x(pos.get(ad.idx) ?? 0)} x2={x(pos.get(ad.idx) ?? 0)} y1={M.top} y2={M.top + plotH} stroke="rgba(43,33,24,0.35)" pointerEvents="none" />
            )}

            {/* pressure-ball markers */}
            {markers.map((d) => {
              const b = ballAt.get(d.idx);
              if (!b) return null;
              const cx0 = x(pos.get(d.idx) ?? 0);
              const cy0 = y(teamWp(b));
              const r = diam(d) / 2;
              const col = markerColor(d.wpa);
              const on = active === d.idx || pinned === d.idx;
              const glyph = d.wicket ? "W" : r * 2 >= 12 && (d.outcome === "four" || d.outcome === "six") ? (d.outcome === "four" ? "4" : "6") : "";
              return (
                <g key={d.idx} style={{ cursor: "pointer" }} onMouseEnter={() => setHover(d.idx)} onMouseLeave={() => setHover(null)} onClick={() => onPick?.(d.idx)}>
                  <circle cx={cx0} cy={cy0} r={Math.max(r + 5, 9)} fill="transparent" />
                  {on && <circle cx={cx0} cy={cy0} r={r + 4} fill="none" stroke="#2B2118" strokeOpacity={0.45} strokeWidth={1.5} />}
                  {col || d.wicket ? (
                    <circle cx={cx0} cy={cy0} r={r} fill={col ?? (side === "bat" ? BAD : GOOD)} stroke="white" strokeWidth={1.2} />
                  ) : (
                    <circle cx={cx0} cy={cy0} r={Math.max(2.4, r - 0.7)} fill="white" stroke={GREY} strokeWidth={1.4} />
                  )}
                  {glyph && (
                    <text x={cx0} y={cy0 + 3.2} textAnchor="middle" fontSize={d.wicket ? 9.5 : 8.5} fontWeight={700} fill="white" pointerEvents="none">
                      {glyph}
                    </text>
                  )}
                </g>
              );
            })}

            {/* ①②③ badges, offset away from the line */}
            {top3.map((d, i) => {
              const b = ballAt.get(d.idx);
              if (!b) return null;
              const cx0 = x(pos.get(d.idx) ?? 0);
              const cy0 = y(teamWp(b));
              const r = diam(d) / 2;
              const bx = Math.min(M.left + plotW - 8, cx0 + r + 8);
              let by = d.wpa >= 0 ? cy0 - r - 9 : cy0 + r + 9;
              if (Math.abs(lineY(bx) - by) < 11) by = d.wpa >= 0 ? cy0 + r + 9 : cy0 - r - 9;
              by = Math.max(M.top + 8, Math.min(M.top + plotH - 8, by));
              return (
                <g key={`b${d.idx}`} pointerEvents="none">
                  <circle cx={bx} cy={by} r={7.5} fill="white" stroke="#2B2118" strokeOpacity={0.55} />
                  <text x={bx} y={by + 3.6} textAnchor="middle" fontSize={10} fontWeight={700} fill="#2B2118">
                    {i + 1}
                  </text>
                </g>
              );
            })}
          </svg>
        )}
        {ad && ab && wrap.current && (
          <FloatingTip
            x={wrap.current.getBoundingClientRect().left + x(pos.get(ad.idx) ?? 0)}
            y={wrap.current.getBoundingClientRect().top + y(teamWp(ab)) - diam(ad) / 2 - 4}
          >
            <BallTip view={view} d={ad} />
          </FloatingTip>
        )}
      </div>

      {/* key moments, matching the badges */}
      {top3.length > 0 && (
        <div className="mt-3 grid gap-2 md:grid-cols-3">
          {top3.map((d, i) => (
            <button
              key={d.idx}
              onClick={() => setFocus(focus === d.idx ? null : d.idx)}
              aria-pressed={focus === d.idx}
              className={cx(
                "rounded-xl border border-l-4 bg-white px-3 py-2.5 text-left transition hover:bg-[#FBF6EE] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3B6FB6]/60",
                focus === d.idx && "bg-[#FBF6EE]",
              )}
              style={{ borderColor: BORDER, borderLeftColor: d.wpa >= 0 ? GOOD : BAD }}
            >
              <div className="flex items-baseline gap-2">
                <span className="text-[15px] font-bold leading-none">{BADGE[i]}</span>
                <span className="tnum text-[13px] font-semibold">{d.over}</span>
                <span className="min-w-0 truncate text-[13px] font-medium">· {momentText(d, side)}</span>
              </div>
              <div className="tnum mt-1 flex items-baseline justify-between gap-2 text-[12px] text-text-400">
                <span>
                  {view.player.team} win prob {d.wpBefore.toFixed(0)}% → {d.wpAfter.toFixed(0)}%
                </span>
                <span className={cx("text-[13px] font-semibold", d.wpa >= 0 ? "text-[#2F7D5B]" : "text-[#C0453B]")}>{signed1(d.wpa)}</span>
              </div>
            </button>
          ))}
        </div>
      )}
      <p className="mt-2 text-[11.5px] text-text-400">
        Showing overs {x0}–{x1}, the stretch {surname} was involved in. Hover a marker for the ball; click it (or press Enter) to open it in Over by Over.
        {myBalls.length > markers.length ? ` ${myBalls.length - markers.length} of his ${myBalls.length} balls were not pressure balls and are not marked.` : ""}
      </p>
    </div>
  );
}
