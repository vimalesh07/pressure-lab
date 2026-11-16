"use client";

/**
 * Consistency strip: every pressure innings per season, scored 0–100 vs expected (50 = as expected).
 *
 *  · zone-banded tracks (Missed < 40 · Par 40–69 · Delivered ≥ 70), dashed 40 / 70, stronger 50 "expected"
 *  · beeswarm stacking: markers closer than 12px move to the next lane (0, −1, +1, −2, +2 …)
 *  · per-season median tick + "med 61" pill, so the year-on-year drift is visible
 *  · right column: Delivered / Par / Missed mini bar + "3 of 5 delivered" (badge on phones)
 *  · header insight + one inline stat row; a visually hidden table mirrors the chart
 *
 * Props are unchanged: { seasons: ConsistencySeason[]; index?: number; className?: string }.
 * Optional extra fields per innings (used when present): `runs`, `opponent`.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import type { ConsistencySeason, PressureInnings } from "@/lib/types";
import { cx } from "@/lib/format";
import { Card } from "@/components/ui/Card";
import { useReducedMotion } from "./useReducedMotion";

/* ------------------------------------------------------------------ tokens */

const C = {
  card: "#FFF8EC",
  border: "rgba(120,90,60,0.12)",
  ink: "#2B2118",
  muted: "#75655A",
  rose: "#C2185B",
  blue: "#254AA5",
};

type Outcome = "Delivered" | "Par" | "Missed";
const OUTCOME: Record<Outcome, { color: string; tint: string; range: string }> = {
  Missed: { color: "#D2453B", tint: "rgba(210,69,59,0.06)", range: "< 40" },
  Par: { color: "#7A5FC4", tint: "rgba(122,95,196,0.06)", range: "40–69" },
  Delivered: { color: "#1F8A5B", tint: "rgba(31,138,91,0.08)", range: "≥ 70" },
};
const outcomeOf = (s: number): Outcome => (s >= 70 ? "Delivered" : s >= 40 ? "Par" : "Missed");

/** Geometry (px). */
const MARKER = 12; // marker box
const GAP = 12; // closer than this horizontally -> stack
const LANE = 14; // vertical lane step (marker + ring)
const ZONE_MIN = 44; // marker zone height
const STRIP = 16; // median pill strip above the marker zone
const PAD_X = 8; // keep edge markers inside the track

/* ------------------------------------------------------------------ sample data (preview / tests) */

type Innings = PressureInnings & { runs?: number; opponent?: string };

export const SAMPLE_SEASONS: ConsistencySeason[] = [
  { season: "2023", innings: [
    { matchId: "s1", label: "vs MI · 02 Apr", score: 88, balls: 9, runs: 21 },
    { matchId: "s2", label: "vs CSK · 12 Apr", score: 86, balls: 7, runs: 16 },
    { matchId: "s3", label: "vs GT · 23 Apr", score: 55, balls: 8, runs: 11 },
    { matchId: "s4", label: "vs KKR · 05 May", score: 54, balls: 6, runs: 8 },
    { matchId: "s5", label: "vs DC · 19 May", score: 91, balls: 12, runs: 29 },
  ] as Innings[] },
  { season: "2024", innings: [
    { matchId: "s6", label: "vs SRH · 30 Mar", score: 72, balls: 10, runs: 19 },
    { matchId: "s7", label: "vs MI · 14 Apr", score: 22, balls: 6, runs: 3 },
    { matchId: "s8", label: "vs PBKS · 27 Apr", score: 48, balls: 8, runs: 10 },
    { matchId: "s9", label: "vs LSG · 08 May", score: 61, balls: 7, runs: 11 },
    { matchId: "s10", label: "vs RCB · 22 May", score: 35, balls: 5, runs: 4 },
  ] as Innings[] },
  { season: "2025", innings: [
    { matchId: "s11", label: "vs GT · 28 Apr", score: 74, balls: 9, runs: 18 },
    { matchId: "s12", label: "vs CSK · 03 May", score: 79, balls: 11, runs: 24 },
    { matchId: "s13", label: "vs KKR · 09 May", score: 52, balls: 8, runs: 10 },
    { matchId: "s14", label: "vs PBKS · 18 May", score: 38, balls: 6, runs: 5 },
    { matchId: "s15", label: "vs MI · 20 May", score: 44, balls: 7, runs: 8 },
  ] as Innings[] },
  { season: "2026", innings: [
    { matchId: "s16", label: "vs DC · 04 Apr", score: 30, balls: 8, runs: 6 },
    { matchId: "s17", label: "vs SRH · 11 Apr", score: 31, balls: 6, runs: 5 },
    { matchId: "s18", label: "vs RCB · 19 Apr", score: 29, balls: 9, runs: 7 },
    { matchId: "s19", label: "vs LSG · 26 Apr", score: 58, balls: 7, runs: 11 },
    { matchId: "s20", label: "vs GT · 03 May", score: 46, balls: 10, runs: 13 },
    { matchId: "s21", label: "vs MI · 17 May", score: 62, balls: 8, runs: 14 },
  ] as Innings[] },
];

