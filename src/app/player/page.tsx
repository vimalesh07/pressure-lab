"use client";

import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeftRight, ArrowRight, Crown, Download, Shield, Sparkles, Trophy, UserRound, Zap } from "lucide-react";
import Link from "next/link";
import { ExportDialog } from "@/components/ExportDialog";
import { useData } from "@/lib/data";
import type { ComparisonMetric, MatchupTier, PlayerProfile } from "@/lib/types";
import { cx, fmtDate, fmtInt, signed } from "@/lib/format";
import { Card, CardHeader } from "@/components/ui/Card";
import { Select } from "@/components/ui/Controls";
import { TeamChip } from "@/components/ui/TeamChip";
import { DeltaPill } from "@/components/ui/DeltaPill";
import { ConfidenceBand } from "@/components/ui/ConfidenceBand";
import { PressureGauge } from "@/components/ui/PressureGauge";
import { DataGate, EmptyState, PageSkeleton } from "@/components/ui/Skeleton";
import { RadarCard } from "@/components/charts/RadarCard";
import { HeatmapCard } from "@/components/charts/HeatmapCard";
import { MatchLog } from "@/components/MatchLog";
import { PlayerPhoto } from "@/components/ui/PlayerPhoto";

function fmtMetric(m: ComparisonMetric, v: number | null) {
  if (v === null) return "–";
  if (m.unit === "%") return `${v.toFixed(1)}%`;
  if (m.unit === "rpo") return v.toFixed(2);
  if (m.unit === "wpa") return `${signed(v)} pts`;
  return v.toFixed(1);
}

function Initials({ name }: { name: string }) {
  const code = name.split(" ").map((w) => w[0]).join("");
  return (
    <div className="relative grid h-[84px] w-[84px] shrink-0 place-items-center">
      <svg viewBox="0 0 84 84" className="absolute inset-0" aria-hidden>
        <defs>
          <linearGradient id="avg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#4A73A8" />
            <stop offset="1" stopColor="#B23A62" />
          </linearGradient>
        </defs>
        <path d="M42 3 L76 22 L76 62 L42 81 L8 62 L8 22 Z" fill="#EFE6D6" stroke="url(#avg)" strokeWidth="2" />
      </svg>
      <span className="relative font-display text-[24px] font-bold tracking-tight">{code}</span>
    </div>
  );
}

