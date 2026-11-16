"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, ChevronLeft, ChevronRight, CircleDot, Pause, Play, ScanSearch, Trophy } from "lucide-react";
import { useData } from "@/lib/data";
import type { Leaderboard, LeaderboardRow } from "@/lib/types";
import { cx } from "@/lib/format";
import { Card } from "@/components/ui/Card";
import { TeamChip } from "@/components/ui/TeamChip";
import { DeltaPill } from "@/components/ui/DeltaPill";
import { Skeleton } from "@/components/ui/Skeleton";
import { PressureGauge } from "@/components/ui/PressureGauge";
import { useReducedMotion } from "@/components/charts/useReducedMotion";

const SLIDE_MS = 4500;

function overall(lb: Leaderboard) {
  return lb.views.find((v) => v.format === "All" && v.season === "All" && v.phase === "All")?.rows ?? [];
}

type Slide = { row: LeaderboardRow; role: "batter" | "bowler" };

function PressureSlideshow({ slides }: { slides: Slide[] }) {
  const reduce = useReducedMotion();
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const playing = !paused && !reduce;

  useEffect(() => {
    if (!playing) return;
    const t = setTimeout(() => setI((n) => (n + 1) % slides.length), SLIDE_MS);
    return () => clearTimeout(t);
  }, [i, playing, slides.length]);

  const s = slides[i];
  const go = (d: number) => setI((n) => (n + d + slides.length) % slides.length);

  return (
    <div
      className="glass-raised relative flex w-full flex-col items-center overflow-hidden p-5 sm:w-[320px]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      aria-roledescription="carousel"
      aria-label="Top 3 batters and bowlers under pressure"
    >
      {/* Role tabs */}
      <div className="flex w-full gap-1 rounded-lg bg-ink/[0.05] p-1 text-[11px] font-semibold uppercase tracking-[0.12em]">
        {(["batter", "bowler"] as const).map((role) => (
          <button
            key={role}
            onClick={() => setI(slides.findIndex((x) => x.role === role))}
            className={cx(
              "flex-1 rounded-md py-1 transition",
              s.role === role ? "bg-bg-800 text-pink-500 shadow-sm" : "text-text-400 hover:text-text-100",
            )}
          >
            {role}s
          </button>
        ))}
      </div>

      <Link
        key={i}
        href={`/player/?id=${s.row.playerId}`}
        className="slide-in mt-4 flex flex-col items-center gap-2"
        aria-live={playing ? "off" : "polite"}
      >
        <span className="text-[11px] uppercase tracking-[0.16em] text-text-400">
          No. {s.row.rank} {s.role} under pressure
        </span>
        <PressureGauge value={s.row.rating} size={200} />
        <span className="flex items-center gap-2">
          <span className="font-display text-[17px] font-semibold">{s.row.name}</span>
          <TeamChip code={s.row.team} />
        </span>
        <span className="flex items-center gap-1.5 text-[11px] text-text-400">
          <DeltaPill value={s.row.deltaPct} size="sm" /> vs normal balls
        </span>
      </Link>
      <Link
        href={`/evidence/?player=${s.row.playerId}`}
        className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-pink-500/[0.08] px-3 py-1.5 text-[12px] font-semibold text-pink-500 ring-1 ring-pink-500/20 transition hover:bg-pink-500/[0.14]"
      >
        <ScanSearch size={13} /> See the matches that prove it
      </Link>

      {/* Controls */}
      <div className="mt-4 flex w-full items-center justify-between">
        <button onClick={() => go(-1)} className="rounded-lg p-1.5 text-text-400 hover:bg-ink/[0.05] hover:text-text-100" aria-label="Previous player">
          <ChevronLeft size={16} />
        </button>
        <div className="flex items-center gap-1.5">
          {slides.map((x, k) => (
            <button
              key={k}
              onClick={() => setI(k)}
              aria-label={`Show ${x.row.name}`}
              aria-current={k === i}
              className={cx(
                "h-1.5 rounded-full transition-all",
                k === i ? "w-5 bg-pink-500" : "w-1.5 bg-ink/20 hover:bg-ink/40",
                k === 3 && "ml-2",
              )}
            />
          ))}
        </div>
        <div className="flex">
          {!reduce && (
            <button onClick={() => setPaused((p) => !p)} className="rounded-lg p-1.5 text-text-400 hover:bg-ink/[0.05] hover:text-text-100" aria-label={paused ? "Play slideshow" : "Pause slideshow"}>
              {paused ? <Play size={14} /> : <Pause size={14} />}
            </button>
          )}
          <button onClick={() => go(1)} className="rounded-lg p-1.5 text-text-400 hover:bg-ink/[0.05] hover:text-text-100" aria-label="Next player">
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="absolute inset-x-0 bottom-0 h-[3px] bg-ink/[0.05]">
        {playing && <div key={i} className="progress h-full bg-pink-500/70" style={{ animationDuration: `${SLIDE_MS}ms` }} />}
      </div>
    </div>
  );
}

