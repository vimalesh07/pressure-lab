"use client";

import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BarChart3, Lock, ListOrdered, ShieldCheck, Swords, Target, TimerReset } from "lucide-react";
import { useData } from "@/lib/data";
import type { MatchupStats, MatchupsFile } from "@/lib/types";
import { cx } from "@/lib/format";
import { Card, CardHeader } from "@/components/ui/Card";
import { LegendItem, Segmented, Select } from "@/components/ui/Controls";
import { TeamChip } from "@/components/ui/TeamChip";
import { DeltaPill } from "@/components/ui/DeltaPill";
import { DataGate, PageSkeleton } from "@/components/ui/Skeleton";
import { RankBadge } from "@/components/ui/RankRow";
import { TooltipBox, TooltipRow } from "@/components/charts/ChartTooltip";
import { useReducedMotion } from "@/components/charts/useReducedMotion";

const SERIES = [
  { key: "bowler", color: "#B23A62" },
  { key: "league", color: "#A39580" },
  { key: "elite", color: "#4A73A8" },
] as const;

export default function MatchupsPage() {
  const state = useData("matchups.json");
  return <DataGate state={state} skeleton={<PageSkeleton />}>{(d) => <Arena d={d} />}</DataGate>;
}

function StatCard({
  icon,
  label,
  value,
  unit,
  league,
  elite,
  lowerIsBetter,
  index,
  digits = 1,
  note,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  unit?: string;
  league?: number;
  elite?: number;
  lowerIsBetter?: boolean;
  index: number;
  digits?: number;
  note?: string;
}) {
  const vsLeague = league ? ((value - league) / league) * 100 : null;
  return (
    <Card index={index} className="p-5">
      <div className="flex items-center justify-between">
        <span className="text-[11.5px] font-semibold uppercase tracking-[0.12em] text-text-400">{label}</span>
        <span className="text-pink-300">{icon}</span>
      </div>
      <div className="mt-3 flex items-baseline gap-1.5">
        <span className="tnum font-display text-[38px] font-semibold leading-none">{value.toFixed(digits)}</span>
        {unit && <span className="text-[14px] text-text-400">{unit}</span>}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px] text-text-400">
        {vsLeague !== null && (
          <>
            <DeltaPill value={vsLeague} good={lowerIsBetter ? vsLeague <= 0 : vsLeague >= 0} size="sm" />
            <span>vs league avg</span>
          </>
        )}
        {note && <span>{note}</span>}
      </div>
      {league !== undefined && elite !== undefined && (
        <div className="tnum mt-3 grid grid-cols-2 gap-2 border-t border-ink/[0.06] pt-3 text-[12px]">
          <span className="text-text-400">League <span className="font-semibold text-text-100">{league.toFixed(digits)}</span></span>
          <span className="text-text-400">Elite <span className="font-semibold text-text-100">{elite.toFixed(digits)}</span></span>
        </div>
      )}
    </Card>
  );
}

