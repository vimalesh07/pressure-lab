"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, Crosshair, Gauge, ListOrdered, ScanSearch, Swords, Target, Trophy } from "lucide-react";
import { useData } from "@/lib/data";
import type { EvidenceDelivery, EvidenceFile, EvidenceMatch, EvidencePlayer, ReplayMatch } from "@/lib/types";
import { cx, fmtDate, pressureColor, signed } from "@/lib/format";
import { Card, CardHeader } from "@/components/ui/Card";
import { Segmented } from "@/components/ui/Controls";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { TeamChip } from "@/components/ui/TeamChip";
import { DataGate, PageSkeleton } from "@/components/ui/Skeleton";
import { WpCurveCard, type CurveMark } from "@/components/charts/WpCurveCard";

const GOOD = "#2F7D5B";
const BAD = "#B8443A";

function glyph(d: EvidenceDelivery, role: "batter" | "bowler") {
  if (d.wicket) return "W";
  if (role === "batter") return d.runs ? String(d.runs) : "•";
  return d.runs ? String(d.runs) : "•";
}

function levelClass(level: string) {
  return level === "Extreme"
    ? "bg-danger/10 text-danger ring-danger/25"
    : level === "Very high"
      ? "bg-pink-500/10 text-pink-500 ring-pink-500/25"
      : level === "High"
        ? "bg-gold-400/10 text-gold-400 ring-gold-400/30"
        : "bg-ink/5 text-text-400 ring-ink/10";
}

export default function EvidencePage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <EvidenceInner />
    </Suspense>
  );
}

function EvidenceInner() {
  const state = useData("evidence.json");
  return <DataGate state={state} skeleton={<PageSkeleton />}>{(d) => <EvidenceView d={d} />}</DataGate>;
}

function EvidenceView({ d }: { d: EvidenceFile }) {
  const params = useSearchParams();
  const router = useRouter();
  const all = useMemo(() => Object.values(d.players).sort((a, b) => a.rank - b.rank), [d.players]);
  const requested = params.get("player");
  const player = (requested && d.players[requested]) || all.find((p) => p.role === "batter") || all[0];
  const [role, setRole] = useState<"batter" | "bowler">(player.role);
  useEffect(() => setRole(player.role), [player.role]);
  const [mi, setMi] = useState(0);
  useEffect(() => setMi(0), [player.playerId]);

  const pick = (id: string) => router.replace(`/evidence/?player=${id}`, { scroll: false });
  const list = all.filter((p) => p.role === role);
  const match = player.matches[Math.min(mi, player.matches.length - 1)];

  return (
    <div>
      <SectionHeader
        eyebrow="Pressure proof"
        title="The matches behind every top-10 rating"
        description="For each top-10 player, the three games where they added the most win probability on pressure balls. Every marked delivery shows what the model saw: how much the game could swing, what was at stake and how strong the opponent was."
      />

      {/* Player picker */}
      <Card index={1} className="mb-6 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <Segmented
            label="Role"
            value={role}
            onChange={(r) => {
              setRole(r);
              const first = all.find((p) => p.role === r);
              if (first) pick(first.playerId);
            }}
            options={[
              { value: "batter", label: "Batters" },
              { value: "bowler", label: "Bowlers" },
            ]}
          />
          <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1">
            {list.map((p) => (
              <button
                key={p.playerId}
                onClick={() => pick(p.playerId)}
                className={cx(
                  "flex shrink-0 items-center gap-2 rounded-xl px-3 py-1.5 text-[13px] font-medium ring-1 transition",
                  p.playerId === player.playerId
                    ? "bg-pink-500 text-white ring-pink-500"
                    : "bg-ink/[0.03] text-text-100 ring-ink/10 hover:bg-ink/[0.07]",
                )}
              >
                <span className={cx("tnum text-[11px] font-semibold", p.playerId === player.playerId ? "text-white/80" : "text-text-400")}>
                  #{p.rank}
                </span>
                {p.name}
              </button>
            ))}
          </div>
        </div>
      </Card>

      <PlayerSummary p={player} />

      {/* Standout match selector */}
      <div className="mb-6 grid gap-3 md:grid-cols-3">
        {player.matches.map((m, i) => (
          <button
            key={m.id}
            onClick={() => setMi(i)}
            className={cx(
              "glass rise p-4 text-left transition",
              i === mi ? "ring-2 ring-pink-500/60" : "hover:ring-1 hover:ring-ink/20",
            )}
            style={{ ["--i" as string]: i + 3 }}
          >
            <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.12em] text-text-400">
              <span>Standout {i + 1}</span>
              <ResultChip m={m} />
            </div>
            <div className="mt-2 truncate font-display text-[15px] font-semibold">
              {m.teamA} vs {m.teamB}
            </div>
            <div className="mt-0.5 truncate text-[12px] text-text-400">
              {m.competition} · {m.stage} · {fmtDate(m.date)}
            </div>
            <div className="mt-3 flex items-end justify-between">
              <div>
                <div className="tnum font-display text-[18px] font-semibold leading-none">{m.line}</div>
                <div className="mt-1 text-[11px] text-text-400">{m.pressureBalls} pressure balls</div>
              </div>
              <div className="text-right">
                <div className={cx("tnum font-display text-[18px] font-semibold leading-none", m.pressureWpa >= 0 ? "text-success" : "text-danger")}>
                  {signed(m.pressureWpa, 1)}
                </div>
                <div className="mt-1 text-[11px] text-text-400">WP points on pressure balls</div>
              </div>
            </div>
          </button>
        ))}
      </div>

      <MatchEvidence key={`${player.playerId}-${match.id}`} p={player} m={match} curve={d.curves[match.id] ?? []} />
    </div>
  );
}

