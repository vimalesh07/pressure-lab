"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Info, SearchX, Swords, Target } from "lucide-react";
import { useData } from "@/lib/data";
import { fmtInt } from "@/lib/format";
import { Card } from "@/components/ui/Card";
import { Tabs } from "@/components/ui/Controls";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { RankHeader, RankRow, RankRowCompact } from "@/components/ui/RankRow";
import { DataGate, EmptyState, Skeleton } from "@/components/ui/Skeleton";
import { useFilters } from "@/components/layout/Filters";

type Tab = "batters" | "bowlers";

function LeaderboardsInner() {
  const params = useSearchParams();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>((params.get("tab") as Tab) === "bowlers" ? "bowlers" : "batters");
  useEffect(() => {
    const t = params.get("tab");
    if (t === "batters" || t === "bowlers") setTab(t);
  }, [params]);

  const bat = useData("leaderboard_batters.json");
  const bowl = useData("leaderboard_bowlers.json");
  const state = tab === "batters" ? bat : bowl;
  const { format, season, phase } = useFilters();

  const view = useMemo(
    () => state.data?.views.find((v) => v.format === format && v.season === season && v.phase === phase),
    [state.data, format, season, phase],
  );

  const change = (t: Tab) => {
    setTab(t);
    router.replace(`/leaderboards/?tab=${t}`, { scroll: false });
  };

  const scope = [format === "All" ? "IPL + T20I" : format, season === "All" ? "2022–2026" : season, phase === "All" ? "all phases" : phase].join(" · ");

  return (
    <div>
      <SectionHeader
        eyebrow="Leaderboards"
        title={tab === "batters" ? "Top 10 batters under pressure" : "Top 10 bowlers under pressure"}
        description="Pressure Rating 0–100 after shrinkage. The band shows the bootstrap 90% interval: a narrow band means a rating we trust."
      />
      <Tabs
        label="Leaderboard type"
        value={tab}
        onChange={change}
        tabs={[
          { value: "batters", label: "Top 10 Batters", icon: <Swords size={15} /> },
          { value: "bowlers", label: "Top 10 Bowlers", icon: <Target size={15} /> },
        ]}
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
        <DataGate
          state={state}
          skeleton={
            <div className="space-y-2 p-2">
              {Array.from({ length: 10 }).map((_, i) => (
                <Skeleton key={i} className="h-[62px]" />
              ))}
            </div>
          }
        >
          {(lb) =>
            !view || view.rows.length === 0 ? (
              <EmptyState
                icon={<SearchX size={22} />}
                title="No players meet the minimum sample"
                detail="Try widening the season or phase filter. Players need enough pressure balls before they are ranked."
              />
            ) : (
              <>
              <div className="space-y-2 md:hidden">
                {view.rows.map((r, i) => (
                  <RankRowCompact key={r.playerId} row={r} index={i} />
                ))}
              </div>
              <div className="hidden overflow-x-auto overflow-y-hidden md:block">
                <div role="table" aria-label={`${tab} leaderboard`} className="min-w-[960px]">
                  <RankHeader keyStat={lb.keyStat} />
                  <div className="space-y-1" role="rowgroup" key={`${tab}-${format}-${season}-${phase}`}>
                    {view.rows.map((r, i) => (
                      <RankRow key={r.playerId} row={r} index={i} lowerIsBetter={tab === "bowlers"} />
                    ))}
                  </div>
                </div>
              </div>
              </>
            )
          }
        </DataGate>
        {view && (
          <div className="flex flex-wrap gap-x-6 gap-y-1 border-t border-ink/[0.06] px-3 pt-3 text-[12px] text-text-400">
            <span>
              Sample shown: <span className="tnum font-semibold text-text-100">{fmtInt(view.rows.reduce((s, r) => s + r.pressureBalls, 0))}</span> pressure balls across the top 10
            </span>
            <span>Click a row to open the player profile</span>
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
