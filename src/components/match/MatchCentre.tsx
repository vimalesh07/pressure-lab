"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Activity, Rows3, TableProperties } from "lucide-react";
import { loadMatch, loadMatchIndex } from "@/lib/data";
import type { EvidenceMatch, EvidencePlayer, MatchFile, MatchIndexEntry, ReplayBall } from "@/lib/types";
import { cx } from "@/lib/format";
import { BallLog } from "./BallLog";
import { MatchHeader } from "./MatchHeader";
import { MatchLookup } from "./MatchLookup";
import { OverByOver } from "./OverByOver";
import { PressureStoryChart } from "./PressureStoryChart";
import { BORDER, codeFromName, type MatchView } from "./model";

type Tab = "story" | "overs" | "log";

function roleOf(discipline: string, sides: Set<string>) {
  if (sides.has("bat") && sides.has("bowl")) return "All-rounder";
  return discipline === "bowling" || discipline === "bowler" ? "Bowler" : "Batter";
}

/** Match view from the evidence data (top-10 standout matches, incl. all-rounders' both sides). */
function fromEvidence(m: EvidenceMatch, curve: ReplayBall[], p: EvidencePlayer): MatchView {
  const sides = new Set(m.deliveries.map((d) => d.side ?? (p.role === "bowler" ? "bowl" : "bat")));
  return {
    id: m.id, competition: m.competition, stage: m.stage, date: m.date, venue: m.venue,
    teamA: m.teamA, teamB: m.teamB, teamACode: m.teamACode ?? codeFromName(m.teamA), teamBCode: m.teamBCode ?? codeFromName(m.teamB),
    scoreA: m.scoreA, scoreB: m.scoreB, result: m.result,
    winner: m.winner ?? (m.won === null ? null : m.won === m.playerTeamIsA ? "A" : "B"),
    matchNumber: m.matchNumber ?? null, curve,
    player: {
      id: p.playerId, name: p.name, role: roleOf(p.role, sides), team: m.playerTeam, isA: m.playerTeamIsA, line: m.line,
      matchWpa: m.matchWpa, pressureWpa: m.pressureWpa, deliveries: m.deliveries,
    },
  };
}

/** Match view from a matches/<id>.json file. */
function fromFile(f: MatchFile, who: string): MatchView | null {
  const p = f.players[who];
  if (!p) return null;
  const sides = new Set(p.deliveries.map((d) => d.side ?? (p.discipline === "bowling" ? "bowl" : "bat")));
  return {
    id: f.id, competition: f.competition, stage: f.stage, date: f.date, venue: f.venue,
    teamA: f.teamA, teamB: f.teamB, teamACode: f.teamACode ?? codeFromName(f.teamA), teamBCode: f.teamBCode ?? codeFromName(f.teamB),
    scoreA: f.scoreA, scoreB: f.scoreB, result: f.result,
    winner: f.winner ?? (p.won === null ? null : p.won === p.playerTeamIsA ? "A" : "B"),
    matchNumber: f.matchNumber ?? null, curve: f.curve,
    player: {
      id: who, name: p.name, role: roleOf(p.discipline, sides), team: p.playerTeam, isA: p.playerTeamIsA, line: p.line,
      matchWpa: p.matchWpa, pressureWpa: p.pressureWpa, deliveries: p.deliveries,
    },
  };
}

/**
 * Match centre for the "pressure balls in this match" section:
 * lookup bar → scoreboard header → Pressure Story | Over by Over | Ball log.
 * Selection lives in the URL (?match=<id>&who=<playerId>) so a view can be shared.
 */