function ResultChip({ m }: { m: EvidenceMatch }) {
  if (m.won === null) return <span className="rounded-full bg-ink/5 px-2 py-0.5 text-text-400">Tie</span>;
  return (
    <span className={cx("rounded-full px-2 py-0.5 ring-1", m.won ? "bg-success/10 text-success ring-success/25" : "bg-danger/10 text-danger ring-danger/25")}>
      {m.playerTeam} {m.won ? "won" : "lost"}
    </span>
  );
}

function PlayerSummary({ p }: { p: EvidencePlayer }) {
  const c = p.compare;
  const better = c.higherIsBetter ? c.pressure >= c.normal : c.pressure <= c.normal;
  const stats = [
    { icon: <Trophy size={14} />, k: "Pressure Rating", v: p.rating.toFixed(1), sub: `likely ${p.ratingLo.toFixed(0)}–${p.ratingHi.toFixed(0)}` },
    { icon: <Target size={14} />, k: "Top-10 chance", v: `${Math.round(p.pTop10 * 100)}%`, sub: "over 1,000 resamples" },
    { icon: <Gauge size={14} />, k: "Pressure balls", v: p.pressureBalls.toLocaleString(), sub: `across ${p.pressureMatches} matches` },
    {
      icon: <Crosshair size={14} />,
      k: "Positive matches",
      v: `${Math.round(p.positiveMatchShare * 100)}%`,
      sub: "added win prob. under pressure",
    },
    {
      icon: <Swords size={14} />,
      k: c.metric === "Economy" ? "Pressure economy" : "Pressure SR",
      v: `${c.metric === "Economy" ? c.pressure.toFixed(2) : c.pressure.toFixed(0)}`,
      sub: `${better ? "better than" : "worse than"} normal ${c.metric === "Economy" ? c.normal.toFixed(2) : c.normal.toFixed(0)}`,
      tone: better ? "text-success" : "text-danger",
    },
  ];
  return (
    <Card index={2} glow="pink" className="mb-6 p-5">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
        <div className="min-w-[200px]">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-400">
            No. {p.rank} {p.role} under pressure
          </div>
          <div className="mt-1 flex items-center gap-2">
            <Link href={`/player/?id=${p.playerId}`} className="font-display text-[24px] font-bold tracking-tight hover:text-pink-500">
              {p.name}
            </Link>
            <TeamChip code={p.team} />
          </div>
        </div>
        <div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
          {stats.map((s) => (
            <div key={s.k} className="glass-raised px-3 py-2">
              <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-text-400">
                {s.icon} <span className="truncate">{s.k}</span>
              </div>
              <div className={cx("tnum mt-1 font-display text-[19px] font-semibold leading-none", s.tone)}>{s.v}</div>
              <div className="mt-0.5 truncate text-[11px] text-text-400">{s.sub}</div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

function MatchEvidence({ p, m, curve }: { p: EvidencePlayer; m: EvidenceMatch; curve: ReplayMatch["balls"] }) {
  const [onlyPressure, setOnlyPressure] = useState(true);
  const best = useMemo(
    () => m.deliveries.filter((x) => x.isPressure).reduce((a, b) => (b.wpa > a.wpa ? b : a), m.deliveries[0]),
    [m.deliveries],
  );
  const [sel, setSel] = useState<number>(best.idx);
  const cur = m.deliveries.find((x) => x.idx === sel) ?? best;

  const replay: ReplayMatch = {
    id: m.id,
    competition: m.competition,
    stage: m.stage,
    date: m.date,
    venue: m.venue,
    teamA: m.teamA,
    teamB: m.teamB,
    scoreA: m.scoreA,
    scoreB: m.scoreB,
    result: m.result,
    balls: curve,
    performers: [],
  };
  const marks: CurveMark[] = m.deliveries
    .filter((x) => x.isPressure)
    .map((x) => ({
      idx: x.idx,
      glyph: glyph(x, p.role),
      color: x.wpa >= 0 ? GOOD : BAD,
      title: `Ov ${x.over} · ${x.outcome} ${p.role === "batter" ? "off" : "to"} ${x.opponent} · ${signed(x.wpa, 1)} pts`,
      active: x.idx === cur.idx,
    }));
  const rows = onlyPressure ? m.deliveries.filter((x) => x.isPressure) : m.deliveries;

  return (
    <div className="grid grid-cols-12 gap-6">
      <div className="col-span-12 xl:col-span-8">
        <WpCurveCard
          match={replay}
          index={4}
          marks={marks}
          onPick={setSel}
          title={`${p.name}'s pressure balls in this match`}
          legend={
            <div className="hidden flex-wrap justify-end gap-x-4 gap-y-1 text-[12px] text-text-400 md:flex">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-full" style={{ background: GOOD }} /> Added win prob. for {m.playerTeam}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-full" style={{ background: BAD }} /> Cost win prob.
              </span>
            </div>
          }
        />
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[12px] text-text-400">
          <span className="inline-flex items-center gap-1">
            <CalendarDays size={13} /> {m.result}
          </span>
          <span>
            {m.playerTeam} {p.role === "batter" ? "batting" : "bowling"} · {m.line} · whole-match WPA {signed(m.matchWpa, 1)} pts
          </span>
          <span>Click a marker to inspect that ball.</span>
        </div>
      </div>
      <div className="col-span-12 xl:col-span-4">
        <BallInspector d={cur} p={p} m={m} />
      </div>

      <div className="col-span-12">
        <Card index={6} className="p-5">
          <CardHeader
            icon={<ListOrdered size={16} />}
            title="Every delivery, as the model classified it"
            subtitle="A ball is a pressure ball when leverage × stakes × opponent threat is in the top 20% for that side."
            right={
              <Segmented
                label="Deliveries shown"
                size="sm"
                value={onlyPressure ? "p" : "all"}
                onChange={(v) => setOnlyPressure(v === "p")}
                options={[
                  { value: "p", label: `Pressure (${m.pressureBalls})` },
                  { value: "all", label: `All (${m.deliveries.length})` },
                ]}
              />
            }
          />
          <div className="-mx-2 overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-[12.5px]">
              <thead className="text-[10.5px] uppercase tracking-[0.1em] text-text-400">
                <tr>
                  <th className="px-2 py-2 font-semibold">Over</th>
                  <th className="px-2 py-2 font-semibold">Situation</th>
                  <th className="px-2 py-2 font-semibold">State</th>
                  <th className="px-2 py-2 font-semibold">{p.role === "batter" ? "Bowler" : "Batter"}</th>
                  <th className="px-2 py-2 font-semibold">Outcome</th>
                  <th className="px-2 py-2 font-semibold">Pressure</th>
                  <th className="px-2 py-2 text-right font-semibold">Win prob.</th>
                  <th className="px-2 py-2 text-right font-semibold">WPA</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((x) => (
                  <tr
                    key={x.idx}
                    onClick={() => setSel(x.idx)}
                    className={cx(
                      "cursor-pointer border-t border-ink/[0.06] transition hover:bg-ink/[0.03]",
                      x.idx === cur.idx && "bg-pink-500/[0.06]",
                      !x.isPressure && "text-text-400",
                    )}
                  >
                    <td className="tnum px-2 py-2 font-semibold">{x.over}</td>
                    <td className="px-2 py-2">{x.situation}</td>
                    <td className="tnum px-2 py-2 text-text-400">{x.state}</td>
                    <td className="px-2 py-2">{x.opponent}</td>
                    <td className="px-2 py-2 capitalize">{x.outcome}</td>
                    <td className="px-2 py-2">
                      <span className={cx("rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1", levelClass(x.level))}>{x.level}</span>
                    </td>
                    <td className="tnum px-2 py-2 text-right text-text-400">
                      {x.wpBefore.toFixed(0)}% → {x.wpAfter.toFixed(0)}%
                    </td>
                    <td className={cx("tnum px-2 py-2 text-right font-semibold", x.wpa >= 0 ? "text-success" : "text-danger")}>{signed(x.wpa, 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}

function Factor({ label, value, hint, max = 3 }: { label: string; value: number; hint: string; max?: number }) {
  const w = Math.min(100, (value / max) * 100);
  return (
    <div>
      <div className="flex items-baseline justify-between text-[12.5px]">
        <span className="font-semibold text-text-100">{label}</span>
        <span className="tnum font-display text-[15px] font-semibold">×{value.toFixed(2)}</span>
      </div>
      <div className="relative mt-1 h-1.5 rounded-full bg-ink/[0.07]">
        <div className="absolute inset-y-0 left-0 rounded-full bg-pink-500/70" style={{ width: `${w}%` }} />
        <div className="absolute inset-y-[-3px] w-px bg-ink/40" style={{ left: `${(1 / max) * 100}%` }} title="1.00 = average" />
      </div>
      <div className="mt-1 text-[11px] leading-snug text-text-400">{hint}</div>
    </div>
  );
}

function BallInspector({ d, p, m }: { d: EvidenceDelivery; p: EvidencePlayer; m: EvidenceMatch }) {
  const top = Math.max(1, Math.round((1 - d.pressure) * 100));
  const f = d.factors;
  return (
    <Card index={5} className="h-full p-5">
      <CardHeader icon={<ScanSearch size={16} />} title={`Over ${d.over}`} subtitle={`${m.teamA} vs ${m.teamB} · innings ${d.innings}`} />
      <div className="rounded-2xl bg-ink/[0.03] p-4 ring-1 ring-ink/[0.06]">
        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-400">Situation</div>
        <div className="mt-1 font-display text-[16px] font-semibold leading-snug">{d.situation}</div>
        <div className="tnum mt-1 text-[12.5px] text-text-400">{d.state}</div>
        {d.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {d.tags.map((t) => (
              <span key={t} className="rounded-full bg-bg-800 px-2 py-0.5 text-[11px] font-medium text-text-100 ring-1 ring-ink/10">
                {t}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-400">Model verdict</div>
          <div className="mt-1 flex items-center gap-2">
            <span className={cx("rounded-full px-2 py-0.5 text-[12px] font-semibold ring-1", levelClass(d.level))}>{d.level}</span>
            <span className="text-[12px] text-text-400">{d.isPressure ? `top ${top}% of ${p.role} balls` : "not a pressure ball"}</span>
          </div>
        </div>
        <span className="h-9 w-9 shrink-0 rounded-full ring-4 ring-bg-800" style={{ background: pressureColor(d.pressure) }} aria-hidden />
      </div>

      <div className="mt-4 space-y-3">
        <Factor label="Leverage" value={f.leverage} max={4} hint="How far the result could swing on this ball, from the win-probability model (1.00 = average ball)." />
        <Factor label="Match stakes" value={f.stakes} max={2} hint="Knockouts, must-win games, NRR races and favourites under threat raise it." />
        <Factor
          label="Opponent threat"
          value={f.threat}
          max={2.5}
          hint={`${p.role === "batter" ? "Bowler" : "Batter"} tier: ${f.threatTier}. Stronger opponents make the ball harder.`}
        />
      </div>

      <div className="mt-4 rounded-2xl bg-ink/[0.03] p-4 ring-1 ring-ink/[0.06]">
        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-400">What happened</div>
        <div className="mt-1 text-[14px]">
          <span className="font-semibold capitalize">{d.outcome}</span> {p.role === "batter" ? "off" : "to"} {d.opponent}
        </div>
        <div className="tnum mt-2 flex items-center justify-between">
          <span className="text-[12.5px] text-text-400">
            {m.playerTeam} win prob. {d.wpBefore.toFixed(0)}% → {d.wpAfter.toFixed(0)}%
          </span>
          <span className={cx("font-display text-[18px] font-semibold", d.wpa >= 0 ? "text-success" : "text-danger")}>{signed(d.wpa, 1)} pts</span>
        </div>
      </div>
    </Card>
  );
}
