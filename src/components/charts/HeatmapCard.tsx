"use client";

import { useState } from "react";
import { Grid3x3 } from "lucide-react";
import type { Heatmap } from "@/lib/types";
import { cx, perfColor } from "@/lib/format";
import { Card, CardHeader } from "@/components/ui/Card";
import { LegendItem } from "@/components/ui/Controls";
import { TooltipBox, TooltipRow } from "./ChartTooltip";

/** Weakness heatmap: rows × phase, pressure balls only. Low-sample cells are hatched and greyed. */
export function HeatmapCard({ heatmap, index, className }: { heatmap: Heatmap; index?: number; className?: string }) {
  const [hover, setHover] = useState<string | null>(null);
  const cell = (r: string, c: string) => heatmap.cells.find((x) => x.row === r && x.col === c);
  return (
    <Card index={index} className={cx("p-5", className)}>
      <CardHeader
        icon={<Grid3x3 size={16} />}
        title="Weakness map"
        subtitle={`${heatmap.rowLabel} × ${heatmap.colLabel} · ${heatmap.metricLabel}`}
      />
      <div role="table" aria-label="Weakness heatmap" className="w-full">
        <div role="row" className="grid grid-cols-[132px_repeat(3,1fr)] gap-1.5 pb-1.5">
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
          <div key={r} role="row" className="grid grid-cols-[132px_repeat(3,1fr)] gap-1.5 pb-1.5">
            <span role="rowheader" className="self-center truncate text-[12.5px] text-text-100">
              {r}
            </span>
            {heatmap.cols.map((c) => {
              const v = cell(r, c);
              const key = `${r}|${c}`;
              const low = !v || v.value === null || v.balls < heatmap.minBalls;
              return (
                <div
                  key={c}
                  role="cell"
                  tabIndex={0}
                  onMouseEnter={() => setHover(key)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(key)}
                  onBlur={() => setHover(null)}
                  className={cx(
                    "rise relative flex h-10 items-center justify-center rounded-lg text-[13px] font-semibold ring-1 ring-ink/[0.06] transition-transform hover:scale-[1.04]",
                    low && "hatch text-text-400",
                  )}
                  style={{
                    background: low ? undefined : perfColor(v!.value!),
                    ["--i" as string]: ri,
                  }}
                >
                  <span className="tnum">{v?.value === null || !v ? "—" : v.value}</span>
                  {low && v && v.value !== null && <span className="sr-only">low sample</span>}
                  {v && v.value !== null && !low && v.value < 85 && (
                    <span aria-hidden className="absolute right-1.5 top-1 text-[9px] text-white/80">▼</span>
                  )}
                  {hover === key && (
                    <div className="absolute bottom-full left-1/2 z-20 mb-2 -translate-x-1/2">
                      <TooltipBox title={`${r} · ${c}`}>
                        <TooltipRow label="Index" value={v?.value ?? "no data"} />
                        <TooltipRow label="Pressure balls" value={v?.balls ?? 0} />
                        {low && <div className="pt-1 text-[11px] text-gold-400">Below {heatmap.minBalls}-ball minimum, treat with caution</div>}
                      </TooltipBox>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-2 text-[11.5px] text-text-400">
          <span>Weaker</span>
          <span
            className="h-2 w-28 rounded-full"
            style={{ background: "linear-gradient(90deg, rgba(178,58,98,0.9), rgba(122,106,88,0.15), rgba(74,115,168,0.9))" }}
          />
          <span>Stronger</span>
        </div>
        <LegendItem color="" label={`< ${heatmap.minBalls} balls (low sample)`} shape="hatch" />
        <span className="text-[11.5px] text-text-400">▼ = index below 85</span>
      </div>
    </Card>
  );
}
