"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Info, SearchX } from "lucide-react";
import { loadData, useData, type DataState } from "@/lib/data";
import type { EvidenceFile, LeaderboardRow } from "@/lib/types";
import { fmtInt } from "@/lib/format";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { RankHeader, RankRow, RankRowCompact } from "@/components/ui/RankRow";
import { DataGate, EmptyState, Skeleton } from "@/components/ui/Skeleton";
import { useFilters } from "@/components/layout/Filters";
import { LeaderboardRail, type BoardKind } from "@/components/LeaderboardRail";

const KINDS: BoardKind[] = ["batters", "bowlers"];

/** All-rounder rows (overall only) from evidence.json, in the same shape as the leaderboard rows. */
function allrounderRows(ev: EvidenceFile): LeaderboardRow[] {
  return Object.values(ev.players)
    .filter((p) => p.role === "allrounder")
    .sort((a, b) => a.rank - b.rank)
    .map((p) => ({
      rank: p.rank,
      playerId: p.playerId,
      name: p.name,
      team: p.team,
      team2: p.team2 ?? null,
      teamsOther: p.teamsOther ?? [],
      rating: p.rating,
      deltaPct: p.compare.normal ? (100 * (p.compare.pressure - p.compare.normal)) / p.compare.normal : 0,
      ciLow: p.ratingLo,
      ciHigh: p.ratingHi,
      pressureBalls: p.pressureBalls,
      matches: p.pressureMatches,
      spark: [],
    }));
}

