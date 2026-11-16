import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { LeaderboardRow } from "@/lib/types";
import { cx, fmtInt } from "@/lib/format";
import { ConfidenceBand } from "./ConfidenceBand";
import { DeltaPill } from "./DeltaPill";
import { Sparkline } from "./Sparkline";
import { TeamChip } from "./TeamChip";

/** Shared column template so header and rows line up. */
export const RANK_GRID =
  "grid grid-cols-[44px_minmax(140px,1fr)_82px_100px_minmax(200px,1.3fr)_110px_110px_20px] items-center gap-x-5";

export function RankBadge({ rank, size = "md" }: { rank: number; size?: "sm" | "md" }) {
  const podium = rank <= 3;
  return (
    <span
      className={cx(
        "tnum grid place-items-center rounded-xl font-display font-semibold",
        size === "sm" ? "h-7 w-7 text-[13px]" : "h-9 w-9 text-[15px]",
        podium
          ? "bg-gradient-to-b from-gold-400/25 to-gold-400/5 text-gold-400 ring-1 ring-gold-400/50"
          : "bg-ink/[0.04] text-text-400 ring-1 ring-ink/10",
      )}
      aria-label={`Rank ${rank}`}
    >
      {rank}
    </span>
  );
}

export function RankHeader({ keyStat }: { keyStat: string }) {
  return (
    <div
      className={cx(
        RANK_GRID,
        "px-4 pb-2 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-text-400",
      )}
      role="row"
    >
      <span role="columnheader">#</span>
      <span role="columnheader">Player</span>
      <span role="columnheader" className="text-right">Rating</span>
      <span role="columnheader">Δ {keyStat}</span>
      <span role="columnheader">90% interval</span>
      <span role="columnheader" className="text-right">Sample</span>
      <span role="columnheader">Last 12</span>
      <span />
    </div>
  );
}

export function RankRow({
  row,
  index = 0,
  lowerIsBetter = false,
}: {
  row: LeaderboardRow;
  index?: number;
  lowerIsBetter?: boolean;
}) {
  return (
    <Link
      href={`/player/?id=${row.playerId}`}
      role="row"
      className={cx(
        RANK_GRID,
        "rise group rounded-2xl border border-transparent px-4 py-3 transition-colors hover:border-ink/10 hover:bg-bg-700/60",
        row.rank === 1 && "bg-gold-400/[0.045]",
      )}
      style={{ ["--i" as string]: index }}
    >
      <span role="cell">
        <RankBadge rank={row.rank} />
      </span>
      <span role="cell" className="min-w-0">
        <span className="block truncate font-display text-[15px] font-semibold text-text-100">{row.name}</span>
        <span className="mt-1 flex items-center gap-2">
          <TeamChip code={row.team} />
        </span>
      </span>
      <span role="cell" className="tnum text-right font-display text-[22px] font-semibold leading-none">
        {row.rating.toFixed(1)}
      </span>
      <span role="cell">
        <DeltaPill value={row.deltaPct} />
        <span className="sr-only">{lowerIsBetter ? "change in economy, sign adjusted so positive is better" : ""}</span>
      </span>
      <span role="cell">
        <ConfidenceBand low={row.ciLow} high={row.ciHigh} value={row.rating} width="100%" />
        <span className="tnum mt-1 flex justify-between text-[11px] text-text-400">
          <span>
            {row.ciLow.toFixed(0)}–{row.ciHigh.toFixed(0)}
          </span>
          <span aria-hidden>± {((row.ciHigh - row.ciLow) / 2).toFixed(1)}</span>
        </span>
      </span>
      <span role="cell" className="tnum text-right text-[13px]">
        <span className="block font-semibold text-text-100">{fmtInt(row.pressureBalls)} balls</span>
        <span className="block text-[11.5px] text-text-400">{row.matches} matches</span>
      </span>
      <span role="cell">
        <Sparkline values={row.spark} width={104} />
      </span>
      <ChevronRight size={16} className="text-text-400 transition-transform group-hover:translate-x-0.5 group-hover:text-pink-300" />
    </Link>
  );
}

/** Compact stacked row for phones: rank, name, rating, delta and interval. */
export function RankRowCompact({ row, index = 0 }: { row: LeaderboardRow; index?: number }) {
  return (
    <Link
      href={`/player/?id=${row.playerId}`}
      className="rise block rounded-2xl border border-ink/[0.06] bg-ink/[0.02] p-3"
      style={{ ["--i" as string]: index }}
    >
      <div className="flex items-center gap-3">
        <RankBadge rank={row.rank} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-display text-[15px] font-semibold">{row.name}</span>
            <TeamChip code={row.team} />
          </div>
          <div className="tnum mt-0.5 text-[11.5px] text-text-400">
            {fmtInt(row.pressureBalls)} balls · {row.matches} matches
          </div>
        </div>
        <div className="text-right">
          <div className="tnum font-display text-[20px] font-semibold leading-none">{row.rating.toFixed(1)}</div>
          <div className="mt-1">
            <DeltaPill value={row.deltaPct} size="sm" />
          </div>
        </div>
      </div>
      <div className="mt-2.5 flex items-center gap-2">
        <ConfidenceBand low={row.ciLow} high={row.ciHigh} value={row.rating} width="100%" />
        <span className="tnum shrink-0 text-[11px] text-text-400">
          {row.ciLow.toFixed(0)}–{row.ciHigh.toFixed(0)}
        </span>
      </div>
    </Link>
  );
}