function Arena({ d }: { d: MatchupsFile }) {
  const reduce = useReducedMotion();
  const [bowlerId, setBowlerId] = useState(d.bowlers[0]?.id);
  const [tierId, setTierId] = useState(d.tiers[0]?.id);
  const bowler = d.bowlers.find((b) => b.id === bowlerId) ?? d.bowlers[0];
  const tier = d.tiers.find((t) => t.id === tierId) ?? d.tiers[0];
  const s = bowler.byTier[tier.id];
  const lg = d.leagueAverage[tier.id];
  const el = d.eliteBenchmark[tier.id];

  const chart = useMemo(() => {
    const rows: { metric: string; k: keyof MatchupStats }[] = [
      { metric: "Death clamp %", k: "deathClampRate" },
      { metric: "Dot-ball %", k: "dotPct" },
      { metric: "Boundary % conceded", k: "boundaryPct" },
    ];
    return rows.map((r) => ({ metric: r.metric, bowler: s[r.k], league: lg[r.k], elite: el[r.k] }));
  }, [s, lg, el]);

  const shortlist = useMemo(
    () => [...d.bowlers].sort((a, b) => b.byTier[tier.id].deathClampRate - a.byTier[tier.id].deathClampRate).slice(0, 6),
    [d.bowlers, tier.id],
  );

  return (
    <div className="space-y-6">
      {/* Banner */}
      <Card glow="pink" className="overflow-hidden p-6">
        <div className="pointer-events-none absolute inset-y-0 right-0 w-2/3 bg-[radial-gradient(ellipse_at_right,rgba(178,58,98,0.10),transparent_65%)]" />
        <div className="pointer-events-none absolute -bottom-6 right-10 select-none font-display text-[150px] font-bold leading-none text-ink/[0.05]">19</div>
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div>
            <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-pink-300">
              <Swords size={14} /> Matchup arena
            </div>
            <h1 className="font-display text-[36px] font-bold leading-none tracking-tight md:text-[42px]">
              <span className="text-gradient">Who bowls the 19th over?</span>
            </h1>
            <p className="mt-2 max-w-xl text-[14px] text-text-400">
              Pick a bowler and an elite batter tier. See how often they hold the over to nine runs or fewer when it matters.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Select
              label="Bowler"
              value={bowler.id}
              onChange={setBowlerId}
              icon={<Target size={14} />}
              options={d.bowlers.map((b) => ({ value: b.id, label: `${b.name} · ${b.style}` }))}
            />
            <Segmented label="Batter tier" value={tier.id} onChange={setTierId} options={d.tiers.map((t) => ({ value: t.id, label: t.label }))} />
          </div>
        </div>
      </Card>

      <div className="rise flex flex-wrap items-center gap-3 text-[13px]" style={{ ["--i" as string]: 1 }}>
        <span className="font-display text-[18px] font-semibold">{bowler.name}</span>
        <TeamChip code={bowler.team} />
        <span className="text-text-400">{bowler.style}</span>
        <span className="text-text-400">·</span>
        <span className="text-text-400">
          vs <span className="font-semibold text-text-100">{tier.label}</span>: {tier.description}
        </span>
        <span className="tnum ml-auto text-text-400">{s.overs} overs in sample</span>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard index={2} icon={<Lock size={18} />} label="Death clamp rate" value={s.deathClampRate} unit="%" league={lg.deathClampRate} elite={el.deathClampRate} note="of overs ≤ 9 runs" />
        <StatCard index={3} icon={<ShieldCheck size={18} />} label="Threat-adjusted economy" value={s.threatAdjEcon} digits={2} unit="rpo" league={lg.threatAdjEcon} elite={el.threatAdjEcon} lowerIsBetter />
        <StatCard index={4} icon={<TimerReset size={18} />} label="Wickets of set batters" value={s.setBatterWickets} digits={0} note="Batters on 20+ balls faced" />
      </div>

      <div className="grid grid-cols-12 gap-6">
        <Card index={5} className="col-span-12 p-5 lg:col-span-8">
          <CardHeader
            icon={<BarChart3 size={16} />}
            title={`${bowler.name} vs league average vs elite tier`}
            subtitle={`Against ${tier.label.toLowerCase()} in pressure overs. Higher is better, except boundary %.`}
            right={
              <div className="flex flex-col items-end gap-1">
                <LegendItem color={SERIES[0].color} label={bowler.name} />
                <LegendItem color={SERIES[1].color} label="League average" />
                <LegendItem color={SERIES[2].color} label="Elite benchmark" />
              </div>
            }
          />
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart} margin={{ top: 20, right: 8, left: 0, bottom: 0 }} barGap={2} barCategoryGap="22%">
                <CartesianGrid vertical={false} />
                <XAxis dataKey="metric" tickLine={false} axisLine={false} tick={{ fill: "#2B2118", fontSize: 12 }} />
                <YAxis domain={[0, (max: number) => Math.ceil(max / 10) * 10]} tickCount={6} allowDecimals={false} tickLine={false} axisLine={false} width={40} tickFormatter={(v) => `${v}%`} />
                <Tooltip
                  cursor={{ fill: "rgba(60,40,20,0.03)" }}
                  content={({ active, payload, label }) =>
                    active && payload?.length ? (
                      <TooltipBox title={label}>
                        <TooltipRow label={bowler.name} value={`${Number(payload[0].value).toFixed(1)}%`} color={SERIES[0].color} />
                        <TooltipRow label="League avg" value={`${Number(payload[1].value).toFixed(1)}%`} color={SERIES[1].color} />
                        <TooltipRow label="Elite" value={`${Number(payload[2].value).toFixed(1)}%`} color={SERIES[2].color} />
                      </TooltipBox>
                    ) : null
                  }
                />
                {SERIES.map((sr) => (
                  <Bar key={sr.key} dataKey={sr.key} fill={sr.color} radius={[4, 4, 0, 0]} maxBarSize={44} isAnimationActive={!reduce}>
                    {sr.key === "bowler" && (
                      <LabelList dataKey="bowler" position="top" formatter={(v: number) => `${v.toFixed(1)}%`} style={{ fill: "#2B2118", fontSize: 11, fontWeight: 600 }} />
                    )}
                  </Bar>
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card index={6} className="col-span-12 p-5 lg:col-span-4">
          <CardHeader icon={<ListOrdered size={16} />} title="19th-over shortlist" subtitle={`Highest death clamp rate vs ${tier.label.toLowerCase()}`} />
          <div className="space-y-1.5">
            {shortlist.map((b, i) => {
              const v = b.byTier[tier.id].deathClampRate;
              const active = b.id === bowler.id;
              return (
                <button
                  key={b.id}
                  onClick={() => setBowlerId(b.id)}
                  className={cx(
                    "rise grid w-full grid-cols-[28px_1fr_auto] items-center gap-3 rounded-xl px-2.5 py-2 text-left transition",
                    active ? "bg-pink-500/15 ring-1 ring-pink-500/40" : "hover:bg-ink/[0.04]",
                  )}
                  style={{ ["--i" as string]: i + 6 }}
                  aria-pressed={active}
                >
                  <RankBadge rank={i + 1} size="sm" />
                  <span className="min-w-0">
                    <span className="block truncate text-[13.5px] font-semibold">{b.name}</span>
                    <span className="mt-1 block h-1.5 rounded-full bg-ink/[0.06]">
                      <span className="grow-x block h-1.5 rounded-full bar-pressure" style={{ width: `${Math.min(100, v * 1.4)}%` }} />
                    </span>
                  </span>
                  <span className="tnum text-[14px] font-semibold">{v.toFixed(1)}%</span>
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-[11.5px] text-text-400">League average: <span className="tnum font-semibold text-text-100">{lg.deathClampRate.toFixed(1)}%</span> · click a bowler to load them.</p>
        </Card>
      </div>
    </div>
  );
}
