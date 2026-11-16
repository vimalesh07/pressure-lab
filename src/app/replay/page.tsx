"use client";

import { useMemo, useState } from "react";
import { CalendarDays, Flame, MapPin, Medal, Repeat, TrendingUp, Trophy } from "lucide-react";
import Link from "next/link";
import { useData } from "@/lib/data";
import type { ReplayMatch } from "@/lib/types";
import { cx, fmtDate, pressureColor, signed } from "@/lib/format";
import { Card, CardHeader } from "@/components/ui/Card";
import { Select } from "@/components/ui/Controls";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { TeamChip } from "@/components/ui/TeamChip";
import { DataGate, PageSkeleton } from "@/components/ui/Skeleton";
import { WpCurveCard } from "@/components/charts/WpCurveCard";
import { RankBadge } from "@/components/ui/RankRow";

/** Display-only summaries of the supplied ball data (no modelling). */
function summarise(m: ReplayMatch) {
  const peak = m.balls.reduce((a, b) => (b.pressure > a.pressure ? b : a), m.balls[0]);
  let leadChanges = 0;
  for (let i = 1; i < m.balls.length; i++) if ((m.balls[i - 1].wp - 50) * (m.balls[i].wp - 50) < 0) leadChanges++;
  let swing = { v: 0, over: "", innings: 1 };
  for (let i = 1; i < m.balls.length; i++) {
    const d = m.balls[i].wp - m.balls[i - 1].wp;
    if (Math.abs(d) > Math.abs(swing.v) && m.balls[i].innings === m.balls[i - 1].innings) swing = { v: d, over: m.balls[i].over, innings: m.balls[i].innings };
  }
  const extreme = m.balls.filter((b) => b.pressure >= 0.8).length;
  return { peak, leadChanges, swing, extreme };
}

export default function ReplayPage() {
  const state = useData("match_replay.json");
  const [id, setId] = useState<string | null>(null);

  return (
    <DataGate state={state} skeleton={<PageSkeleton />}>
      {({ matches }) => {
        const m = matches.find((x) => x.id === id) ?? matches[0];
        return <ReplayView m={m} matches={matches} onSelect={setId} />;
      }}
    </DataGate>
  );
}

function ReplayView({ m, matches, onSelect }: { m: ReplayMatch; matches: ReplayMatch[]; onSelect: (id: string) => void }) {
  const s = useMemo(() => summarise(m), [m]);
  return (
    <div>
      <SectionHeader
        eyebrow="Match replay"
        title="How the pressure built, ball by ball"
        description="Win probability for the side batting first, with the pressure on every delivery glowing underneath."
        right={
          <Select
            label="Match"
            value={m.id}
            onChange={onSelect}
            icon={<CalendarDays size={14} />}
            options={matches.map((x) => ({ value: x.id, label: `${x.teamA} vs ${x.teamB} · ${x.competition} ${x.stage}` }))}
          />
        }
      />

      <Card index={1} className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-4 p-5">
        <div className="flex items-center gap-4">
          <div className="text-center">
            <TeamChip code={m.teamA} className="text-[13px]" />
            <div className="tnum mt-1.5 font-display text-[20px] font-semibold">{m.scoreA}</div>
          </div>
          <span className="font-display text-[13px] text-text-400">vs</span>
          <div className="text-center">
            <TeamChip code={m.teamB} className="text-[13px]" />
            <div className="tnum mt-1.5 font-display text-[20px] font-semibold">{m.scoreB}</div>
          </div>
        </div>
        <div className="h-10 w-px bg-ink/10" />
        <div className="space-y-1 text-[13px]">
          <div className="flex items-center gap-2 font-semibold text-text-100">
            <Trophy size={14} className="text-gold-400" /> {m.result}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-text-400">
            <span>{m.competition} · {m.stage}</span>
            <span className="inline-flex items-center gap-1"><CalendarDays size={13} /> {fmtDate(m.date)}</span>
            <span className="inline-flex items-center gap-1"><MapPin size={13} /> {m.venue}</span>
          </div>
        </div>
        <div className="ml-auto grid grid-cols-3 gap-2">
          {[
            { icon: <Flame size={14} />, k: "Peak pressure", v: `Ov ${s.peak.over}`, sub: s.peak.pressure.toFixed(2), color: pressureColor(s.peak.pressure) },
            { icon: <Repeat size={14} />, k: "Lead changes", v: `${s.leadChanges}`, sub: "WP crossed 50%" },
            { icon: <TrendingUp size={14} />, k: "Biggest swing", v: `${signed(Math.abs(s.swing.v), 0)}%`, sub: `Ov ${s.swing.over}` },
          ].map((x) => (
            <div key={x.k} className="glass-raised px-3 py-2">
              <div className="flex items-center gap-1 whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.08em] text-text-400">
                {x.icon} {x.k}
              </div>
              <div className="tnum mt-1 font-display text-[18px] font-semibold leading-none">{x.v}</div>
              <div className="tnum mt-0.5 flex items-center gap-1.5 text-[11px] text-text-400">
                {x.color && <span className="h-2 w-2 rounded-full" style={{ background: x.color }} />}
                {x.sub}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-12 lg:col-span-8">
          <WpCurveCard key={m.id} match={m} index={2} />
        </div>
        <div className="col-span-12 lg:col-span-4">
          <Card index={3} className="h-full p-5">
            <CardHeader icon={<Medal size={16} />} title="Top pressure performers" subtitle="Win probability added in this match" />
            <div className="space-y-2">
              {m.performers.map((p, i) => (
                <Link
                  key={p.playerId}
                  href={`/player/?id=${p.playerId}`}
                  className="rise flex items-center gap-3 rounded-2xl border border-ink/[0.06] bg-ink/[0.02] p-3 transition hover:border-ink/15 hover:bg-bg-700/60"
                  style={{ ["--i" as string]: i + 3 }}
                >
                  <RankBadge rank={i + 1} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-display text-[14px] font-semibold">{p.name}</span>
                      <TeamChip code={p.team} />
                    </div>
                    <div className="tnum mt-0.5 truncate text-[11.5px] text-text-400">{p.line}</div>
                  </div>
                  <div className="text-right">
                    <div className="tnum font-display text-[16px] font-semibold text-success">▲{p.wpa.toFixed(1)}</div>
                    <div className="text-[10px] uppercase tracking-[0.1em] text-text-400">WPA</div>
                  </div>
                </Link>
              ))}
            </div>
            <div className="mt-4 rounded-xl bg-ink/[0.03] p-3 text-[11.5px] leading-snug text-text-400 ring-1 ring-ink/[0.06]">
              <span className="tnum font-semibold text-text-100">{s.extreme}</span> deliveries in this match had a pressure index of 0.80 or above.
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
