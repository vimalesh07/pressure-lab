"use client";

import { useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Shirt } from "lucide-react";
import type { LeaderboardRow } from "@/lib/types";
import { Card } from "@/components/ui/Card";
import { Segmented } from "@/components/ui/Controls";
import ClothingRailHero, { type RailGarment } from "@/components/ui/product-rail-gallery";
import { shirtName } from "@/lib/jerseys";
import { kitOf } from "@/lib/teamMeta";

export type BoardKind = "batters" | "bowlers" | "allrounders";

function deltaText(r: LeaderboardRow, kind: BoardKind) {
  const s = `${r.deltaPct >= 0 ? "+" : "−"}${Math.abs(r.deltaPct).toFixed(1)}%`;
  return kind === "bowlers" ? `${s} economy vs normal (+ = cheaper under pressure)` : `${s} SR under pressure`;
}

function toGarment(r: LeaderboardRow, kind: BoardKind): RailGarment {
  const kit = kitOf(r.team); // same scoped team as the table badge
  const team = r.team2 ? `${r.team} (${r.team2})` : r.team;
  return {
    id: r.playerId,
    name: `#${r.rank} ${r.name}`,
    description: `${team} · Pressure Rating ${r.rating.toFixed(1)} (90% interval ${r.ciLow.toFixed(0)}–${r.ciHigh.toFixed(0)}) · ${deltaText(r, kind)}`,
    kind: "tee",
    color: kit.shirt,
    trim: kit.trim,
    number: String(r.rank), // the data has no shirt numbers: the number is the rank
    printName: shirtName(r.name),
    crest: r.team,
    printColor: kit.text,
    tag: `#${r.rank}\n${r.rating.toFixed(1)}`,
  };
}

/**
 * Leaderboard hero: the top 10 as team shirts on a clothing rail. Takes the SAME rows as the table below
 * (single source of truth); hovering a shirt reports its player so the table can highlight the row, and a
 * click opens that player's profile.
 */
export function LeaderboardRail({
  rows,
  kind,
  onKind,
  scopeKey,
  emptyNote,
  onHover,
}: {
  rows: LeaderboardRow[];
  kind: BoardKind;
  onKind: (k: BoardKind) => void;
  /** Changes whenever the page filters change, so the rail re-hangs (format · season · phase). */
  scopeKey: string;
  emptyNote?: string;
  onHover?: (playerId: string | null) => void;
}) {
  const router = useRouter();
  const top = useMemo(() => rows.slice(0, 10), [rows]);
  const items = useMemo(() => top.map((r) => toGarment(r, kind)), [top, kind]);
  const onActive = useCallback((i: number | null) => onHover?.(i === null ? null : top[i]?.playerId ?? null), [onHover, top]);
  const onSelect = useCallback((i: number) => top[i] && router.push(`/player/?id=${top[i].playerId}`), [router, top]);
  const what = kind === "batters" ? "batters" : kind === "bowlers" ? "bowlers" : "all-rounders";

  return (
    <Card index={0} className="overflow-hidden p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-pink-500/10 text-pink-500 ring-1 ring-pink-500/20">
            <Shirt size={16} />
          </span>
          <div>
            <div className="font-display text-[15px] font-semibold leading-tight">Top 10 under pressure</div>
            <div className="text-[12px] text-text-400">Hover a shirt to turn it · click to open the player&apos;s profile</div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            label="Leaderboard"
            size="sm"
            value={kind}
            onChange={onKind}
            options={[
              { value: "batters", label: "Batters" },
              { value: "bowlers", label: "Bowlers" },
            ]}
          />
        </div>
      </div>
      {items.length > 0 ? (
        // phones: a horizontal scroll strip (4 shirts per screen) with snap points every shirt
        <div className="overflow-x-auto overscroll-x-contain [scrollbar-width:thin] snap-x snap-mandatory sm:overflow-visible">
          <div className="relative min-w-[200%] sm:min-w-0">
            <div aria-hidden className="pointer-events-none absolute inset-0 grid grid-cols-10">
              {items.map((it) => (
                <span key={it.id} className="snap-start" />
              ))}
            </div>
            <ClothingRailHero
              key={`${kind}-${scopeKey}-${items.map((i) => i.id).join(",")}`}
              items={items}
              hanger="wood"
              defaultActive={0}
              onActiveChange={onActive}
              onPickItem={onSelect}
              scrollable
              caption={`Top 10 ${what}`}
              className="bg-transparent!"
            />
          </div>
        </div>
      ) : (
        <div className="grid h-[200px] place-items-center px-6 text-center text-[13px] text-text-400">{emptyNote ?? "No ranked players for this filter."}</div>
      )}
    </Card>
  );
}
