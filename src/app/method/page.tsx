"use client";

import { Fragment } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Goal, Layers, Users } from "lucide-react";
import { AlertTriangle, ArrowRight, ChevronRight, Crosshair, Flame, Gauge, Microscope, ScatterChart, ShieldAlert, Sigma, SlidersHorizontal, Workflow, BarChart3 } from "lucide-react";
import { useData } from "@/lib/data";
import type { Kpis, MethodFile } from "@/lib/types";
import { cx, fmtInt } from "@/lib/format";
import { Card, CardHeader } from "@/components/ui/Card";
import { KpiCard } from "@/components/ui/KpiCard";
import { LegendItem } from "@/components/ui/Controls";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { DataGate, PageSkeleton } from "@/components/ui/Skeleton";
import { TooltipBox, TooltipRow } from "@/components/charts/ChartTooltip";
import { useReducedMotion } from "@/components/charts/useReducedMotion";
import { MethodAlgorithm } from "@/components/MethodAlgorithm";

const ICONS = [Gauge, Flame, ShieldAlert, Crosshair, Sigma];
/** Plain-language summary of each stage (moved here from the Overview page). */
const PLAIN: Record<string, string> = {
  situation: "Runs needed, balls left, wickets in hand turn every ball into a win-probability state.",
  stakes: "Knockouts and playoff races weigh more than dead rubbers.",
  threat: "Facing an elite death bowler is harder than facing a part-timer.",
  performance: "What the player did on each pressure ball, against what was expected.",
  rank: "Small samples are pulled toward average, then ranked with intervals.",
};

const STEP_COLORS = ["#4A73A8", "#6470A8", "#7C67A6", "#9E4A7C", "#B23A62"];

function PlaceholderTag() {
  return (
    <span className="whitespace-nowrap rounded-md bg-gold-400/10 px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-gold-400 ring-1 ring-gold-400/30">
      Model output
    </span>
  );
}

export default function MethodPage() {
  const state = useData("method.json");
  const kpis = useData("kpis.json");
  return (
    <DataGate state={state} skeleton={<PageSkeleton />}>
      {(d) => <Method d={d} kpis={kpis.data} />}
    </DataGate>
  );
}