/* ------------------------------------------------------------------ helpers */

function median(v: number[]) {
  if (!v.length) return 0;
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

function parseLabel(inn: Innings) {
  const [head, date] = inn.label.split("·").map((x) => x.trim());
  const opponent = inn.opponent ?? head.replace(/^vs\s+/i, "");
  return { opponent, date: date ?? "" };
}

/** Beeswarm lanes: walk markers left to right, give each the first lane (0, −1, +1, −2, +2 …)
 *  with no marker within GAP px. Returns lane per input index. */
function swarm(xs: number[]) {
  const order = xs.map((x, i) => [x, i] as const).sort((a, b) => a[0] - b[0]);
  const placed: { x: number; lane: number }[] = [];
  const lanes = new Array<number>(xs.length).fill(0);
  for (const [x, i] of order) {
    for (let k = 0; ; k++) {
      const lane = k === 0 ? 0 : k % 2 ? -(k + 1) / 2 : k / 2;
      if (placed.every((p) => p.lane !== lane || Math.abs(p.x - x) >= GAP)) {
        placed.push({ x, lane });
        lanes[i] = lane;
        break;
      }
    }
  }
  return lanes;
}

function Marker({ outcome, size = MARKER }: { outcome: Outcome; size?: number }) {
  const color = OUTCOME[outcome].color;
  const ring = `0 0 0 2px ${C.card}`;
  if (outcome === "Missed") {
    const d = Math.round(size * 0.74); // rotated square whose diagonal ≈ size
    return <span className="block" style={{ width: d, height: d, background: color, transform: "rotate(45deg)", borderRadius: 2, boxShadow: ring }} />;
  }
  return (
    <span className="block" style={{ width: size, height: size, background: color, borderRadius: outcome === "Delivered" ? 999 : 3, boxShadow: ring }} />
  );
}

/* ------------------------------------------------------------------ pieces */

function MiniBar({ d, p, m }: { d: number; p: number; m: number }) {
  const n = d + p + m;
  const segs: [Outcome, number][] = [["Delivered", d], ["Par", p], ["Missed", m]];
  return (
    <span className="flex h-2 w-[80px] shrink-0 gap-[2px] overflow-hidden rounded-full" aria-hidden>
      {n === 0 ? <span className="h-full w-full rounded-full bg-ink/[0.06]" /> :
        segs.filter(([, v]) => v > 0).map(([o, v]) => (
          <span key={o} className="h-full first:rounded-l-full last:rounded-r-full" style={{ width: `${(v / n) * 100}%`, background: OUTCOME[o].color }} />
        ))}
    </span>
  );
}

function OutcomeChip({ o }: { o: Outcome }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold"
      style={{ background: OUTCOME[o].tint.replace(/0\.0\d\)$/, "0.14)"), color: C.ink }}>
      <Marker outcome={o} size={8} />
      {o}
    </span>
  );
}

/* ------------------------------------------------------------------ main */

