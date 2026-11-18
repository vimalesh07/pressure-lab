"use client";

import { cx, fmtDate } from "@/lib/format";
import { kitFor } from "@/lib/teams";
import { BORDER, oversText, sideStats, signed1, type MatchView } from "./model";

function Tile({ k, v, s, tone }: { k: string; v: string; s?: string; tone?: string }) {
  return (
    <div className="rounded-2xl border bg-white px-3.5 py-3" style={{ borderColor: BORDER }}>
      <div className={cx("tnum font-display text-[26px] font-semibold leading-none", tone)}>{v}</div>
      <div className="mt-1.5 text-[11.5px] font-medium text-text-400">{k}</div>
      {s && <div className="tnum text-[11px] text-text-400">{s}</div>}
    </div>
  );
}

/** Scoreboard card: two team rows (winner bold + WON), result line, and the player's strip with three stat tiles. */
export function MatchHeader({ view }: { view: MatchView }) {
  const pl = view.player;
  const bat = sideStats(pl.deliveries, "bat");
  const bowl = sideStats(pl.deliveries, "bowl");
  const primary: "bat" | "bowl" = pl.role === "Bowler" ? "bowl" : pl.role === "Batter" ? "bat" : bat.n >= bowl.n ? "bat" : "bowl";
  const initials = pl.name.split(" ").map((w) => w[0]).join("").slice(0, 2);
  const rows = [
    { code: view.teamACode, name: view.teamA, score: view.scoreA, won: view.winner === "A", inn: "1st inn" },
    { code: view.teamBCode, name: view.teamB, score: view.scoreB, won: view.winner === "B", inn: "2nd inn" },
  ];

  const s = primary === "bat" ? bat : bowl;
  const strikeRate = bat.balls ? ((100 * bat.runs) / bat.balls).toFixed(1) : "–";
  const econ = bowl.balls ? ((6 * bowl.runs) / bowl.balls).toFixed(2) : "–";
  const pRate =
    primary === "bat"
      ? s.pLegal ? ((100 * s.pRuns) / s.pLegal).toFixed(1) : "–"
      : s.pLegal ? ((6 * s.pRuns) / s.pLegal).toFixed(2) : "–";

  return (
    <div className="overflow-hidden rounded-2xl border bg-white" style={{ borderColor: BORDER }}>
      {/* scoreboard */}
      <div className="px-4 pt-4 sm:px-5">
        <div className="mb-2 flex flex-wrap items-center gap-x-2 text-[11.5px] font-medium uppercase tracking-[0.1em] text-text-400">
          <span>{view.competition}</span>
          {view.matchNumber ? <span>· M{view.matchNumber}</span> : null}
          <span>· {view.stage}</span>
        </div>
        <div className="divide-y divide-[#F0E7D8]">
          {rows.map((r) => (
            <div key={r.inn} className="flex items-center gap-3 py-2">
              <span className="h-3 w-3 shrink-0 rounded-full ring-2 ring-white" style={{ background: kitFor(r.code), boxShadow: `0 0 0 1px ${BORDER}` }} aria-hidden />
              <span className={cx("w-12 font-display text-[16px] tracking-tight", r.won ? "font-bold text-text-100" : "font-medium text-text-400")}>{r.code}</span>
              <span className={cx("min-w-0 flex-1 truncate text-[13px]", r.won ? "text-text-100" : "text-text-400")}>
                {r.name}
                <span className="ml-2 text-[11px] text-text-400">{r.inn}</span>
              </span>
              {r.won && <span className="rounded-md bg-[#2F7D5B]/10 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-[#2F7D5B]">WON</span>}
              <span className={cx("tnum font-display text-[20px]", r.won ? "font-bold" : "font-medium text-text-400")}>{r.score}</span>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-[#F0E7D8] py-2.5">
          <span className="text-[13.5px] font-semibold">{view.result}</span>
          <span className="text-[12px] text-text-400">
            {view.venue ? `${view.venue} · ` : ""}
            {fmtDate(view.date)}
          </span>
        </div>
      </div>

      {/* player strip */}
      <div className="border-t bg-[#FBF6EE] px-4 py-4 sm:px-5" style={{ borderColor: BORDER }}>
        <div className="grid items-center gap-x-6 gap-y-4 lg:grid-cols-[minmax(220px,auto)_minmax(0,1fr)]">
          <div className="flex min-w-0 items-center gap-3">
            <span
              className="grid h-12 w-12 shrink-0 place-items-center rounded-full font-display text-[16px] font-bold text-white"
              style={{ background: kitFor(pl.team) }}
              aria-hidden
            >
              {initials}
            </span>
            <div className="min-w-0">
              <div className="truncate font-display text-[18px] font-semibold leading-tight">{pl.name}</div>
              <div className="text-[12px] text-text-400">
                {pl.role} · {pl.team}
              </div>
              <div className="tnum mt-0.5 text-[13px]">
                <span className="font-semibold">{pl.line}</span>
                {primary === "bat" ? (
                  <span className="text-text-400">
                    {" "}· SR {strikeRate} · {bat.fours}×4 {bat.sixes}×6
                  </span>
                ) : (
                  <span className="text-text-400">
                    {" "}· Econ {econ} · {bowl.dots} dots
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Tile k={primary === "bat" ? "Runs (balls)" : "Figures"} v={primary === "bat" ? `${bat.runs} (${bat.balls})` : `${bowl.wkts}/${bowl.runs}`} s={primary === "bat" ? undefined : `${oversText(bowl.balls)} overs`} />
            <Tile k={primary === "bat" ? "Pressure balls faced" : "Pressure balls bowled"} v={String(s.pBalls)} s={`of ${s.n} he was involved in`} />
            <Tile k={primary === "bat" ? "Pressure SR" : "Pressure economy"} v={pRate} s={primary === "bat" ? `${s.pRuns} off ${s.pLegal}` : `${s.pWkts} wkt${s.pWkts === 1 ? "" : "s"} · ${s.pRuns} runs`} />
            <Tile k="Match WPA" v={signed1(pl.matchWpa)} s={`pressure balls ${signed1(pl.pressureWpa)}`} tone={pl.matchWpa >= 0 ? "text-[#2F7D5B]" : "text-[#C0453B]"} />
          </div>
        </div>
      </div>
    </div>
  );
}
