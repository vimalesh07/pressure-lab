"use client";

import Link from "next/link";
import { ArrowRight, CircleDot, TrendingUp, Trophy, Users, Zap } from "lucide-react";
import { useData } from "@/lib/data";
import { PlayerSphereCard } from "@/components/PlayerSphereCard";

export default function HomePage() {
  const kpis = useData("kpis.json");
  return (
    <section className="mx-auto grid h-full max-w-7xl items-center gap-8 py-4 lg:grid-cols-[1.1fr_1fr] lg:gap-12">
      <div className="self-center lg:pl-6">
        <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-pink-500/[0.07] px-3 py-1 text-[11.5px] font-semibold uppercase tracking-[0.16em] text-pink-500 ring-1 ring-pink-500/20">
          <span className="live-dot h-1.5 w-1.5 rounded-full bg-pink-500" />
          Pressure Lab · {kpis.data ? `${kpis.data.competitions.join(" + ")} ${kpis.data.dataWindow}` : "IPL + T20I"}
        </div>
        <h1 className="font-display text-[clamp(36px,4.6vw,64px)] font-bold leading-[1.04] tracking-tight">
          <span className="text-gradient">Who handles the</span>
          <br />
          <span className="text-gradient">pressure best?</span>
        </h1>
        <p className="mt-5 max-w-xl text-justify text-[16px] leading-relaxed text-text-400 [hyphens:auto]">
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
        {/* glass tiles: what the lab measures */}
        <div className="mt-7 grid max-w-xl grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { e: <CircleDot size={17} />, k: kpis.data ? kpis.data.matchesAnalysed.toLocaleString("en-IN") : "–", l: "matches" },
            { e: <Zap size={17} />, k: kpis.data ? kpis.data.pressureBalls.toLocaleString("en-IN") : "–", l: "pressure balls" },
            { e: <Users size={17} />, k: kpis.data ? String(kpis.data.playersRated) : "–", l: "players rated" },
            { e: <TrendingUp size={17} />, k: "Win %", l: "ball-by-ball model" },
          ].map((t) => (
            <div
              key={t.l}
              className="rounded-2xl border border-white/60 bg-white/35 px-3 py-3 shadow-[0_8px_24px_-14px_rgba(60,40,20,0.35)] backdrop-blur-md transition hover:-translate-y-0.5 hover:bg-white/50"
            >
              <div className="grid h-9 w-9 place-items-center rounded-xl border border-white/70 bg-white/50 text-pink-500 backdrop-blur" aria-hidden>
                {t.e}
              </div>
              <div className="tnum mt-2 font-display text-[17px] font-semibold leading-none">{t.k}</div>
              <div className="mt-1 text-[11.5px] text-text-400">{t.l}</div>
            </div>
          ))}
        </div>
        <Link href="/method/" className="mt-6 inline-flex items-center gap-1 text-[13px] font-medium text-text-400 hover:text-pink-500">
          How is the rating built? See the method <ArrowRight size={14} />
        </Link>
      </div>
      <div className="self-center">
        <PlayerSphereCard />
      </div>
    </section>
  );
}