function Method({ d, kpis }: { d: MethodFile; kpis?: Kpis }) {
  const reduce = useReducedMotion();
  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Method"
        title="How a Pressure Rating is built"
        description="Five stages turn ball-by-ball data into a rating with an honest interval. The charts below are the model diagnostics."
      />

      {/* Data at a glance (moved from Overview) */}
      {kpis && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <KpiCard index={1} label="Matches analysed" value={kpis.matchesAnalysed} icon={<Goal size={18} />} hint={`${kpis.competitions.join(" + ")}, ${kpis.dataWindow}`} />
          <KpiCard index={2} label="Balls analysed" value={kpis.ballsAnalysed} icon={<Layers size={18} />} hint="Every legal delivery, both innings" accent="blue" />
          <KpiCard index={3} label="Pressure balls" value={kpis.pressureBalls} icon={<Flame size={18} />} hint={`${((kpis.pressureBalls / kpis.ballsAnalysed) * 100).toFixed(1)}% of all deliveries`} />
          <KpiCard index={4} label="Players rated" value={kpis.playersRated} icon={<Users size={18} />} hint="Minimum sample applied before ranking" accent="blue" />
        </div>
      )}

      <MethodAlgorithm />

      {/* Pipeline */}
      <Card index={1} glow="blue" className="p-6">
        <CardHeader icon={<Workflow size={16} />} title="Model pipeline" subtitle="Each stage feeds the next; every output is stored for audit" />
        <div className="flex flex-col gap-3 lg:flex-row lg:items-stretch">
          {d.pipeline.map((s, i) => {
            const Icon = ICONS[i % ICONS.length];
            return (
              <Fragment key={s.id}>
                <div className="rise relative flex-1 overflow-hidden rounded-2xl border border-ink/[0.08] bg-ink/[0.02] p-4" style={{ ["--i" as string]: i + 1 }}>
                  <div className="absolute inset-x-0 top-0 h-[2px]" style={{ background: STEP_COLORS[i % STEP_COLORS.length] }} />
                  <div className="flex items-center gap-2.5">
                    <span className="grid h-9 w-9 place-items-center rounded-xl text-white" style={{ background: `linear-gradient(135deg, ${STEP_COLORS[i % 5]}, rgba(60,40,20,0.04))` }}>
                      <Icon size={17} />
                    </span>
                    <div>
                      <div className="tnum text-[10.5px] font-semibold text-text-400">STAGE 0{i + 1}</div>
                      <div className="font-display text-[15px] font-semibold leading-tight">{s.title}</div>
                    </div>
                  </div>
                  {PLAIN[s.id] && <p className="mt-3 text-[13px] font-medium leading-snug text-text-100">{PLAIN[s.id]}</p>}
                  <p className="mt-2 text-[12.5px] leading-snug text-text-400">{s.detail}</p>
                  <div className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-ink/[0.04] px-2 py-1 text-[11.5px] font-medium text-text-100 ring-1 ring-ink/10">
                    <ChevronRight size={12} className="text-pink-300" /> {s.output}
                  </div>
                </div>
                {i < d.pipeline.length - 1 && (
                  <div className="flex items-center justify-center text-pink-300" aria-hidden>
                    <ArrowRight size={18} className="rotate-90 lg:rotate-0" />
                  </div>
                )}
              </Fragment>
            );
          })}
        </div>
      </Card>

      <div className="grid grid-cols-12 gap-6">
        {/* Calibration */}
        <Card index={2} className="col-span-12 p-5 lg:col-span-6">
          <CardHeader
            icon={<ScatterChart size={16} />}
            title="Win-probability calibration"
            subtitle="Predicted vs observed win rate, by decile. On the diagonal = well calibrated."
            right={<PlaceholderTag />}
          />
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={d.calibration} margin={{ top: 8, right: 12, bottom: 18, left: 0 }}>
                <CartesianGrid />
                <XAxis dataKey="predicted" type="number" domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={(v) => `${v}%`} tickLine={false} axisLine={false} label={{ value: "Predicted", position: "insideBottom", offset: -10, fill: "#7A6A58", fontSize: 11 }} />
                <YAxis type="number" domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={(v) => `${v}%`} tickLine={false} axisLine={false} width={44} />
                <ReferenceLine segment={[{ x: 0, y: 0 }, { x: 100, y: 100 }]} stroke="rgba(60,40,20,0.25)" strokeDasharray="4 4" />
                <Line dataKey="observed" stroke="#4A73A8" strokeWidth={2} dot={false} isAnimationActive={!reduce} />
                <Scatter dataKey="observed" fill="#C9688A" stroke="#FFFBF4" strokeWidth={1.5} isAnimationActive={!reduce} />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const p = payload[0].payload as MethodFile["calibration"][number];
                    return (
                      <TooltipBox title={`Predicted ${p.predicted}%`}>
                        <TooltipRow label="Observed" value={`${p.observed}%`} color="#C9688A" />
                        <TooltipRow label="Balls" value={fmtInt(p.n)} />
                      </TooltipBox>
                    );
                  }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="flex gap-4">
            <LegendItem color="#C9688A" label="Observed by decile" />
            <LegendItem color="rgba(60,40,20,0.4)" label="Perfect calibration" shape="line" />
          </div>
        </Card>

        {/* Phase impact */}
        <Card index={3} className="col-span-12 p-5 lg:col-span-6">
          <CardHeader
            icon={<BarChart3 size={16} />}
            title="Phase impact"
            subtitle="Average WP swing per pressure ball, relative to the overall mean (1.0)"
            right={<PlaceholderTag />}
          />
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={d.phaseImpact} margin={{ top: 8, right: 12, bottom: 0, left: 0 }} barGap={2}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="phase" tickLine={false} axisLine={false} tick={{ fill: "#2B2118", fontSize: 12 }} />
                <YAxis tickLine={false} axisLine={false} width={44} tickFormatter={(v) => `${v}×`} />
                <ReferenceLine y={1} stroke="rgba(60,40,20,0.3)" strokeDasharray="4 4" />
                <Tooltip
                  cursor={{ fill: "rgba(60,40,20,0.03)" }}
                  content={({ active, payload, label }) =>
                    active && payload?.length ? (
                      <TooltipBox title={label}>
                        <TooltipRow label="Batting" value={`${Number(payload[0].value).toFixed(2)}×`} color="#C9688A" />
                        <TooltipRow label="Bowling" value={`${Number(payload[1].value).toFixed(2)}×`} color="#4A73A8" />
                      </TooltipBox>
                    ) : null
                  }
                />
                <Bar dataKey="batting" fill="#B23A62" radius={[4, 4, 0, 0]} maxBarSize={48} isAnimationActive={!reduce} />
                <Bar dataKey="bowling" fill="#4A73A8" radius={[4, 4, 0, 0]} maxBarSize={48} isAnimationActive={!reduce} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="flex gap-4">
            <LegendItem color="#B23A62" label="Batting" />
            <LegendItem color="#4A73A8" label="Bowling" />
            <LegendItem color="rgba(60,40,20,0.4)" label="Overall mean" shape="line" />
          </div>
        </Card>

        {/* Sensitivity */}
        <Card index={4} className="col-span-12 p-6">
          <CardHeader icon={<SlidersHorizontal size={16} />} title="Sensitivity tests" subtitle="How much the ranking moves when one modelling choice changes" right={<PlaceholderTag />} />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-[13px]">
              <thead>
                <tr className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-text-400">
                  <th className="pb-2 font-semibold">Test</th>
                  <th className="pb-2 font-semibold">Change</th>
                  <th className="pb-2 text-right font-semibold">Rank corr. (ρ)</th>
                  <th className="pb-2 pl-6 font-semibold">Top-10 overlap</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/[0.06]">
                {d.sensitivity.map((s, i) => (
                  <tr key={i} className="rise" style={{ ["--i" as string]: i }}>
                    <td className="py-2.5 font-medium text-text-100">{s.test}</td>
                    <td className="py-2.5 text-text-400">{s.change}</td>
                    <td className="tnum py-2.5 text-right">
                      <span className={cx("font-semibold", s.rankCorrelation >= 0.9 ? "text-success" : "text-gold-400")}>
                        {s.rankCorrelation >= 0.9 ? "● " : "◐ "}
                        {s.rankCorrelation.toFixed(2)}
                      </span>
                    </td>
                    <td className="py-2.5 pl-6">
                      <div className="flex items-center gap-2">
                        <div className="flex gap-0.5" aria-hidden>
                          {Array.from({ length: 10 }).map((_, k) => (
                            <span key={k} className={cx("h-2.5 w-1.5 rounded-sm", k < s.top10Overlap ? "bg-pink-500" : "bg-ink/10")} />
                          ))}
                        </div>
                        <span className="tnum text-[12px] font-semibold">{s.top10Overlap}/10</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[11.5px] text-text-400">● ρ ≥ 0.90 stable · ◐ ρ below 0.90, check before relying on exact ranks</p>
        </Card>

        {/* Limitations */}
        <Card index={5} className="col-span-12 p-6">
          <CardHeader icon={<Microscope size={16} />} title="Limitations" subtitle="What the rating does not capture" />
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {d.limitations.map((l, i) => (
              <li key={i} className="rise flex gap-3 rounded-xl bg-ink/[0.02] p-3 ring-1 ring-ink/[0.05]" style={{ ["--i" as string]: i }}>
                <AlertTriangle size={15} className="mt-0.5 shrink-0 text-gold-400" />
                <div>
                  <div className="text-[13px] font-semibold text-text-100">{l.title}</div>
                  <p className="mt-0.5 text-[12px] leading-snug text-text-400">{l.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