function LeaderboardsInner() {
  const params = useSearchParams();
  const router = useRouter();
  const asKind = (t: string | null): BoardKind => (KINDS.includes(t as BoardKind) ? (t as BoardKind) : "batters");
  const [tab, setTab] = useState<BoardKind>(asKind(params.get("tab")));
  useEffect(() => setTab(asKind(params.get("tab"))), [params]);
  const highlight = params.get("highlight");
  const [hot, setHot] = useState<string | null>(null);

  const bat = useData("leaderboard_batters.json");
  const bowl = useData("leaderboard_bowlers.json");
  const players = useData("players.json");
  const [ev, setEv] = useState<EvidenceFile | null>(null);
  useEffect(() => {
    if (tab === "allrounders" && !ev) loadData("evidence.json").then(setEv).catch(() => setEv(null));
  }, [tab, ev]);
  const state = tab === "bowlers" ? bowl : bat;
  const { format, season, phase } = useFilters();
  const isAr = tab === "allrounders";

  const view = useMemo(
    () => state.data?.views.find((v) => v.format === format && v.season === season && v.phase === phase),
    [state.data, format, season, phase],
  );
  // the ONE ranking used by both the shirt rail and the table
  // all-rounder ratings exist for the All scope only: never show them under an IPL / T20I / season / phase filter
  const arScoped = isAr && !(format === "All" && season === "All" && phase === "All");
  const rows: LeaderboardRow[] = useMemo(
    () => (isAr ? (ev && !arScoped ? allrounderRows(ev) : []) : (view?.rows ?? []).slice(0, 10)), // files hold up to 40; the table shows 10
    [isAr, ev, arScoped, view],
  );

  // One y-scale for every "Last 12" sparkline in the view, so rows compare fairly.
  const sparkDomain = useMemo<[number, number]>(() => {
    const vals = rows.flatMap((r) => [...r.spark, ...(r.sparkNormal != null ? [r.sparkNormal] : [])]);
    if (!vals.length) return [0, 100];
    const lo = Math.max(0, Math.floor((Math.min(...vals) - 4) / 10) * 10);
    const hi = Math.min(100, Math.ceil((Math.max(...vals) + 4) / 10) * 10);
    return hi - lo < 20 ? [Math.max(0, lo - 10), Math.min(100, hi + 10)] : [lo, hi];
  }, [rows]);

  const change = (t: BoardKind) => {
    setTab(t);
    setHot(null);
    router.replace(`/leaderboards/?tab=${t}`, { scroll: false });
  };
  const onHover = useCallback((id: string | null) => setHot(id), []);

  // scroll a ?highlight= row into view once the rows are there
  useEffect(() => {
    if (!highlight || !rows.length) return;
    const el = document.getElementById(`row-${highlight}`) ?? document.getElementById(`crow-${highlight}`);
    if (el && el.offsetParent !== null) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlight, rows]);

  const allFilters = format === "All" && season === "All" && phase === "All";
  const hiPlayer = highlight ? players.data?.find((p) => p.id === highlight) : undefined;
  const hiMissing = highlight && rows.length > 0 && !rows.some((r) => r.playerId === highlight);
  const what = tab === "batters" ? "batters" : tab === "bowlers" ? "bowlers" : "all-rounders";
  const PHASE_TXT: Record<string, string> = { All: "all overs", Powerplay: "powerplay", Middle: "middle overs", Death: "death overs" };
  const scope = [format === "All" ? "IPL + T20I" : format, season === "All" ? "2022–2026" : season, PHASE_TXT[phase] ?? phase].join(" · ");
  const isActive = (id: string) => id === hot || id === highlight;

  return (
    <div>
      <SectionHeader
        eyebrow="Leaderboards"
        title={`Top 10 ${what} under pressure`}
        description="Pressure Rating 0–100 after shrinkage. The band shows the bootstrap 90% interval: a narrow band means a rating we trust."
      />

      {/* hero: the shirt rail, fed the exact rows of the table below */}
      <LeaderboardRail
        rows={rows}
        kind={tab}
        onKind={change}
        scopeKey={`${format}-${season}-${phase}`}
        emptyNote={arScoped ? "All-rounder ratings combine every format, season and phase. Set the filters above to All to see them." : undefined}
        onHover={onHover}
      />

      <Card index={1} className="mt-5 p-3 md:p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 pb-3 pt-1">
          <span className="text-[12.5px] text-text-400">
            Showing <span className="font-semibold text-text-100">{scope}</span>
          </span>
          <span className="inline-flex items-center gap-1.5 text-[12px] text-text-400">
            <Info size={13} />
            ▲ = better under pressure than in normal situations
            {tab === "bowlers" ? " (economy falls)" : " (strike rate rises)"}
          </span>
        </div>
        {hiMissing && (
          <div className="mx-3 mb-3 rounded-xl bg-pink-500/[0.06] px-3 py-2 text-[12.5px] text-text-100 ring-1 ring-pink-500/20">
            {hiPlayer && hiPlayer.rank && allFilters && !isAr
              ? `${hiPlayer.name} is ranked #${hiPlayer.rank} (rating ${hiPlayer.rating?.toFixed(1)}), outside the top 10 shown here.`
              : `${hiPlayer?.name ?? "This player"} is not in the top 10 for this view.`}
          </div>
        )}
        <DataGate
          state={(isAr ? { data: ev ?? undefined, error: undefined, loading: !ev } : state) as DataState<unknown>}
          skeleton={
            <div className="space-y-2 p-2">
              {Array.from({ length: 10 }).map((_, i) => (
                <Skeleton key={i} className="h-[62px]" />
              ))}
            </div>
          }
        >
          {() =>
            rows.length === 0 ? (
              <EmptyState
                icon={<SearchX size={22} />}
                title={arScoped ? "All-rounder ratings are for all formats, seasons and phases" : "No players meet the minimum sample"}
                detail={
                  arScoped
                    ? "The all-rounder rating combines batting and bowling over the whole 2022–2026 window. Set the filters above to All."
                    : "Try widening the season or phase filter. Players need enough pressure balls in this scope before they are ranked."
                }
              />
            ) : (
              <>
                <div className="space-y-2 md:hidden">
                  {rows.map((r, i) => (
                    <RankRowCompact key={r.playerId} row={r} index={i} highlighted={isActive(r.playerId)} />
                  ))}
                </div>
                <div className="hidden overflow-x-auto overflow-y-hidden md:block">
                  <div role="table" aria-label={`${what} leaderboard`} className="min-w-[960px]">
                    <RankHeader keyStat={tab === "bowlers" ? "Economy" : "Strike rate"} />
                    <div className="space-y-1" role="rowgroup" key={`${tab}-${format}-${season}-${phase}`}>
                      {rows.map((r, i) => (
                        <RankRow
                          key={r.playerId}
                          row={r}
                          index={i}
                          lowerIsBetter={tab === "bowlers"}
                          sparkDomain={sparkDomain}
                          highlighted={isActive(r.playerId)}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )
          }
        </DataGate>
        {rows.length > 0 && (
          <div className="flex flex-wrap gap-x-6 gap-y-1 border-t border-ink/[0.06] px-3 pt-3 text-[12px] text-text-400">
            <span>
              Sample shown: <span className="tnum font-semibold text-text-100">{fmtInt(rows.reduce((s, r) => s + r.pressureBalls, 0))}</span> pressure balls
              across the top 10
            </span>
            {!isAr && (
              <span>
                Last 12: pressure score per match (percentile of all player-matches), one shared scale {sparkDomain[0]}–{sparkDomain[1]}; dashed line =
                the player&apos;s normal level
              </span>
            )}
            {isAr && <span>All-rounders combine batting and bowling pressure WPA; no per-match sparkline.</span>}
            <span>Click a row or a shirt to open the player profile</span>
          </div>
        )}
      </Card>
    </div>
  );
}

export default function LeaderboardsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-[600px]" />}>
      <LeaderboardsInner />
    </Suspense>
  );
}