export function MatchCentre({
  defaultMatch,
  defaultCurve,
  defaultPlayer,
}: {
  defaultMatch: EvidenceMatch;
  defaultCurve: ReplayBall[];
  defaultPlayer: EvidencePlayer;
}) {
  const params = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const matchId = params.get("match") ?? defaultMatch.id;
  const who = params.get("who") ?? defaultPlayer.playerId;
  const isDefault = matchId === defaultMatch.id && who === defaultPlayer.playerId;

  const [index, setIndex] = useState<MatchIndexEntry[]>([]);
  const [file, setFile] = useState<{ id: string; f: MatchFile | null; err?: string } | null>(null);
  const [tab, setTab] = useState<Tab>("story");
  const [pinned, setPinned] = useState<number | null>(null);

  useEffect(() => {
    loadMatchIndex().then(setIndex).catch(() => setIndex([]));
  }, []);
  useEffect(() => {
    if (isDefault) return;
    let alive = true;
    loadMatch(matchId)
      .then((f) => alive && setFile({ id: matchId, f }))
      .catch((e: Error) => alive && setFile({ id: matchId, f: null, err: e.message }));
    return () => {
      alive = false;
    };
  }, [matchId, isDefault]);
  useEffect(() => setPinned(null), [matchId, who]);

  const view = useMemo<MatchView | null>(() => {
    if (isDefault) return fromEvidence(defaultMatch, defaultCurve, defaultPlayer);
    if (!file || file.id !== matchId || !file.f) return null;
    return fromFile(file.f, who);
  }, [isDefault, defaultMatch, defaultCurve, defaultPlayer, file, matchId, who]);

  // index entry for the default (evidence) match may list fewer players than evidence knows; merge
  const lookupIndex = useMemo(() => {
    if (index.some((m) => m.id === defaultMatch.id)) {
      return index.map((m) =>
        m.id === defaultMatch.id && !m.players.some((p) => p.id === defaultPlayer.playerId)
          ? { ...m, players: [{ id: defaultPlayer.playerId, name: defaultPlayer.name, discipline: defaultPlayer.role === "bowler" ? ("bowling" as const) : ("batting" as const) }, ...m.players] }
          : m,
      );
    }
    return index;
  }, [index, defaultMatch.id, defaultPlayer]);

  const pick = (m: string, p: string) => {
    const q = new URLSearchParams(params.toString());
    q.set("match", m);
    q.set("who", p);
    router.replace(`${path}?${q.toString()}`, { scroll: false });
    setTab("story");
  };

  const tabs: { v: Tab; label: string; icon: ReactNode }[] = [
    { v: "story", label: "Pressure Story", icon: <Activity size={14} /> },
    { v: "overs", label: "Over by Over", icon: <Rows3 size={14} /> },
    { v: "log", label: "Ball log", icon: <TableProperties size={14} /> },
  ];

  return (
    <section className="space-y-3" aria-label="Match centre">
      <MatchLookup index={lookupIndex} matchId={matchId} playerId={who} onPick={pick} />
      {!view ? (
        <div className="rounded-2xl border bg-white p-8 text-center text-[13px] text-text-400" style={{ borderColor: BORDER }}>
          {file?.err ? file.err : file?.f && !file.f.players[who] ? "No ball-by-ball data for this player in this match. Pick a player chip above." : "Loading match…"}
        </div>
      ) : (
        <>
          <MatchHeader view={view} />
          <div className="rounded-2xl border bg-white p-3 sm:p-5" style={{ borderColor: BORDER }}>
            <div role="tablist" aria-label="Match views" className="mb-4 flex gap-1 overflow-x-auto border-b" style={{ borderColor: BORDER }}>
              {tabs.map((t) => (
                <button
                  key={t.v}
                  role="tab"
                  aria-selected={tab === t.v}
                  onClick={() => setTab(t.v)}
                  className={cx(
                    "-mb-px inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-[13px] font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3B6FB6]/50",
                    tab === t.v ? "border-[#C2507A] text-text-100" : "border-transparent text-text-400 hover:text-text-100",
                  )}
                >
                  {t.icon}
                  {t.label}
                </button>
              ))}
            </div>
            <div role="tabpanel">
              {tab === "story" && (
                <PressureStoryChart
                  view={view}
                  pinned={pinned}
                  onPick={(idx) => {
                    setPinned(idx);
                    setTab("overs");
                  }}
                />
              )}
              {tab === "overs" && <OverByOver view={view} pinned={pinned} />}
              {tab === "log" && <BallLog view={view} />}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