export default function HomePage() {
  const kpis = useData("kpis.json");
  const bat = useData("leaderboard_batters.json");
  const bowl = useData("leaderboard_bowlers.json");

  const slides = useMemo<Slide[]>(() => {
    if (!bat.data || !bowl.data) return [];
    return [
      ...overall(bat.data).slice(0, 3).map((row) => ({ row, role: "batter" as const })),
      ...overall(bowl.data).slice(0, 3).map((row) => ({ row, role: "bowler" as const })),
    ];
  }, [bat.data, bowl.data]);

  return (
    <div className="flex min-h-[calc(100vh-220px)] items-center">
      <Card glow="pink" className="w-full overflow-hidden px-6 py-10 md:px-12 md:py-14">
        <div className="relative grid items-center gap-10 lg:grid-cols-[1fr_auto]">
          <div>
            <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-pink-500/[0.07] px-3 py-1 text-[11.5px] font-semibold uppercase tracking-[0.16em] text-pink-500 ring-1 ring-pink-500/20">
              <span className="live-dot h-1.5 w-1.5 rounded-full bg-pink-500" />
              Pressure Lab · {kpis.data ? `${kpis.data.competitions.join(" + ")} ${kpis.data.dataWindow}` : "IPL + T20I"}
            </div>
            <h1 className="font-display text-[42px] font-bold leading-[1.05] tracking-tight md:text-[60px]">
              <span className="text-gradient">Who handles the</span>
              <br />
              <span className="text-gradient">pressure best?</span>
            </h1>
            <p className="mt-5 max-w-lg text-[16px] leading-relaxed text-text-400">
              When the match is on the line, some players rise and some shrink. The Pressure Rating shows who delivers on
              the balls that decide T20 games.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                href="/leaderboards/"
                className="inline-flex items-center gap-2 rounded-xl bg-pink-500 px-4 py-2.5 text-[14px] font-semibold text-white shadow-[0_8px_20px_-10px_rgba(178,58,98,0.6)] transition hover:brightness-110"
              >
                <Trophy size={16} /> View leaderboards
              </Link>
              <Link
                href="/replay/"
                className="inline-flex items-center gap-2 rounded-xl bg-ink/[0.05] px-4 py-2.5 text-[14px] font-semibold text-text-100 ring-1 ring-ink/10 transition hover:bg-ink/[0.08]"
              >
                <CircleDot size={16} /> Replay a match
              </Link>
            </div>
            <Link href="/method/" className="mt-6 inline-flex items-center gap-1 text-[13px] font-medium text-text-400 hover:text-pink-500">
              How is the rating built? See the method <ArrowRight size={14} />
            </Link>
          </div>
          {slides.length ? <PressureSlideshow slides={slides} /> : <Skeleton className="h-[440px] w-full sm:w-[320px]" />}
        </div>
      </Card>
    </div>
  );
}
