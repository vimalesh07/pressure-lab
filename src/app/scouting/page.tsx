"use client";

import { useState } from "react";
import { Binoculars, CircleAlert, Crosshair, Lightbulb, MoveHorizontal, Clock3, Wrench, Swords, TrendingDown, UserRound } from "lucide-react";
import Link from "next/link";
import { useData } from "@/lib/data";
import type { ScoutCard, ScoutingFile } from "@/lib/types";
import { cx, fmtInt } from "@/lib/format";
import { Card, CardHeader } from "@/components/ui/Card";
import { Tabs } from "@/components/ui/Controls";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { TeamChip } from "@/components/ui/TeamChip";
import { DeltaPill } from "@/components/ui/DeltaPill";
import { DataGate, EmptyState, PageSkeleton } from "@/components/ui/Skeleton";
import { Donut } from "@/components/charts/Donut";

type Tab = "fix" | "attack";

export default function ScoutingPage() {
  const state = useData("scouting.json");
  return <DataGate state={state} skeleton={<PageSkeleton />}>{(d) => <Room d={d} />}</DataGate>;
}

function IndexBars({ c }: { c: ScoutCard }) {
  const max = 140;
  return (
    <div className="space-y-1.5" aria-label={`Normal index ${c.normalIndex}, pressure index ${c.pressureIndex}`}>
      {[
        { k: "Normal", v: c.normalIndex, cls: "bg-blue-300/80" },
        { k: "Pressure", v: c.pressureIndex, cls: "bg-pink-500" },
      ].map((x) => (
        <div key={x.k} className="grid grid-cols-[58px_1fr_32px] items-center gap-2 text-[11px]">
          <span className="text-text-400">{x.k}</span>
          <span className="relative h-1.5 rounded-full bg-ink/[0.06]">
            <span className="absolute inset-y-[-3px] w-px bg-ink/30" style={{ left: `${(100 / max) * 100}%` }} aria-hidden />
            <span className={cx("grow-x block h-1.5 rounded-full", x.cls)} style={{ width: `${(x.v / max) * 100}%` }} />
          </span>
          <span className="tnum text-right font-semibold text-text-100">{x.v}</span>
        </div>
      ))}
    </div>
  );
}

