"use client";

import type { EvidenceDelivery, ReplayBall } from "@/lib/types";
import { cx } from "@/lib/format";
import { outcomeWord, pressureLevel, signed1, stateOf, type MatchView } from "./model";

/** 5-bar pressure meter (also used in the ball log). */
export function PressureMeter({ p, className }: { p: number; className?: string }) {
  const n = Math.max(1, Math.ceil(p * 5));
  return (
    <span className={cx("inline-flex items-end gap-[2px]", className)} role="img" aria-label={`Pressure ${pressureLevel(p)} (${p.toFixed(2)})`}>
      {[0, 1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className="w-[3px] rounded-[1px]"
          style={{ height: 4 + i * 2, background: i < n ? (n >= 5 ? "#C2507A" : n >= 4 ? "#D27B97" : "#9DB2D3") : "rgba(60,40,20,0.12)" }}
        />
      ))}
    </span>
  );
}

/**
 * One tooltip card for any ball: the player's own deliveries get the full story
 * ("4.5 · Mayank Yadav → Vaibhav · SIX · 171 needed off 92 · RRR 11.2 · Pressure High (0.87) · Win prob 44% → 50% (+5.8)");
 * other balls in the innings get over, pressure and win probability from the curve.
 */
export function BallTip({
  view,
  d,
  ball,
  next,
  overWpa,
}: {
  view: MatchView;
  d?: EvidenceDelivery;
  ball?: ReplayBall;
  next?: ReplayBall;
  overWpa?: number;
}) {
  const teamWp = (b?: ReplayBall) => (b ? (view.player.isA ? b.wp : 100 - b.wp) : undefined);
  if (d) {
    const st = stateOf(d);
    return (
      <div className="w-[260px] rounded-2xl border border-[#EADFCB] bg-white px-3.5 py-3 text-[12px] shadow-[0_10px_28px_-14px_rgba(60,40,20,0.35)]">
        <div className="flex items-baseline justify-between gap-2">
          <span className="tnum font-display text-[14px] font-semibold">{d.over}</span>
          <span className={cx("rounded-full px-2 py-0.5 text-[10.5px] font-bold tracking-wide", d.wicket ? "bg-[#C0453B]/10 text-[#C0453B]" : d.runs >= 4 ? "bg-[#3B6FB6]/10 text-[#3B6FB6]" : "bg-ink/[0.05] text-text-400")}>
            {outcomeWord(d)}
          </span>
        </div>
        <div className="mt-0.5 font-medium text-text-100">
          {d.bowler ?? (d.side === "bowl" ? view.player.name : d.opponent)} → {d.batter ?? (d.side === "bowl" ? d.opponent : view.player.name)}
        </div>
        <div className="tnum mt-1.5 text-text-400">
          {st.text}
          {st.rrr !== null && ` · RRR ${st.rrr.toFixed(1)}`}
        </div>
        <div className="mt-1.5 flex items-center gap-2 text-text-400">
          <PressureMeter p={d.pressure} />
          <span>
            Pressure <span className="font-semibold text-text-100">{pressureLevel(d.pressure)}</span> ({d.pressure.toFixed(2)})
            {d.isPressure ? " · pressure ball" : ""}
          </span>
        </div>
        <div className="tnum mt-1.5 flex items-center justify-between border-t border-[#EADFCB] pt-1.5">
          <span className="text-text-400">
            Win prob {d.wpBefore.toFixed(0)}% → {d.wpAfter.toFixed(0)}%
          </span>
          <span className={cx("font-semibold", d.wpa >= 0 ? "text-[#2F7D5B]" : "text-[#C0453B]")}>{signed1(d.wpa)}</span>
        </div>
        {overWpa !== undefined && (
          <div className="tnum mt-1 flex justify-between text-text-400">
            <span>Over WPA ({view.player.name.split(" ").slice(-1)[0]})</span>
            <span className={cx("font-semibold", overWpa >= 0 ? "text-[#2F7D5B]" : "text-[#C0453B]")}>{signed1(overWpa)}</span>
          </div>
        )}
      </div>
    );
  }
  if (!ball) return null;
  const a = teamWp(ball);
  const b = teamWp(next);
  return (
    <div className="w-[230px] rounded-2xl border border-[#EADFCB] bg-white px-3.5 py-3 text-[12px] shadow-[0_10px_28px_-14px_rgba(60,40,20,0.35)]">
      <div className="tnum font-display text-[14px] font-semibold">{ball.over}</div>
      <div className="text-text-400">{view.player.name.split(" ").slice(-1)[0]} not involved in this ball</div>
      <div className="mt-1.5 flex items-center gap-2 text-text-400">
        <PressureMeter p={ball.pressure} />
        <span>
          Pressure {pressureLevel(ball.pressure)} ({ball.pressure.toFixed(2)})
        </span>
      </div>
      <div className="tnum mt-1.5 border-t border-[#EADFCB] pt-1.5 text-text-400">
        {view.player.team} win prob {a?.toFixed(0)}%{b !== undefined ? ` → ${b.toFixed(0)}%` : ""}
      </div>
      {overWpa !== undefined && (
        <div className="tnum mt-1 flex justify-between text-text-400">
          <span>Over WPA</span>
          <span className="font-semibold">{signed1(overWpa)}</span>
        </div>
      )}
    </div>
  );
}
