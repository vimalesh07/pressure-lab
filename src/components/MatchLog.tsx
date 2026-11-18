"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ListOrdered, LoaderCircle, Medal, Swords, Target } from "lucide-react";
import { loadLog, loadMatch } from "@/lib/data";
import type { BestPerformance, Discipline, EvidenceDelivery, MatchFile, MatchLogRow, PlayerProfile } from "@/lib/types";
import { cx, fmtDate, signed } from "@/lib/format";
import { Card, CardHeader } from "@/components/ui/Card";
import { Segmented, Select } from "@/components/ui/Controls";
import { TeamChip } from "@/components/ui/TeamChip";
import { WpCurveCard, type CurveMark } from "@/components/charts/WpCurveCard";

const PAGE = 12;
const GOOD = "#2F7D5B";
const BAD = "#B8443A";

const overs = (balls: number) => `${Math.floor(balls / 6)}.${balls % 6}`;
const sr = (r: number, b: number) => (b ? ((100 * r) / b).toFixed(0) : "–");
const econ = (r: number, b: number) => (b ? ((6 * r) / b).toFixed(2) : "–");

function batLine(r: MatchLogRow) {
  const b = r.bat!;
  return `${b.runs}${b.out ? "" : "*"} (${b.balls})`;
}
function bowlLine(r: MatchLogRow) {
  const b = r.bowl!;
  return `${b.wkts}/${b.runs} (${overs(b.balls)})`;
}
function pLine(r: MatchLogRow, d: Discipline) {
  if (d === "batting" && r.bat) return r.bat.pBalls ? `${r.bat.pRuns}${r.bat.pOut ? "" : "*"} (${r.bat.pBalls})` : null;
  if (d === "bowling" && r.bowl) return r.bowl.pBalls ? `${r.bowl.pWkts}/${r.bowl.pRuns} (${overs(r.bowl.pBalls)})` : null;
  return null;
}

function scoreTone(s: number) {
  return s >= 70 ? "bg-success/10 text-success ring-success/25" : s >= 40 ? "bg-ink/[0.05] text-text-100 ring-ink/10" : "bg-danger/10 text-danger ring-danger/25";
}

function Result({ won }: { won: boolean | null }) {
  if (won === null) return <span className="rounded-full bg-ink/5 px-2 py-0.5 text-[11px] font-semibold text-text-400 ring-1 ring-ink/10">No result / tie</span>;
  return (
    <span className={cx("rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1", won ? "bg-success/10 text-success ring-success/25" : "bg-danger/10 text-danger ring-danger/25")}>
      {won ? "Won" : "Lost"}
    </span>
  );
}

/* ------------------------------------------------------------------ best performances */