function WeaknessCard({ c, tab, index }: { c: ScoutCard; tab: Tab; index: number }) {
  const isBat = c.discipline === "batting";
  const struggles = [
    { icon: <UserRound size={14} />, k: isBat ? "Bowler type" : "Batter type", v: c.struggles.versus },
    { icon: <Crosshair size={14} />, k: "Delivery", v: c.struggles.delivery },
    { icon: <MoveHorizontal size={14} />, k: "Line", v: c.struggles.line },
    { icon: <Clock3 size={14} />, k: "Phase", v: c.struggles.phase },
  ];
  return (
    <Card index={index} glow={tab === "attack" ? "pink" : "blue"} className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Link href={`/player/?id=${c.playerId}`} className="font-display text-[24px] font-bold tracking-tight hover:text-pink-300">
              {c.name}
            </Link>
            <TeamChip code={c.team} />
          </div>
          <div className="mt-1 text-[13px] text-text-400">
            {c.role} · {fmtInt(c.sampleBalls)} pressure balls in sample
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-text-400">Drop under pressure</div>
          <div className="tnum mt-1 font-display text-[32px] font-semibold leading-none text-danger">▼ {Math.abs(c.dropPct).toFixed(1)}%</div>
        </div>
      </div>

      <div className="mt-5 grid gap-5 md:grid-cols-[1.15fr_1fr]">
        <div>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-text-400">Struggles vs</div>
          <dl className="grid grid-cols-2 gap-2">
            {struggles.map((s) => (
              <div key={s.k} className="glass-raised p-3">
                <dt className="flex items-center gap-1.5 text-[11px] text-text-400">
                  <span className="text-pink-300">{s.icon}</span>
                  {s.k}
                </dt>
                <dd className="mt-1 text-[13px] font-semibold leading-snug text-text-100">{s.v}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-4">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-text-400">Performance index (100 = expected)</div>
            <IndexBars c={c} />
          </div>
        </div>
        <div>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-text-400">
            {isBat ? "How they get out under pressure" : "How runs leak under pressure"}
          </div>
          <Donut slices={c.dismissals} size={128} centerLabel={isBat ? "dismissals" : "events"} />
        </div>
      </div>

      <div
        className={cx(
          "mt-5 flex gap-3 rounded-2xl p-4 ring-1",
          tab === "attack" ? "bg-pink-500/10 ring-pink-500/30" : "bg-blue-500/15 ring-blue-300/30",
        )}
      >
        <Lightbulb size={18} className={cx("mt-0.5 shrink-0", tab === "attack" ? "text-pink-300" : "text-blue-300")} />
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-400">{tab === "attack" ? "Attack plan" : "Fix plan"}</div>
          <p className="mt-0.5 text-[14px] leading-snug text-text-100">{c.recommendation}</p>
        </div>
      </div>
    </Card>
  );
}

function Room({ d }: { d: ScoutingFile }) {
  const [tab, setTab] = useState<Tab>("fix");
  const list = tab === "fix" ? d.fix : d.attack;
  const [selected, setSelected] = useState<Record<Tab, string | undefined>>({ fix: d.fix[0]?.playerId, attack: d.attack[0]?.playerId });
  const current = list.find((c) => c.playerId === selected[tab]) ?? list[0];

  return (
    <div>
      <SectionHeader
        eyebrow="Scouting room"
        title={tab === "fix" ? `Fix plans for ${d.squadName}` : "Attack plans for opponents"}
        description={
          tab === "fix"
            ? "Our players who drop the most under pressure, and what to change."
            : "Opposition players who wobble when the match tightens, and how to exploit it."
        }
      />
      <Tabs
        label="Scouting mode"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "fix", label: "Fix plans", icon: <Wrench size={15} />, count: d.fix.length },
          { value: "attack", label: "Attack plans", icon: <Swords size={15} />, count: d.attack.length },
        ]}
      />
      {list.length === 0 ? (
        <div className="mt-6">
          <EmptyState icon={<Binoculars size={22} />} title="No pressure-fragile players flagged" detail="Nobody in this group drops more than the flag threshold under pressure." />
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-12 gap-6">
          <Card index={1} className="col-span-12 p-5 lg:col-span-4">
            <CardHeader icon={<TrendingDown size={16} />} title="Pressure-fragile list" subtitle="Biggest drop from normal to pressure" />
            <div className="space-y-1.5" role="listbox" aria-label="Pressure-fragile players">
              {list.map((c, i) => {
                const active = c.playerId === current.playerId;
                return (
                  <button
                    key={c.playerId}
                    role="option"
                    aria-selected={active}
                    onClick={() => setSelected((s) => ({ ...s, [tab]: c.playerId }))}
                    className={cx(
                      "rise w-full rounded-2xl border p-3 text-left transition",
                      active ? "border-pink-500/40 bg-pink-500/10" : "border-ink/[0.06] bg-ink/[0.02] hover:border-ink/15 hover:bg-bg-700/60",
                    )}
                    style={{ ["--i" as string]: i + 1 }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate font-display text-[14.5px] font-semibold">{c.name}</span>
                        <TeamChip code={c.team} />
                      </span>
                      <DeltaPill value={c.dropPct} size="sm" />
                    </div>
                    <div className="mt-2.5">
                      <IndexBars c={c} />
                    </div>
                  </button>
                );
              })}
            </div>
            <p className="mt-3 flex items-start gap-1.5 text-[11.5px] text-text-400">
              <CircleAlert size={13} className="mt-0.5 shrink-0" />
              Index 100 = expected for the situation. The white tick marks 100.
            </p>
          </Card>
          <div className="col-span-12 space-y-6 lg:col-span-8">
            <WeaknessCard key={`${tab}-${current.playerId}`} c={current} tab={tab} index={2} />
            <Card index={3} className="p-5">
              <CardHeader
                icon={<Lightbulb size={16} />}
                title={tab === "fix" ? "Other fix plans" : "Other attack plans"}
                subtitle="One-line plan for each remaining flagged player"
              />
              <div className="grid gap-2 md:grid-cols-2">
                {list
                  .filter((c) => c.playerId !== current.playerId)
                  .map((c, i) => (
                    <button
                      key={c.playerId}
                      onClick={() => setSelected((s) => ({ ...s, [tab]: c.playerId }))}
                      className="rise rounded-xl border border-ink/[0.06] bg-ink/[0.02] p-3 text-left transition hover:border-ink/15 hover:bg-bg-700/60"
                      style={{ ["--i" as string]: i + 3 }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-2">
                          <span className="font-display text-[13.5px] font-semibold">{c.name}</span>
                          <span className="text-[11.5px] text-text-400">{c.struggles.phase}</span>
                        </span>
                        <DeltaPill value={c.dropPct} size="sm" />
                      </div>
                      <p className="mt-1.5 line-clamp-2 text-[12.5px] leading-snug text-text-400">{c.recommendation}</p>
                    </button>
                  ))}
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