export function ConsistencyStrip({ seasons, index, className }: { seasons: ConsistencySeason[]; index?: number; className?: string }) {
  const reduce = useReducedMotion();
  const trackRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [entered, setEntered] = useState(false);
  const [hover, setHover] = useState<{ row: number; key: string } | null>(null);

  // measure the track width (all tracks share it)
  useLayoutEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    setWidth(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);

  // entrance: markers start at x = 50 and slide out once positions are known
  useEffect(() => {
    if (!width || entered) return;
    if (reduce) { setEntered(true); return; }
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setEntered(true)));
    return () => cancelAnimationFrame(id);
  }, [width, reduce, entered]);

  const x = (score: number) => PAD_X + (Math.max(0, Math.min(100, score)) / 100) * Math.max(0, width - 2 * PAD_X);

  const rows = useMemo(() => seasons.map((s) => {
    const inn = s.innings as Innings[];
    const counts = { d: 0, p: 0, m: 0 };
    inn.forEach((i) => { const o = outcomeOf(i.score); if (o === "Delivered") counts.d++; else if (o === "Par") counts.p++; else counts.m++; });
    return { season: s.season, innings: inn, counts, med: median(inn.map((i) => i.score)) };
  }), [seasons]);

  const layout = useMemo(() => rows.map((r) => {
    const xs = r.innings.map((i) => x(i.score));
    const lanes = width ? swarm(xs) : xs.map(() => 0);
    const maxLane = lanes.reduce((a, l) => Math.max(a, Math.abs(l)), 0);
    const zone = Math.max(ZONE_MIN, (2 * maxLane + 1) * LANE + 16);
    return { xs, lanes, zone };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [rows, width]);

  const all = rows.flatMap((r) => r.innings);
  const total = all.length;
  const delivered = rows.reduce((a, r) => a + r.counts.d, 0);
  const missed = rows.reduce((a, r) => a + r.counts.m, 0);
  const pct = total ? Math.round((delivered / total) * 100) : 0;
  const med = median(all.map((i) => i.score));

  // trend: latest season's delivered rate vs the first season's (seasons with innings only)
  const withData = rows.filter((r) => r.innings.length);
  const first = withData[0];
  const last = withData[withData.length - 1];
  const rate = (r: (typeof rows)[number]) => r.counts.d / r.innings.length;
  const trend = first && last && first !== last ? Math.sign(rate(last) - rate(first)) : 0;

  // 20ms stagger, compressed for dense players so the whole entrance stays under ~0.6s
  let stagger = 0;
  const staggerStep = Math.min(20, 600 / Math.max(1, total));

  return (
    <Card index={index} className={cx("p-6", className)} style={{ borderColor: C.border }}>
      {/* ---------- header */}
      <div className="mb-5">
        <h3 className="font-display text-[15px] font-semibold tracking-tight" style={{ color: C.ink }}>Consistency strip</h3>
        <p className="tnum mt-1 flex flex-wrap items-center gap-1 text-[12.5px]" style={{ color: C.muted }}>
          {total === 0 ? "No pressure innings yet" : (
            <>
              Delivered in <b className="font-semibold" style={{ color: C.ink }}>{delivered}</b> of <b className="font-semibold" style={{ color: C.ink }}>{total}</b>
              {trend !== 0 && first && (
                <>
                  <span className="inline-flex items-center gap-1 whitespace-nowrap">
                    <span aria-hidden className="mr-0.5">·</span>
                    {trend < 0
                      ? <ArrowDownRight size={14} strokeWidth={2.5} style={{ color: C.rose }} aria-hidden />
                      : <ArrowUpRight size={14} strokeWidth={2.5} style={{ color: OUTCOME.Delivered.color }} aria-hidden />}
                    trending {trend < 0 ? "down" : "up"} since {first.season}
                  </span>
                </>
              )}
            </>
          )}
        </p>
      </div>

      {/* ---------- chart (visual) */}
      <div>
        {/* band names, aligned to the band starts of the tracks */}
        <div className="grid grid-cols-[56px_minmax(0,1fr)] gap-x-3 sm:grid-cols-[56px_minmax(0,1fr)_150px]">
          <span />
          <div className="relative h-4" aria-hidden>
            {(["Missed", "Par", "Delivered"] as Outcome[]).map((o) => {
              const start = o === "Missed" ? 0 : o === "Par" ? 40 : 70;
              return (
                <span key={o} className="absolute top-0 text-[10px] font-semibold uppercase leading-none tracking-[0.08em]"
                  style={{ left: width ? x(start) - (start === 0 ? PAD_X : 0) + 4 : `${start}%`, color: OUTCOME[o].color }}>
                  {o}
                </span>
              );
            })}
          </div>
        </div>

        <div className="mt-1 space-y-[10px]">
          {rows.map((r, ri) => {
            const L = layout[ri];
            const n = r.innings.length;
            const rowHot = hover?.row === ri;
            const zero = n > 0 && r.counts.d === 0;
            return (
              <div key={r.season}
                className="grid grid-cols-[56px_minmax(0,1fr)] items-center gap-x-3 rounded-xl transition-colors sm:grid-cols-[56px_minmax(0,1fr)_150px]"
                style={{ background: rowHot ? "rgba(37,74,165,0.045)" : undefined }}>
                {/* season label (+ badge on phones) */}
                <div className="flex flex-col items-start gap-1 pl-1">
                  <span className="tnum text-[13px] font-bold" style={{ color: C.ink }}>{r.season}</span>
                  <span className="tnum rounded-md px-1.5 py-[1px] text-[10.5px] font-semibold sm:hidden"
                    style={{ background: zero ? "rgba(210,69,59,0.12)" : "rgba(120,90,60,0.08)", color: zero ? OUTCOME.Missed.color : C.ink }}>
                    {r.counts.d}/{n}
                  </span>
                </div>

                {/* track */}
                <div ref={ri === 0 ? trackRef : undefined} className="relative" style={{ height: STRIP + L.zone }}>
                  <div className="absolute inset-x-0 bottom-0 overflow-hidden rounded-lg" style={{ top: STRIP, boxShadow: `inset 0 0 0 1px ${C.border}` }} aria-hidden>
                    {width > 0 && (
                      <>
                        <div className="absolute inset-y-0" style={{ left: 0, width: x(40), background: OUTCOME.Missed.tint }} />
                        <div className="absolute inset-y-0" style={{ left: x(40), width: x(70) - x(40), background: OUTCOME.Par.tint }} />
                        <div className="absolute inset-y-0" style={{ left: x(70), right: 0, background: OUTCOME.Delivered.tint }} />
                        {[40, 70].map((v) => (
                          <div key={v} className="absolute inset-y-0 w-0 border-l border-dashed" style={{ left: x(v), borderColor: "rgba(120,90,60,0.28)" }} />
                        ))}
                        <div className="absolute inset-y-0 w-px" style={{ left: x(50) - 0.5, background: "rgba(43,33,24,0.32)" }} />
                      </>
                    )}
                  </div>

                  {/* median tick + pill */}
                  {n > 0 && width > 0 && (
                    <>
                      <span className="tnum absolute top-0 -translate-x-1/2 whitespace-nowrap rounded-full px-1.5 text-[10px] font-semibold leading-[14px]"
                        style={{ left: x(r.med), background: C.ink, color: C.card }}>
                        med {r.med}
                      </span>
                      {/* drawn above the markers (z 20) with a card-colour outline so it stays visible on top of one */}
                      <span className="pointer-events-none absolute -translate-x-1/2" aria-hidden
                        style={{ left: x(r.med), top: STRIP + L.zone / 2 - 10, width: 2, height: 20, background: C.ink, borderRadius: 1,
                          zIndex: 20, boxShadow: `0 0 0 1px ${C.card}` }} />
                    </>
                  )}

                  {/* markers */}
                  {width > 0 && r.innings.map((inn, i) => {
                    const o = outcomeOf(inn.score);
                    const key = `${r.season}-${inn.matchId}-${i}`;
                    const px = L.xs[i];
                    const py = STRIP + L.zone / 2 + L.lanes[i] * LANE;
                    const { opponent, date } = parseLabel(inn);
                    const hot = hover?.key === key;
                    const delay = Math.round(stagger++ * staggerStep);
                    const dx = x(50) - px;
                    const tipAlign = px < 110 ? "left" : px > width - 110 ? "right" : "center";
                    return (
                      <button key={key} type="button"
                        className="absolute grid h-6 w-6 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full focus:outline-none focus-visible:ring-2"
                        style={{
                          left: px, top: py, zIndex: hot ? 30 : 10,
                          ["--tw-ring-color" as string]: C.blue,
                        }}
                        aria-label={`${r.season}, vs ${opponent}, score ${inn.score}, ${o.toLowerCase()}`}
                        onMouseEnter={() => setHover({ row: ri, key })}
                        onMouseLeave={() => setHover(null)}
                        onFocus={() => setHover({ row: ri, key })}
                        onBlur={() => setHover(null)}>
                        <span className="block" style={{
                          transform: entered ? "translate(0,0)" : `translate(${dx}px, ${-L.lanes[i] * LANE}px)`,
                          opacity: entered ? 1 : 0,
                          transition: reduce ? "none" : `transform 620ms cubic-bezier(.2,.8,.2,1) ${delay}ms, opacity 240ms ease ${delay}ms`,
                          scale: hot ? "1.25" : "1",
                        }}>
                          <Marker outcome={o} />
                        </span>

                        {hot && (
                          <span role="tooltip" className={cx("pointer-events-none absolute bottom-full mb-2 w-max min-w-[180px] rounded-xl border px-3 py-2 text-left text-[12px] shadow-[0_12px_30px_-12px_rgba(60,40,20,0.35)]",
                            tipAlign === "left" ? "left-0" : tipAlign === "right" ? "right-0" : "left-1/2 -translate-x-1/2")}
                            style={{ background: C.card, borderColor: C.border, color: C.muted }}>
                            <span className="block font-display text-[12.5px] font-semibold" style={{ color: C.ink }}>
                              {inn.label}{date ? ` ${r.season}` : ""}
                            </span>
                            <span className="tnum mt-1 flex justify-between gap-4"><span>Opponent</span><b className="font-semibold" style={{ color: C.ink }}>{opponent}</b></span>
                            <span className="tnum flex justify-between gap-4">
                              <span>{inn.runs !== undefined ? "Runs (balls)" : "Pressure balls"}</span>
                              <b className="font-semibold" style={{ color: C.ink }}>{inn.runs !== undefined ? `${inn.runs} (${inn.balls})` : inn.balls}</b>
                            </span>
                            <span className="tnum flex justify-between gap-4"><span>Score</span><b className="font-semibold" style={{ color: C.ink }}>{inn.score}/100</b></span>
                            <span className="mt-1.5 block"><OutcomeChip o={o} /></span>
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* right summary (≥ 640px) */}
                <div className="hidden items-center gap-2.5 pr-1 sm:flex">
                  <MiniBar d={r.counts.d} p={r.counts.p} m={r.counts.m} />
                  <span className="tnum text-[12px] leading-tight" style={{ color: zero ? OUTCOME.Missed.color : C.muted }}>
                    <b className="font-semibold" style={{ color: zero ? OUTCOME.Missed.color : C.ink }}>{r.counts.d}</b> of {n} delivered
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* axis ticks, once, under the last row */}
        <div className="mt-1.5 grid grid-cols-[56px_minmax(0,1fr)] gap-x-3 sm:grid-cols-[56px_minmax(0,1fr)_150px]" aria-hidden>
          <span />
          <div className="tnum relative h-7 text-[10.5px]" style={{ color: C.muted }}>
            {width > 0 && [0, 40, 50, 70, 100].map((v) => (
              <span key={v} className="absolute top-0 flex -translate-x-1/2 flex-col items-center leading-tight"
                style={{ left: x(v), color: v === 50 ? C.ink : undefined, fontWeight: v === 50 ? 600 : undefined }}>
                {v}
                {v === 50 && <span className="text-[9.5px] font-medium" style={{ color: C.muted }}>expected</span>}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ---------- inline stat row */}
      {total > 0 && (
        <p className="tnum mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 border-t pt-3 text-[12.5px]" style={{ borderColor: C.border, color: C.muted }}>
          <span><b className="font-semibold" style={{ color: C.ink }}>{pct}%</b> delivered</span>
          <span aria-hidden>·</span>
          <span>median <b className="font-semibold" style={{ color: C.ink }}>{med}</b></span>
          <span aria-hidden>·</span>
          <span><b className="font-semibold" style={{ color: C.ink }}>{missed}</b> missed</span>
        </p>
      )}

      {/* ---------- screen-reader table */}
      {/* sr-only on a wrapper: a <table> ignores width:1px and would widen the page */}
      <div className="sr-only">
      <table>
        <caption>Pressure innings by season. Score 0–100, 50 = as expected; delivered ≥ 70, par 40–69, missed below 40.</caption>
        <thead><tr><th scope="col">Season</th><th scope="col">Match</th><th scope="col">Score</th><th scope="col">Outcome</th><th scope="col">Pressure balls</th></tr></thead>
        <tbody>
          {rows.flatMap((r) => [
            ...r.innings.map((inn, i) => (
              <tr key={`${r.season}-${i}`}><th scope="row">{r.season}</th><td>{inn.label}</td><td>{inn.score}</td><td>{outcomeOf(inn.score)}</td><td>{inn.balls}</td></tr>
            )),
            <tr key={`${r.season}-sum`}><th scope="row">{r.season}</th><td>Season summary</td><td>median {r.med}</td><td>{r.counts.d} of {r.innings.length} delivered</td><td /></tr>,
          ])}
        </tbody>
      </table>
      </div>
    </Card>
  );
}
