"use client";

import { Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Crosshair, Gauge, Swords, Target, Trophy } from "lucide-react";
import { useData } from "@/lib/data";
import type { EvidenceFile, EvidenceMatch, EvidencePlayer, EvidenceRole } from "@/lib/types";
import { cx, fmtDate, signed } from "@/lib/format";
import { Card } from "@/components/ui/Card";
import { Segmented } from "@/components/ui/Controls";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { TeamChip } from "@/components/ui/TeamChip";
import { DataGate, PageSkeleton } from "@/components/ui/Skeleton";
import { MatchCentre } from "@/components/match/MatchCentre";




const keyOf = (p: EvidencePlayer) => p.key ?? p.playerId;
const ROLE_LABEL: Record<EvidenceRole, string> = { batter: "batter", bowler: "bowler", allrounder: "all-rounder" };


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
  const [role, setRole] = useState<EvidenceRole>(player.role);
  useEffect(() => setRole(player.role), [player.role]);
  const [mi, setMi] = useState(0);
  useEffect(() => setMi(0), [player.playerId]);

  const pick = (id: string) => router.replace(`/evidence/?player=${id}`, { scroll: false });
  const list = all.filter((p) => p.role === role);
  const urlMatch = params.get("match");
  const urlMi = urlMatch ? player.matches.findIndex((m) => m.id === urlMatch) : -1;
  const sel = urlMatch ? urlMi : mi;
  const match = player.matches[Math.min(Math.max(mi, 0), player.matches.length - 1)];
  const chooseStandout = (i: number) => {
    setMi(i);
    router.replace(`/evidence/?player=${keyOf(player)}`, { scroll: false });
  };

  return (
    <div>
      <SectionHeader
        eyebrow="Pressure proof"
        title="The matches behind every top-10 rating"
        description="For each top-10 batter, bowler and all-rounder, the three games where they added the most win probability on pressure balls. Every marked delivery shows what the model saw: how much the game could swing, what was at stake and how strong the opponent was."
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
              if (first) pick(keyOf(first));
            }}
            options={[
              { value: "batter", label: "Batters" },
              { value: "bowler", label: "Bowlers" },
              { value: "allrounder", label: "All-rounders" },
            ]}
          />
          <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1">
            {list.map((p) => (
              <button
                key={keyOf(p)}
                onClick={() => pick(keyOf(p))}
                className={cx(
                  "flex shrink-0 items-center gap-2 rounded-xl px-3 py-1.5 text-[13px] font-medium ring-1 transition",
                  keyOf(p) === keyOf(player)
                    ? "bg-pink-500 text-white ring-pink-500"
                    : "bg-ink/[0.03] text-text-100 ring-ink/10 hover:bg-ink/[0.07]",
                )}
              >
                <span className={cx("tnum text-[11px] font-semibold", keyOf(p) === keyOf(player) ? "text-white/80" : "text-text-400")}>
                  #{p.rank}
                </span>
                {p.name}
              </button>
            ))}
            {list.length === 0 && <span className="self-center text-[13px] text-text-400">No players meet the minimum pressure balls on both sides.</span>}
          </div>
        </div>
        {role === "allrounder" && (
          <p className="mt-3 text-[12px] leading-snug text-text-400">
            All-rounders: enough pressure balls both batting and bowling. Rating combines batting and bowling pressure win probability added
            (each side shrunk and standardised, then summed); 50 = average qualifying all-rounder.
          </p>
        )}
      </Card>

      {player.role === role && (
      <>
      <PlayerSummary p={player} />

      {/* Standout match selector */}
      <div className="mb-6 grid gap-3 md:grid-cols-3">
        {player.matches.map((m, i) => (
          <button
            key={m.id}
            onClick={() => chooseStandout(i)}
            className={cx(
              "glass rise min-w-0 p-4 text-left transition",
              i === sel ? "ring-2 ring-pink-500/60" : "hover:ring-1 hover:ring-ink/20",
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
            <div className="mt-3 flex flex-wrap items-end justify-between gap-x-3 gap-y-2">
              <div>
                <div className="tnum font-display text-[18px] font-semibold leading-none">{m.line}</div>
                <div className="mt-1 text-[11px] text-text-400">{m.pressureBalls} pressure balls</div>
              </div>
              <div className="text-right">
                <div className={cx("tnum font-display text-[18px] font-semibold leading-none", m.pressureWpa >= 0 ? "text-success" : "text-danger")}>
                  {signed(m.pressureWpa, 1)}
                </div>
                <div className="mt-1 text-[11px] text-text-400">
                  {player.role === "allrounder" ? "combined WP points" : "WP points on pressure balls"}
                </div>
                {player.role === "allrounder" && (
                  <div className="tnum mt-0.5 text-[11px] text-text-400">
                    bat <span className={cx("font-semibold", (m.batWpa ?? 0) >= 0 ? "text-success" : "text-danger")}>{signed(m.batWpa ?? 0, 1)}</span>
                    {" · "}bowl <span className={cx("font-semibold", (m.bowlWpa ?? 0) >= 0 ? "text-success" : "text-danger")}>{signed(m.bowlWpa ?? 0, 1)}</span>
                  </div>
                )}
              </div>
            </div>
          </button>
        ))}
      </div>

      <div className="mb-2 mt-8 flex items-baseline justify-between gap-3">
        <h2 className="font-display text-[20px] font-semibold tracking-tight">Pressure balls in this match</h2>
        <span className="text-[12px] text-text-400">Search any match or player below; the view is kept in the link.</span>
      </div>
      <MatchCentre key={`${keyOf(player)}-${match.id}`} defaultMatch={match} defaultCurve={d.curves[match.id] ?? []} defaultPlayer={player} />
      </>
      )}
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

function compareCard(c: EvidencePlayer["compare"], balls?: number) {
  const better = c.higherIsBetter ? c.pressure >= c.normal : c.pressure <= c.normal;
  const econ = c.metric === "Economy";
  const f = (v: number) => (econ ? v.toFixed(2) : v.toFixed(0));
  return {
    icon: econ ? <Target size={14} /> : <Swords size={14} />,
    k: econ ? "Bowling · pressure econ." : "Batting · pressure SR",
    v: f(c.pressure),
    sub: `${balls !== undefined ? `${balls.toLocaleString()} pressure balls · ` : ""}normal ${f(c.normal)}`,
    tone: better ? "text-success" : "text-danger",
  };
}

function PlayerSummary({ p }: { p: EvidencePlayer }) {
  if (p.role === "allrounder") return <AllrounderSummary p={p} />;
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
            No. {p.rank} {ROLE_LABEL[p.role]} under pressure
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

function AllrounderSummary({ p }: { p: EvidencePlayer }) {
  const stats: { icon: ReactNode; k: string; v: string; sub: string; tone?: string }[] = [
    { icon: <Trophy size={14} />, k: "Combined rating", v: p.rating.toFixed(1), sub: `likely ${p.ratingLo.toFixed(0)}–${p.ratingHi.toFixed(0)}` },
    { icon: <Target size={14} />, k: "Top-10 chance", v: `${Math.round(p.pTop10 * 100)}%`, sub: "among all-rounders" },
    compareCard(p.compare, p.pressureBallsBat),
    ...(p.compareBowl ? [compareCard(p.compareBowl, p.pressureBallsBowl)] : []),
    {
      icon: <Gauge size={14} />,
      k: "Pressure WP added",
      v: signed(p.totalPressureWpa, 1),
      sub: `bat ${signed(p.totalPressureWpaBat ?? 0, 1)} · bowl ${signed(p.totalPressureWpaBowl ?? 0, 1)}`,
      tone: p.totalPressureWpa >= 0 ? "text-success" : "text-danger",
    },
  ];
  return (
    <Card index={2} glow="pink" className="mb-6 p-5">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
        <div className="min-w-[200px]">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-400">No. {p.rank} all-rounder under pressure</div>
          <div className="mt-1 flex items-center gap-2">
            <Link href={`/player/?id=${p.playerId}`} className="font-display text-[24px] font-bold tracking-tight hover:text-pink-500">
              {p.name}
            </Link>
            <TeamChip code={p.team} />
          </div>
          <div className="tnum mt-1 text-[12px] text-text-400">
            {(p.pressureBallsBat ?? 0).toLocaleString()} batting + {(p.pressureBallsBowl ?? 0).toLocaleString()} bowling pressure balls
            {" · "}
            {Math.round(p.positiveMatchShare * 100)}% of {p.pressureMatches} matches positive
          </div>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
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
    </Card>
  );
}
