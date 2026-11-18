"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { cx } from "@/lib/format";
import { PressureMeter } from "./BallTip";
import { BORDER, pressureLevel, signed1, stateOf, type MatchView } from "./model";

/** Compact raw table for judges: sticky header, zebra rows, tabular WPA, pressure meter, CSV export. */
export function BallLog({ view }: { view: MatchView }) {
  const [onlyP, setOnlyP] = useState(true);
  const all = [...view.player.deliveries].sort((a, b) => a.idx - b.idx);
  const rows = onlyP ? all.filter((d) => d.isPressure) : all;

  const csv = () => {
    const head = ["innings", "over", "bowler", "batter", "outcome", "runs", "state", "rrr", "pressure_index", "pressure_level", "is_pressure_ball",
      "win_prob_before", "win_prob_after", "wpa", "leverage", "stakes", "threat", "threat_tier", "situation"];
    const esc = (v: string | number | boolean | null) => {
      const s = v === null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = rows.map((d) => {
      const st = stateOf(d);
      return [d.innings, d.over, d.bowler ?? "", d.batter ?? "", d.outcome, d.runs, d.state, st.rrr === null ? "" : st.rrr.toFixed(2), d.pressure,
        pressureLevel(d.pressure), d.isPressure, d.wpBefore, d.wpAfter, d.wpa, d.factors.leverage, d.factors.stakes, d.factors.threat,
        d.factors.threatTier, d.situation].map(esc).join(",");
    });
    const blob = new Blob([[head.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${view.player.name.replace(/\s+/g, "_")}_${view.teamACode}_v_${view.teamBCode}_${view.date}${onlyP ? "_pressure" : ""}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1.5" role="radiogroup" aria-label="Deliveries shown">
          {[
            { v: true, l: `Pressure balls (${all.filter((d) => d.isPressure).length})` },
            { v: false, l: `All his balls (${all.length})` },
          ].map((o) => (
            <button
              key={String(o.v)}
              role="radio"
              aria-checked={onlyP === o.v}
              onClick={() => setOnlyP(o.v)}
              className={cx(
                "rounded-full px-3 py-1 text-[12px] font-semibold transition",
                onlyP === o.v ? "bg-text-100 text-white" : "bg-white text-text-400 ring-1 ring-[#EADFCB] hover:text-text-100",
              )}
            >
              {o.l}
            </button>
          ))}
        </div>
        <button
          onClick={csv}
          className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-[12px] font-semibold text-text-100 ring-1 ring-[#EADFCB] hover:bg-[#FBF6EE]"
        >
          <Download size={13} /> Export CSV
        </button>
      </div>
      <div className="max-h-[520px] overflow-auto rounded-2xl border bg-white" style={{ borderColor: BORDER }}>
        <table className="w-full min-w-[820px] text-left text-[12px]">
          <thead className="sticky top-0 z-10 bg-[#FBF6EE] text-[10.5px] uppercase tracking-[0.08em] text-text-400">
            <tr>
              <th className="px-3 py-2 font-semibold">Over</th>
              <th className="px-3 py-2 font-semibold">Bowler → batter</th>
              <th className="px-3 py-2 font-semibold">Outcome</th>
              <th className="px-3 py-2 font-semibold">State</th>
              <th className="px-3 py-2 font-semibold">Pressure</th>
              <th className="px-3 py-2 text-right font-semibold">Lev × stakes × threat</th>
              <th className="px-3 py-2 text-right font-semibold">Win prob</th>
              <th className="px-3 py-2 text-right font-semibold">WPA</th>
            </tr>
          </thead>
          <tbody className="tnum">
            {rows.map((d, i) => {
              const st = stateOf(d);
              return (
                <tr key={d.idx} className={cx(i % 2 ? "bg-[#FCF9F4]" : "bg-white", !d.isPressure && "text-text-400")}>
                  <td className="px-3 py-1.5 font-semibold">{d.over}</td>
                  <td className="px-3 py-1.5">
                    {d.bowler ?? "–"} → {d.batter ?? "–"}
                  </td>
                  <td className="px-3 py-1.5 capitalize">{d.outcome}</td>
                  <td className="px-3 py-1.5 text-text-400">
                    {st.text}
                    {st.rrr !== null && ` · RRR ${st.rrr.toFixed(1)}`}
                  </td>
                  <td className="px-3 py-1.5">
                    <span className="inline-flex items-center gap-1.5" title={`${pressureLevel(d.pressure)} (${d.pressure.toFixed(2)})`}>
                      <PressureMeter p={d.pressure} />
                      <span className="text-[11px] text-text-400">{d.pressure.toFixed(2)}</span>
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-right text-text-400">
                    {d.factors.leverage.toFixed(2)} × {d.factors.stakes.toFixed(2)} × {d.factors.threat.toFixed(2)}
                  </td>
                  <td className="px-3 py-1.5 text-right text-text-400">
                    {d.wpBefore.toFixed(0)}% → {d.wpAfter.toFixed(0)}%
                  </td>
                  <td className={cx("px-3 py-1.5 text-right font-semibold", d.wpa >= 0 ? "text-[#2F7D5B]" : "text-[#C0453B]")}>{signed1(d.wpa)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