function ProfileHeader({ p }: { p: PlayerProfile }) {
  const photos = useData("player_photos.json").data;
  return (
    <Card glow="pink" className="overflow-hidden p-6">
      <div className="pointer-events-none absolute -right-20 -top-28 h-72 w-72 rounded-full bg-pink-500/10 blur-[90px]" />
      <div className="relative grid items-center gap-6 md:grid-cols-[minmax(0,1fr)_auto] 2xl:grid-cols-[minmax(0,1fr)_auto_auto]">
        <div className="flex items-center gap-5">
          {p.id in (photos ?? {}) ? (
            <PlayerPhoto id={p.id} name={p.name} team={p.teams[0]} rounded="rounded-2xl" className="h-[84px] w-[84px] shrink-0 ring-2 ring-pink-500/20" />
          ) : (
            <Initials name={p.name} />
          )}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-[28px] font-bold leading-none tracking-tight md:text-[32px]">{p.name}</h1>
              {p.rank <= 3 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-gold-400/15 px-2 py-0.5 text-[11.5px] font-semibold text-gold-400 ring-1 ring-gold-400/40">
                  <Crown size={12} /> Podium
                </span>
              )}
              {p.rank <= 10 && (
                <a
                  href={`/evidence/?player=${p.id}`}
                  className="inline-flex items-center gap-1 rounded-full bg-pink-500/[0.08] px-2 py-0.5 text-[11.5px] font-semibold text-pink-500 ring-1 ring-pink-500/20 hover:bg-pink-500/[0.14]"
                >
                  See the pressure proof →
                </a>
              )}
            </div>
            <div className="mt-2 text-[14px] text-text-400">
              {p.role} · {p.style}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {p.teams.map((t) => (
                <TeamChip key={t} code={t} />
              ))}
              <span className="mx-1 h-4 w-px bg-ink/10" />
              {p.formats.map((f) => (
                <span key={f} className="rounded-md bg-blue-500/20 px-1.5 py-0.5 text-[11px] font-semibold text-blue-300 ring-1 ring-blue-300/30">
                  {f}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 md:order-3 md:col-span-2 2xl:order-none 2xl:col-span-1 2xl:w-[420px]">
          {[
            { k: "Rank", v: `#${p.rank}`, s: `of ${p.rankOf} ${p.discipline === "batting" ? "batters" : "bowlers"}` },
            { k: "Pressure balls", v: fmtInt(p.pressureBalls), s: "faced / bowled" },
            { k: "Matches", v: fmtInt(p.matches), s: "with pressure balls" },
          ].map((x) => (
            <div key={x.k} className="glass-raised p-3">
              <div className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-text-400">{x.k}</div>
              <div className={cx("tnum mt-1 font-display text-[24px] font-semibold leading-none", x.k === "Rank" && p.rank <= 3 && "text-gold-400")}>{x.v}</div>
              <div className="mt-1 text-[11px] text-text-400">{x.s}</div>
            </div>
          ))}
          <div className="col-span-3 glass-raised flex items-center justify-between gap-3 p-3">
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-400">90% interval</span>
            <div className="min-w-0 max-w-[260px] flex-1 px-1"><ConfidenceBand low={p.ciLow} high={p.ciHigh} value={p.rating} width="100%" /></div>
            <span className="tnum text-[12.5px] font-semibold">
              {p.ciLow.toFixed(0)}–{p.ciHigh.toFixed(0)}
            </span>
          </div>
        </div>

        <div className="flex justify-center">
          <PressureGauge value={p.rating} size={200} />
        </div>
      </div>
    </Card>
  );
}

function Comparison({ metrics, index }: { metrics: ComparisonMetric[]; index: number }) {
  return (
    <Card index={index} className="p-5">
      <CardHeader icon={<ArrowLeftRight size={16} />} title="Normal vs pressure" subtitle="Same player, two situations" />
      <div className="grid grid-cols-[1fr_74px_74px_84px] gap-x-3 pb-2 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-text-400">
        <span>Metric</span>
        <span className="flex items-center justify-end gap-1.5"><span className="h-2 w-2 shrink-0 rounded-full bg-blue-300" />Normal</span>
        <span className="flex items-center justify-end gap-1.5"><span className="h-2 w-2 shrink-0 rounded-full bg-pink-500" />Pressure</span>
        <span className="text-right">Change</span>
      </div>
      <div className="divide-y divide-ink/[0.06]">
        {metrics.map((m, i) => {
          const isWpa = m.unit === "wpa";
          const nv = m.normal ?? 0;
          const pv = m.pressure ?? 0;
          const has = m.normal !== null && m.pressure !== null && (isWpa || m.normal !== 0);
          const delta = !has ? 0 : isWpa ? pv - nv : ((pv - nv) / Math.abs(nv)) * 100;
          const good = m.better === "higher" ? delta >= 0 : delta <= 0;
          const max = Math.max(Math.abs(nv), Math.abs(pv)) || 1;
          return (
            <div key={m.key} className="rise py-3" style={{ ["--i" as string]: i }}>
              <div className="grid grid-cols-[1fr_74px_74px_84px] items-center gap-x-3">
                <span className="text-[13px] text-text-100">{m.label}</span>
                <span className="tnum text-right text-[14px] font-semibold text-blue-300">{fmtMetric(m, m.normal)}</span>
                <span className="tnum text-right text-[14px] font-semibold text-pink-300">{fmtMetric(m, m.pressure)}</span>
                <span className="text-right">
                  {has ? (
                    <DeltaPill value={delta} suffix={isWpa ? " pts" : "%"} good={good} size="sm" />
                  ) : (
                    <span className="text-[11px] text-text-400" title="Not defined: no dismissals / wickets in one of the two situations">n/a</span>
                  )}
                </span>
              </div>
              <div className="mt-2 space-y-1" aria-hidden>
                <div className="h-1 rounded-full bg-ink/[0.05]">
                  <div className="grow-x h-1 rounded-full bg-blue-300/80" style={{ width: `${(Math.abs(nv) / max) * 100}%` }} />
                </div>
                <div className="h-1 rounded-full bg-ink/[0.05]">
                  <div className="grow-x h-1 rounded-full bg-pink-500" style={{ width: `${(Math.abs(pv) / max) * 100}%` }} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function Matchups({ tiers, discipline, index }: { tiers: MatchupTier[]; discipline: string; index: number }) {
  const icon = { Elite: <Crown size={14} />, Strong: <Shield size={14} />, Normal: <UserRound size={14} /> };
  return (
    <Card index={index} className="p-5">
      <CardHeader
        icon={<Zap size={16} />}
        title="Matchup panel"
        subtitle={`Pressure balls vs ${discipline === "batting" ? "bowler" : "batter"} tiers`}
      />
      <div className="space-y-3">
        {tiers.map((t, i) => (
          <div key={t.tier} className="rise glass-raised p-3.5" style={{ ["--i" as string]: i }}>
            <div className="flex items-center justify-between">
              <span className={cx("inline-flex items-center gap-1.5 text-[12.5px] font-semibold", t.tier === "Elite" ? "text-pink-300" : t.tier === "Strong" ? "text-blue-300" : "text-text-400")}>
                {icon[t.tier]} vs {t.tier}
              </span>
              <DeltaPill value={t.deltaPct} size="sm" />
            </div>
            <div className="mt-2 flex items-end justify-between">
              <div>
                <span className="tnum font-display text-[26px] font-semibold leading-none">
                  {t.statLabel === "Econ" ? t.value.toFixed(2) : t.value.toFixed(1)}
                </span>
                <span className="ml-1.5 text-[12px] text-text-400">{t.statLabel}</span>
              </div>
              <div className="tnum text-right text-[11.5px] text-text-400">
                {t.balls} balls
                <br />
                {t.dismissals} {discipline === "batting" ? "dismissals" : "wickets"}
              </div>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[11.5px] text-text-400">Change is vs the player&apos;s own pressure baseline. ▲ = better.</p>
    </Card>
  );
}

function Moments({ p, index }: { p: PlayerProfile; index: number }) {
  return (
    <Card index={index} className="p-5">
      <CardHeader icon={<Sparkles size={16} />} title="Signature moments" subtitle="The three biggest pressure contributions, by win-probability swing" />
      <div className="grid gap-3 md:grid-cols-3">
        {p.signatureMoments.map((m, i) => (
          <div key={i} className="rise relative overflow-hidden rounded-2xl border border-ink/[0.07] bg-gradient-to-br from-bg-700/70 to-bg-800/40 p-4" style={{ ["--i" as string]: i }}>
            <div className="absolute right-3 top-3 font-display text-[44px] font-bold leading-none text-ink/[0.06]">0{i + 1}</div>
            <div className="flex items-center gap-2 text-[11.5px] text-text-400">
              <span className="font-semibold text-text-100">{m.match}</span>· {m.competition} · {fmtDate(m.date)}
            </div>
            <p className="mt-2 pr-8 text-[14px] leading-snug text-text-100">{m.description}</p>
            <div className="mt-3 flex items-center justify-between">
              <span className="tnum rounded-md bg-ink/[0.05] px-2 py-1 text-[12px] font-semibold ring-1 ring-ink/10">Over {m.over}</span>
              <span className="tnum font-display text-[20px] font-semibold text-success">
                ▲ {signed(m.wpSwing)}% <span className="text-[11px] font-medium text-text-400">WP</span>
              </span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

/** Where the player stands on the leaderboard (replaces the shirt rail, which now lives on /leaderboards). */
function RankLink({ p }: { p: PlayerProfile }) {
  const bat = p.discipline === "batting";
  const what = bat ? "batters" : "bowlers";
  if (p.rank > 0) {
    return (
      <Link
        href={`/leaderboards/?tab=${what}&highlight=${p.id}`}
        className="rise group flex items-center justify-between gap-3 rounded-2xl border border-ink/10 bg-bg-800 px-4 py-3 transition hover:border-pink-500/30 hover:bg-pink-500/[0.04] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
      >
        <span className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-gold-400/10 text-gold-400 ring-1 ring-gold-400/30">
            <Trophy size={16} />
          </span>
          <span className="text-[14px]">
            Ranked <span className="tnum font-display text-[17px] font-semibold">#{p.rank}</span> of{" "}
            <span className="tnum font-semibold">{p.rankOf}</span> {what} under pressure
          </span>
        </span>
        <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-pink-500">
          View leaderboard <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
        </span>
      </Link>
    );
  }
  const cls = p.classification;
  const min = cls ? 2 * (bat ? cls.batThreshold : cls.bowlThreshold) : null;
  return (
    <div className="rise flex items-center gap-3 rounded-2xl border border-ink/10 bg-bg-800 px-4 py-3 text-[14px] text-text-400">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-ink/[0.04] ring-1 ring-ink/10">
        <Trophy size={16} />
      </span>
      <span>
        Not enough pressure balls to rank{min ? ` (min ${min})` : ""}: {p.pressureBalls} so far.
      </span>
    </div>
  );
}

function PlayerInner() {
  const params = useSearchParams();
  const router = useRouter();
  const state = useData("player_profiles.json");
  const players = useData("players.json");
  const requested = params.get("id");
  const [exportOpen, setExportOpen] = useState(false);

  const options = useMemo(
    () =>
      (players.data ?? []).map((p) => ({ value: p.id, label: `${p.name} · ${p.discipline === "batting" ? "Batter" : "Bowler"}` })),
    [players.data],
  );

  return (
    <DataGate state={state} skeleton={<PageSkeleton />}>
      {(profiles) => {
        const id = requested ?? Object.keys(profiles).find((k) => profiles[k].rank === 1 && profiles[k].discipline === "batting") ?? Object.keys(profiles)[0];
        const p = profiles[id];
        return (
          <div className="space-y-6">
            <div className="rise flex flex-wrap items-center justify-between gap-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-pink-300">Player profile</div>
              <div className="flex flex-wrap items-center gap-2">
                {options.length > 0 && (
                  <Select
                    label="Player"
                    hideLabel
                    value={id}
                    options={options}
                    onChange={(v) => router.replace(`/player/?id=${v}`, { scroll: false })}
                    icon={<UserRound size={14} />}
                    className="max-w-full min-w-0 [&_select]:max-w-[calc(100vw-80px)] [&_select]:truncate"
                  />
                )}
                <button
                  onClick={() => setExportOpen(true)}
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-b from-pink-500/95 to-pink-500/80 px-3.5 py-2 text-[13px] font-semibold text-white shadow-[0_6px_20px_-8px_rgba(178,58,98,0.5)] hover:from-pink-500 hover:to-pink-500/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
                >
                  <Download size={14} /> Export
                </button>
              </div>
            </div>
            {p && <RankLink p={p} />}
            <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} profiles={profiles} currentId={p ? id : undefined} />
            {!p ? (
              <EmptyState title="Player not found" detail={`No profile with id “${id}” in player_profiles.json.`} />
            ) : (
              <div key={p.id} className="space-y-6">
                <ProfileHeader p={p} />
                <div className="grid grid-cols-12 gap-6">
                  <div className="col-span-12 lg:col-span-6">
                    <Comparison metrics={p.comparison} index={1} />
                  </div>
                  <div className="col-span-12 lg:col-span-6">
                    <RadarCard features={p.radar} name={p.name} index={2} className="h-full" />
                  </div>
                  <div className="col-span-12 md:col-span-5">
                    <Matchups tiers={p.matchups} discipline={p.discipline} index={3} />
                  </div>
                  <div className="col-span-12 md:col-span-7">
                    <HeatmapCard heatmap={p.heatmap} index={4} className="h-full" />
                  </div>
                  <div className="col-span-12">
                    <MatchLog p={p} index={6} />
                  </div>
                  <div className="col-span-12">
                    <Moments p={p} index={7} />
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      }}
    </DataGate>
  );
}

export default function PlayerPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <PlayerInner />
    </Suspense>
  );
}