function Bests({ bests, onOpen }: { bests: BestPerformance[]; onOpen: (matchId: string) => void }) {
  if (!bests.length) return null;
  return (
    <div className="mb-5 grid gap-3 sm:grid-cols-2">
      {bests.map((b) => (
        <button
          key={b.kind}
          onClick={() => onOpen(b.matchId)}
          className={cx(
            "group flex items-center gap-4 rounded-2xl p-4 text-left ring-1 transition hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300",
            b.kind === "pressure" ? "bg-pink-500/[0.06] ring-pink-500/20" : "bg-ink/[0.03] ring-ink/10",
          )}
        >
          <span
            className={cx(
              "grid h-11 w-11 shrink-0 place-items-center rounded-xl ring-1",
              b.kind === "pressure" ? "bg-pink-500/10 text-pink-500 ring-pink-500/25" : "bg-gold-400/10 text-gold-400 ring-gold-400/30",
            )}
          >
            <Medal size={18} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[10.5px] font-semibold uppercase tracking-[0.12em] text-text-400">{b.label}</span>
            <span className="tnum block font-display text-[24px] font-semibold leading-tight">{b.line}</span>
            <span className="block truncate text-[12px] text-text-400">
              vs {b.opponent} · {b.competition} · {fmtDate(b.date)}
            </span>
          </span>
          <span className="text-[12px] font-medium text-text-400 group-hover:text-pink-500">Inspect →</span>
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ expanded match */

function SplitTable({ r, discipline }: { r: MatchLogRow; discipline: Discipline }) {
  const sides: Discipline[] = r.bat && r.bowl ? (discipline === "batting" ? ["batting", "bowling"] : ["bowling", "batting"]) : r.bat ? ["batting"] : ["bowling"];
  return (
    <div className="space-y-3">
      {sides.map((side) =>
        side === "batting" && r.bat ? (
          <table key="bat" className="w-full text-[12.5px]">
            <thead className="text-[10.5px] uppercase tracking-[0.1em] text-text-400">
              <tr>
                <th className="py-1 text-left font-semibold">Batting</th>
                <th className="py-1 text-right font-semibold">Runs</th>
                <th className="py-1 text-right font-semibold">Balls</th>
                <th className="py-1 text-right font-semibold">SR</th>
                <th className="py-1 text-right font-semibold">Out</th>
              </tr>
            </thead>
            <tbody className="tnum">
              {[
                { k: "Overall", runs: r.bat.runs, balls: r.bat.balls, out: r.bat.out },
                { k: "Normal balls", runs: r.bat.runs - r.bat.pRuns, balls: r.bat.balls - r.bat.pBalls, out: r.bat.out && !r.bat.pOut },
                { k: "Pressure balls", runs: r.bat.pRuns, balls: r.bat.pBalls, out: r.bat.pOut },
              ].map((x) => (
                <tr key={x.k} className={cx("border-t border-ink/[0.06]", x.k === "Pressure balls" && "text-pink-500")}>
                  <td className="py-1.5 font-medium">{x.k}</td>
                  <td className="py-1.5 text-right font-semibold">{x.runs}</td>
                  <td className="py-1.5 text-right">{x.balls}</td>
                  <td className="py-1.5 text-right">{sr(x.runs, x.balls)}</td>
                  <td className="py-1.5 text-right">{x.out ? "yes" : "–"}</td>
                </tr>
              ))}
              <tr className="border-t border-ink/[0.06] text-text-400">
                <td colSpan={5} className="py-1.5">
                  {r.bat.fours} fours · {r.bat.sixes} sixes{r.bat.how ? ` · out: ${r.bat.how}` : " · not out"}
                </td>
              </tr>
            </tbody>
          </table>
        ) : side === "bowling" && r.bowl ? (
          <table key="bowl" className="w-full text-[12.5px]">
            <thead className="text-[10.5px] uppercase tracking-[0.1em] text-text-400">
              <tr>
                <th className="py-1 text-left font-semibold">Bowling</th>
                <th className="py-1 text-right font-semibold">Overs</th>
                <th className="py-1 text-right font-semibold">Runs</th>
                <th className="py-1 text-right font-semibold">Wkts</th>
                <th className="py-1 text-right font-semibold">Econ</th>
              </tr>
            </thead>
            <tbody className="tnum">
              {[
                { k: "Overall", balls: r.bowl.balls, runs: r.bowl.runs, wkts: r.bowl.wkts },
                { k: "Normal balls", balls: r.bowl.balls - r.bowl.pBalls, runs: r.bowl.runs - r.bowl.pRuns, wkts: r.bowl.wkts - r.bowl.pWkts },
                { k: "Pressure balls", balls: r.bowl.pBalls, runs: r.bowl.pRuns, wkts: r.bowl.pWkts },
              ].map((x) => (
                <tr key={x.k} className={cx("border-t border-ink/[0.06]", x.k === "Pressure balls" && "text-pink-500")}>
                  <td className="py-1.5 font-medium">{x.k}</td>
                  <td className="py-1.5 text-right">{overs(x.balls)}</td>
                  <td className="py-1.5 text-right">{x.runs}</td>
                  <td className="py-1.5 text-right font-semibold">{x.wkts}</td>
                  <td className="py-1.5 text-right">{econ(x.runs, x.balls)}</td>
                </tr>
              ))}
              <tr className="border-t border-ink/[0.06] text-text-400">
                <td colSpan={5} className="py-1.5">{r.bowl.dots} dot balls</td>
              </tr>
            </tbody>
          </table>
        ) : null,
      )}
    </div>
  );
}

function BallByBall({ r, playerId, name }: { r: MatchLogRow; playerId: string; name: string }) {
  const [file, setFile] = useState<MatchFile | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    loadMatch(r.matchId)
      .then((f) => alive && setFile(f))
      .catch((e: Error) => alive && setErr(e.message));
    return () => {
      alive = false;
    };
  }, [r.matchId]);
  if (err) return <div className="text-[12.5px] text-text-400">{err}</div>;
  if (!file)
    return (
      <div className="flex h-24 items-center gap-2 text-[12.5px] text-text-400">
        <LoaderCircle size={14} className="animate-spin" /> Loading ball-by-ball…
      </div>
    );
  const me = file.players[playerId];
  const glyph = (d: EvidenceDelivery) => (d.wicket ? "W" : d.runs ? String(d.runs) : "•");
  const marks: CurveMark[] = (me?.deliveries ?? [])
    .filter((d) => d.isPressure)
    .map((d) => ({
      idx: d.idx,
      glyph: glyph(d),
      color: d.wpa >= 0 ? GOOD : BAD,
      title: `Ov ${d.over} · ${d.outcome} ${me?.discipline === "bowling" ? "to" : "off"} ${d.opponent} · ${signed(d.wpa, 1)} pts`,
    }));
  return (
    <WpCurveCard
      match={{ ...file, balls: file.curve, performers: [] }}
      marks={marks}
      title={`${name}'s pressure balls in this match`}
      className="p-4! shadow-none"
      legend={
        <div className="hidden flex-wrap justify-end gap-x-4 gap-y-1 text-[12px] text-text-400 md:flex">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full" style={{ background: GOOD }} /> Added win prob.
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full" style={{ background: BAD }} /> Cost win prob.
          </span>
        </div>
      }
    />
  );
}

function Expanded({ r, p }: { r: MatchLogRow; p: PlayerProfile }) {
  const [showBalls, setShowBalls] = useState(false);
  return (
    <div className="rounded-2xl bg-bg-700/40 p-4 ring-1 ring-ink/[0.06]">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div>
          <div className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-text-400">Match</div>
          <div className="mt-1 text-[12.5px] text-text-400">
            {r.competition} · {r.stage} · {fmtDate(r.date)}
            {r.venue ? ` · ${r.venue}` : ""}
          </div>
          <div className="mt-3 space-y-1.5">
            {[
              { team: r.teamA, score: r.scoreA, inn: "1st innings" },
              { team: r.teamB, score: r.scoreB, inn: "2nd innings" },
            ].map((x) => (
              <div key={x.inn} className="flex items-baseline justify-between gap-3 rounded-xl bg-bg-800 px-3 py-2 ring-1 ring-ink/[0.06]">
                <span className="min-w-0">
                  <span className="block truncate text-[13.5px] font-semibold">{x.team}</span>
                  <span className="text-[11px] text-text-400">{x.inn}</span>
                </span>
                <span className="tnum font-display text-[18px] font-semibold">{x.score}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[12.5px]">
            <Result won={r.won} />
            <span className="text-text-400">{r.result}</span>
          </div>
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between">
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-text-400">{p.name}&apos;s performance</div>
            {r.pressureScore !== null && (
              <span className={cx("tnum rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1", scoreTone(r.pressureScore))}>
                Pressure score {r.pressureScore}
                {r.normalScore !== null ? ` · normal ${r.normalScore}` : ""}
              </span>
            )}
          </div>
          <SplitTable r={r} discipline={p.discipline} />
        </div>
      </div>
      <div className="mt-4">
        {r.hasDetail ? (
          showBalls ? (
            <BallByBall r={r} playerId={p.id} name={p.name} />
          ) : (
            <button
              onClick={() => setShowBalls(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-text-100 px-3.5 py-2 text-[12.5px] font-semibold text-bg-800 transition hover:-translate-y-px focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
            >
              Show ball-by-ball win probability
            </button>
          )
        ) : (
          <div className="text-[12px] text-text-400">Ball-by-ball replay is available for top-10 players&apos; matches, best innings and signature moments.</div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ main card */

export function MatchLog({ p, index }: { p: PlayerProfile; index?: number }) {
  const [rows, setRows] = useState<MatchLogRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [only, setOnly] = useState<"all" | "p">("all");
  const [season, setSeason] = useState("All");
  const [open, setOpen] = useState<string | null>(null);
  const [shown, setShown] = useState(PAGE);
  const listRef = useRef<HTMLDivElement>(null);
  const d = p.discipline;

  useEffect(() => {
    let alive = true;
    setRows(null);
    setErr(null);
    loadLog(p.id)
      .then((f) => alive && setRows(f.matches))
      .catch((e: Error) => alive && setErr(e.message));
    return () => {
      alive = false;
    };
  }, [p.id]);

  const seasons = useMemo(() => Array.from(new Set((rows ?? []).map((r) => r.date.slice(0, 4)))).sort().reverse(), [rows]);
  const filtered = useMemo(
    () =>
      (rows ?? []).filter((r) => {
        if (season !== "All" && !r.date.startsWith(season)) return false;
        if (only === "p") return d === "batting" ? (r.bat?.pBalls ?? 0) > 0 : (r.bowl?.pBalls ?? 0) > 0;
        return true;
      }),
    [rows, season, only, d],
  );

  const openMatch = (id: string) => {
    setOnly("all");
    setSeason("All");
    const i = (rows ?? []).findIndex((r) => r.matchId === id);
    if (i >= shown) setShown(i + 1);
    setOpen(id);
    requestAnimationFrame(() => {
      listRef.current?.querySelector(`[data-match="${id}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  };

  return (
    <Card index={index} className="p-5">
      <CardHeader
        icon={<ListOrdered size={16} />}
        title="Match log"
        subtitle="Every match in 2022–2026: the match score, the result and the player's line, with the part played on pressure balls. Click a match to inspect it."
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Segmented
          label="Matches"
          size="sm"
          value={only}
          onChange={(v) => {
            setOnly(v);
            setShown(PAGE);
          }}
          options={[
            { value: "all", label: "All" },
            { value: "p", label: "With pressure balls" },
          ]}
        />
        {seasons.length > 1 && (
          <Select
            label="Season"
            hideLabel
            value={season}
            options={[{ value: "All", label: "All seasons" }, ...seasons.map((s) => ({ value: s, label: s }))]}
            onChange={(v) => {
              setSeason(v);
              setShown(PAGE);
            }}
          />
        )}
      </div>

      <Bests bests={p.bests ?? []} onOpen={openMatch} />

      {err ? (
        <div className="py-8 text-center text-[13px] text-text-400">{err}</div>
      ) : !rows ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl bg-ink/[0.04]" />
          ))}
        </div>
      ) : (
        <div ref={listRef}>
          <div className="hidden grid-cols-[92px_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_20px] gap-x-4 px-3 pb-2 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-text-400 md:grid">
            <span>Date</span>
            <span>Match</span>
            <span>Score</span>
            <span>{d === "batting" ? "Innings" : "Figures"}</span>
            <span>Under pressure</span>
            <span />
          </div>
          <div className="space-y-1.5">
            {filtered.slice(0, shown).map((r) => {
              const isOpen = open === r.matchId;
              const main = d === "batting" ? (r.bat ? batLine(r) : r.bowl ? bowlLine(r) : "–") : r.bowl ? bowlLine(r) : r.bat ? batLine(r) : "–";
              const second = d === "batting" ? (r.bowl ? bowlLine(r) : null) : r.bat ? batLine(r) : null;
              const pl = pLine(r, d);
              return (
                <div key={r.matchId} data-match={r.matchId} className={cx("rounded-xl ring-1 transition", isOpen ? "bg-bg-800 ring-pink-500/30" : "ring-ink/[0.06] hover:bg-ink/[0.02]")}>
                  <button
                    onClick={() => setOpen(isOpen ? null : r.matchId)}
                    aria-expanded={isOpen}
                    className="grid w-full grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 px-3 py-2.5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 md:grid-cols-[92px_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_20px]"
                  >
                    <span className="tnum text-[12px] text-text-400 md:order-none">{fmtDate(r.date)}</span>
                    <span className="col-span-2 flex min-w-0 items-center gap-2 md:col-span-1">
                      <TeamChip code={r.team} />
                      <span className="text-[12px] text-text-400">vs</span>
                      <TeamChip code={r.opponent} />
                      <Result won={r.won} />
                    </span>
                    <span className="tnum truncate text-[12.5px] text-text-400" title={`${r.teamA} ${r.scoreA} · ${r.teamB} ${r.scoreB}`}>
                      {r.scoreA.split(" ")[0]} · {r.scoreB.split(" ")[0]}
                    </span>
                    <span className="tnum text-[13.5px] font-semibold">
                      {main}
                      {second && <span className="ml-2 text-[11.5px] font-medium text-text-400">{second}</span>}
                    </span>
                    <span className="flex items-center gap-2">
                      {pl ? (
                        <>
                          <span className="tnum text-[13px] font-semibold text-pink-500">{pl}</span>
                          {r.pressureScore !== null && (
                            <span className={cx("tnum rounded-full px-1.5 py-0.5 text-[10.5px] font-semibold ring-1", scoreTone(r.pressureScore))}>{r.pressureScore}</span>
                          )}
                        </>
                      ) : (
                        <span className="text-[12px] text-text-400">no pressure balls</span>
                      )}
                    </span>
                    <ChevronDown size={16} className={cx("hidden text-text-400 transition-transform md:block", isOpen && "rotate-180")} />
                  </button>
                  {isOpen && (
                    <div className="px-3 pb-3">
                      <Expanded r={r} p={p} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {filtered.length === 0 && <div className="py-6 text-center text-[13px] text-text-400">No matches for this filter.</div>}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[12px] text-text-400">
            <span className="inline-flex items-center gap-1.5">
              {d === "batting" ? <Swords size={13} /> : <Target size={13} />}
              {filtered.length} matches · pressure score = 0–100 vs every player-match (green ≥ 70, red &lt; 40)
            </span>
            {shown < filtered.length && (
              <button onClick={() => setShown((s) => s + PAGE)} className="whitespace-nowrap rounded-lg px-3 py-1.5 font-semibold text-text-100 ring-1 ring-ink/10 hover:bg-ink/[0.04]">
                Show {Math.min(PAGE, filtered.length - shown)} more
              </button>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
