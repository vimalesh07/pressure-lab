"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { EvidenceDelivery } from "@/lib/types";
import { cx } from "@/lib/format";
import { FloatingTip } from "@/components/charts/ChartTooltip";
import { BallTip } from "./BallTip";
import { BORDER, ROSE, chipOf, sideOf, signed1, type MatchView } from "./model";

type Filter = "all" | "pressure" | "boundaries" | "dots";

const CHIP: Record<string, string> = {
  dot: "bg-[#EFE8DC] text-[#8A7A6A]",
  run: "bg-white text-text-100 ring-1 ring-[#E4D8C4]",
  four: "bg-[#3B6FB6] text-white",
  six: "bg-[#7B4FB0] text-white",
  wkt: "bg-[#C0453B] text-white",
  extra: "bg-white text-[#8A7A6A] ring-1 ring-dashed ring-[#D9CBB5] text-[10px]",
};

const matches = (d: EvidenceDelivery, f: Filter) =>
  f === "all" ||
  (f === "pressure" && d.isPressure) ||
  (f === "boundaries" && (d.outcome === "four" || d.outcome === "six")) ||
  (f === "dots" && d.runs === 0 && !d.wicket && d.outcome !== "wide");

/** Cricbuzz-style over rows: the player's balls in each over as chips, the over's WPA and win-prob change. */
export function OverByOver({ view, pinned }: { view: MatchView; pinned?: number | null }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [tip, setTip] = useState<{ d: EvidenceDelivery; x: number; y: number } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const role = view.player.role;

  const overs = useMemo(() => {
    const g = new Map<string, EvidenceDelivery[]>();
    for (const d of [...view.player.deliveries].sort((a, b) => a.idx - b.idx)) {
      const k = `${d.innings}|${d.over.split(".")[0]}`;
      g.set(k, [...(g.get(k) ?? []), d]);
    }
    return [...g.entries()].map(([k, ds]) => {
      const [inn, o] = k.split("|").map(Number);
      const side = sideOf(ds[0], role);
      return {
        key: k,
        inn,
        over: o + 1,
        side,
        who: side === "bat" ? ds[0].bowler ?? ds[0].opponent : view.player.name,
        runs: ds.reduce((a, d) => a + d.runs, 0),
        wpa: ds.reduce((a, d) => a + d.wpa, 0),
        from: ds[0].wpBefore,
        to: ds[ds.length - 1].wpAfter,
        balls: ds,
      };
    });
  }, [view, role]);
  const shown = overs.filter((o) => o.balls.some((d) => matches(d, filter)));
  const twoInnings = new Set(overs.map((o) => o.inn)).size > 1;

  useEffect(() => {
    if (pinned === null || pinned === undefined) return;
    const el = listRef.current?.querySelector(`[data-ball="${pinned}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [pinned]);

  const pills: { v: Filter; label: string }[] = [
    { v: "all", label: "All overs" },
    { v: "pressure", label: "Pressure only" },
    { v: "boundaries", label: "Boundaries" },
    { v: "dots", label: "Dots" },
  ];

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Filter overs">
          {pills.map((p) => (
            <button
              key={p.v}
              role="radio"
              aria-checked={filter === p.v}
              onClick={() => setFilter(p.v)}
              className={cx(
                "rounded-full px-3 py-1 text-[12px] font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3B6FB6]/60",
                filter === p.v ? "bg-text-100 text-white" : "bg-white text-text-400 ring-1 ring-[#EADFCB] hover:text-text-100",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-text-400">
          {[
            ["dot", "•", "dot"],
            ["four", "4", "four"],
            ["six", "6", "six"],
            ["wkt", "W", "wicket"],
          ].map(([k, g, l]) => (
            <span key={k} className="inline-flex items-center gap-1">
              <span className={cx("grid h-4 w-4 place-items-center rounded-full text-[9px] font-bold", CHIP[k])}>{g}</span>
              {l}
            </span>
          ))}
          <span className="inline-flex items-center gap-1">
            <span className="h-4 w-4 rounded-full bg-white" style={{ boxShadow: `0 0 0 2px ${ROSE}` }} /> pressure ball
          </span>
        </div>
      </div>

      <div ref={listRef} className="divide-y divide-[#F0E7D8] rounded-2xl border bg-white" style={{ borderColor: BORDER }}>
        {shown.length === 0 && <div className="px-4 py-6 text-center text-[13px] text-text-400">No overs match this filter.</div>}
        {shown.map((o) => (
          <div key={o.key} className="grid grid-cols-1 items-center gap-x-4 gap-y-2 px-4 py-3 sm:grid-cols-[minmax(0,220px)_minmax(0,1fr)_auto]">
            <div className="min-w-0 text-[13px]">
              <span className="tnum font-semibold">
                {twoInnings ? `Inn ${o.inn} · ` : ""}Ov {o.over}
              </span>
              <span className="text-text-400"> · {o.who}</span>
              <span className="tnum block text-[11.5px] text-text-400">
                {o.side === "bat" ? `${o.runs} run${o.runs === 1 ? "" : "s"} off his ${o.balls.length} ball${o.balls.length === 1 ? "" : "s"}` : `${o.runs} conceded`}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {o.balls.map((d) => {
                const c = chipOf(d);
                const dim = !matches(d, filter);
                const pin = pinned === d.idx;
                return (
                  <button
                    key={d.idx}
                    data-ball={d.idx}
                    aria-label={`${d.over} ${d.outcome}${d.isPressure ? ", pressure ball" : ""}, WPA ${signed1(d.wpa)}`}
                    onMouseEnter={(e) => {
                      const r = e.currentTarget.getBoundingClientRect();
                      setTip({ d, x: r.left + r.width / 2, y: r.top });
                    }}
                    onFocus={(e) => {
                      const r = e.currentTarget.getBoundingClientRect();
                      setTip({ d, x: r.left + r.width / 2, y: r.top });
                    }}
                    onMouseLeave={() => setTip(null)}
                    onBlur={() => setTip(null)}
                    className={cx(
                      "tnum grid h-8 w-8 place-items-center rounded-full text-[12.5px] font-bold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3B6FB6]",
                      CHIP[c.kind],
                      dim && "opacity-30",
                      pin && "scale-110",
                    )}
                    style={{
                      boxShadow: [d.isPressure ? `0 0 0 2px white, 0 0 0 4px ${ROSE}` : "", pin ? "0 0 0 7px rgba(194,80,122,0.18)" : ""].filter(Boolean).join(", ") || undefined,
                    }}
                  >
                    {c.glyph}
                  </button>
                );
              })}
            </div>
            <div className="tnum flex items-center gap-3 text-right sm:block">
              <div className={cx("text-[14px] font-semibold", o.wpa >= 0 ? "text-[#2F7D5B]" : "text-[#C0453B]")}>{signed1(o.wpa)}</div>
              <div className="text-[11.5px] text-text-400">
                {o.from.toFixed(0)}% → {o.to.toFixed(0)}%
              </div>
            </div>
          </div>
        ))}
      </div>
      {tip && (
        <FloatingTip x={tip.x} y={tip.y}>
          <BallTip view={view} d={tip.d} />
        </FloatingTip>
      )}
    </div>
  );
}
