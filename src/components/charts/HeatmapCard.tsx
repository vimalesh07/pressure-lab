"use client";

import { useState } from "react";
import { Grid3x3 } from "lucide-react";
import type { Heatmap, HeatmapCell } from "@/lib/types";
import { cx, perfColor } from "@/lib/format";
import { Card, CardHeader } from "@/components/ui/Card";
import { LegendItem } from "@/components/ui/Controls";
import { FloatingTip, TooltipBox, TooltipRow } from "./ChartTooltip";

const WEAK_BELOW = 85;

function defaultFormula(h: Heatmap) {
  return h.rowLabel === "Batter tier"
    ? "Pressure run index = (expected runs for those balls ÷ actual runs conceded) × 100. 100 = as expected, above 100 = stronger, below 100 = weaker."
    : "Pressure run index = (actual runs scored ÷ expected runs for those balls) × 100. 100 = as expected, above 100 = stronger, below 100 = weaker.";
}

/** Weakness heatmap: rows × phase, pressure balls only. Low-sample cells are grey, hatched and tagged. */
export function HeatmapCard({ heatmap, index, className }: { heatmap: Heatmap; index?: number; className?: string }) {
  const [hover, setHover] = useState<{ key: string; x: number; y: number } | null>(null);
  const cell = (r: string, c: string) => heatmap.cells.find((x) => x.row === r && x.col === c);
  const bowler = heatmap.rowLabel === "Batter tier";
  const L = {
    balls: heatmap.ballsLabel ?? (bowler ? "Balls bowled" : "Balls faced"),
    runs: heatmap.runsLabel ?? (bowler ? "Runs conceded" : "Runs"),
    rate: heatmap.rateLabel ?? (bowler ? "Economy" : "Strike rate"),
    dis: heatmap.dismissalsLabel ?? (bowler ? "Wickets" : "Dismissals"),
  };
  const show = (key: string, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    setHover({ key, x: r.left + r.width / 2, y: r.top });
  };

  const tipFor = (r: string, c: string, v: HeatmapCell | undefined, low: boolean) => (
    <TooltipBox title={`${r} · ${c}`}>
      <TooltipRow label={L.balls} value={v?.balls ?? 0} />
      {v && v.value !== null && (
        <>
          {v.runs !== undefined && <TooltipRow label={L.runs} value={v.runs} />}
          {v.expRuns !== undefined && <TooltipRow label="Expected runs" value={v.expRuns.toFixed(1)} />}
          {v.rate !== undefined && <TooltipRow label={L.rate} value={bowler ? v.rate.toFixed(2) : v.rate.toFixed(1)} />}
          {v.dismissals !== undefined && <TooltipRow label={L.dis} value={v.dismissals} />}
        </>
      )}
      <TooltipRow label="Pressure run index" value={v?.value ?? "no data"} />
      {low && v && v.value !== null && (
        <div className="max-w-[220px] pt-1 text-[11px] leading-snug text-gold-400">
          Low sample: fewer than {heatmap.minBalls} balls, so this index is not a reliable strength or weakness.
        </div>
      )}
    </TooltipBox>
  );

  const hv = (() => {
    if (!hover) return null;
    const [r, c] = hover.key.split("|");
    const v = cell(r, c);
    return { r, c, v, low: !v || v.value === null || v.balls < heatmap.minBalls };
  })();

  return (
    <Card index={index} className={cx("p-5", className)}>
      <CardHeader
        icon={<Grid3x3 size={16} />}
        title="Weakness map"
        subtitle={`${heatmap.rowLabel} × ${heatmap.colLabel}, pressure balls only. ${heatmap.formula ?? defaultFormula(heatmap)}`}
      />
      <div role="table" aria-label="Weakness heatmap" className="w-full">
        <div role="row" className="grid grid-cols-[minmax(96px,132px)_repeat(3,minmax(0,1fr))] gap-1.5 pb-1.5">
          <span role="columnheader" className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-text-400">
            {heatmap.rowLabel}
          </span>
          {heatmap.cols.map((c) => (
            <span key={c} role="columnheader" className="text-center text-[10.5px] font-semibold uppercase tracking-[0.12em] text-text-400">
              {c}
            </span>
          ))}
        </div>
        {heatmap.rows.map((r, ri) => (
          <div key={r} role="row" className="grid grid-cols-[minmax(96px,132px)_repeat(3,minmax(0,1fr))] gap-1.5 pb-1.5">
            <span role="rowheader" className="self-center truncate text-[12.5px] text-text-100">
              {r}
            </span>
            {heatmap.cols.map((c) => {
              const v = cell(r, c);
              const key = `${r}|${c}`;
              const empty = !v || v.value === null;
              const low = empty || v!.balls < heatmap.minBalls;
              const val = empty ? null : v!.value!;
              const weak = !low && val !== null && val < WEAK_BELOW;
              const strong = !low && val !== null && Math.abs(val - 100) / 50 > 0.6;
              return (
                <div
                  key={c}
                  role="cell"
                  tabIndex={0}
                  aria-label={`${r}, ${c}: ${empty ? "no data" : `index ${val}${low ? ", low sample" : ""}${weak ? ", below 85" : ""}`}, ${v?.balls ?? 0} balls`}
                  onMouseEnter={(e) => show(key, e.currentTarget)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={(e) => show(key, e.currentTarget)}
                  onBlur={() => setHover(null)}
                  className={cx(
                    "rise relative flex h-[52px] items-center justify-center rounded-lg ring-1 ring-ink/[0.06] transition-shadow hover:ring-2 hover:ring-ink/20",
                    low && "hatch",
                  )}
                  style={{ background: low ? undefined : perfColor(val!), ["--i" as string]: ri }}
                >
                  {!empty && (
                    <span className={cx("tnum absolute left-1.5 top-1 text-[9.5px] leading-none", strong ? "text-white/80" : "text-text-400")}>
                      n={v!.balls}
                    </span>
                  )}
                  {weak && (
                    <span aria-hidden className={cx("absolute right-1.5 top-1 text-[10px] leading-none", strong ? "text-white" : "text-pink-500")}>
                      ▼
                    </span>
                  )}
                  <span
                    className={cx(
                      "tnum text-[14px] leading-none",
                      low ? "font-medium text-text-400" : strong ? "font-semibold text-white" : "font-semibold text-text-100",
                    )}
                  >
                    {empty ? "—" : val}
                  </span>
                  {low && !empty && (
                    <span className="absolute bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-bg-800/90 px-1.5 text-[9px] font-medium leading-[13px] text-text-400 ring-1 ring-ink/10">
                      low sample
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      {hover && hv && (
        <FloatingTip x={hover.x} y={hover.y}>
          {tipFor(hv.r, hv.c, hv.v, hv.low)}
        </FloatingTip>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-2 text-[11.5px] text-text-400">
          <span>Weaker</span>
          <span
            className="h-2 w-28 rounded-full"
            style={{ background: "linear-gradient(90deg, rgba(178,58,98,0.9), rgba(122,106,88,0.15), rgba(74,115,168,0.9))" }}
          />
          <span>Stronger</span>
        </div>
        <LegendItem color="" label={`< ${heatmap.minBalls} balls: low sample, not coloured`} shape="hatch" />
        <span className="text-[11.5px] text-text-400">
          <span className="text-pink-500">▼</span> = index below {WEAK_BELOW}
        </span>
        <span className="text-[11.5px] text-text-400">n = pressure balls in the cell</span>
      </div>
    </Card>
  );
}
