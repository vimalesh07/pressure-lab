"use client";

import type { ReactNode } from "react";
import { BrainCircuit, GitBranch, ListChecks, Medal, Split, Target } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/Card";
import { flowSvg } from "@/lib/exportCharts";

/** Written specification of the model, kept in step with config.yaml and the latest run log. */
const STEPS: { t: string; body: ReactNode }[] = [
  {
    t: "Data and scope",
    body: (
      <>
        Every legal and illegal delivery of IPL 2022–2026 and men&apos;s T20 internationals (≈194,000 balls, 837 matches) from the
        provided ball-by-ball files. Two A-team cups (Emerging Asia Cup 2024, Rising Stars 2025) are removed from all player
        numbers. Every match is tagged by competition: <b>IPL</b> or <b>T20I</b>.
      </>
    ),
  },
  {
    t: "Win-probability model (ML)",
    body: (
      <>
        For every ball, the chance that the batting side wins. Two candidates are trained on seasons ≤ 2023, calibrated on 2024
        and tested untouched on 2025–26: a <b>logistic regression</b> with resource interactions and a <b>LightGBM</b> gradient-boosted
        model. Features: projected total (from a separate par-score model) in innings 1; runs needed, balls left, wickets and
        required rate in the chase; IPL flag and Impact-Player-era flag. First-innings scores get <b>isotonic calibration</b>. For the
        last 12 balls of a chase an <b>exact dynamic-programming</b> model replaces the ML score (blended in over balls 13–24).
        Logistic regression won on the 2024 validation Brier score and is used (test AUC 0.79, Brier 0.188); the final model is
        refit on all seasons.
      </>
    ),
  },
  {
    t: "Leverage and match stakes",
    body: (
      <>
        <b>Leverage</b> = the expected size of the win-probability swing on that ball (outcome probabilities from similar match
        states × the swing each outcome would cause), capped at the 99th percentile. <b>Stakes</b> multiply it for knockouts
        (×1.4, finals ×1.1 more), must-win games, series deciders, dead rubbers (×0.85), NRR races and favourites under threat,
        capped to 0.8–1.8.
      </>
    ),
  },
  {
    t: "Pressure balls",
    body: (
      <>
        Pressure weight = leverage × stakes, computed separately for the batting side and the bowling side. A <b>pressure ball</b>{" "}
        is in the <b>top 20%</b> of that side&apos;s weights (37,304 batting-side and 38,827 bowling-side balls). Inside the metrics,
        each pressure ball counts log(1 + weight), so one huge ball cannot dominate.
      </>
    ),
  },
  {
    t: "Expected runs and wickets (analytics)",
    body: (
      <>
        For each ball, what an average player would score or concede in that exact state (format, innings, over, wickets,
        required-rate band), adjusted for the <b>opponent</b> with a Poisson GLM: the bowler&apos;s or batter&apos;s threat tier
        (Elite / Strong / Normal) and the opposing team&apos;s Elo. A wicket is priced in runs from the match state.
        Performance = actual − expected: runs above expected, dismissals above expected, net runs, and win probability added (WPA).
      </>
    ),
  },
  {
    t: "Shrinkage, priors and recency",
    body: (
      <>
        Every component is <b>empirical-Bayes shrunk</b>: a small sample is pulled toward a prior, a large one keeps its own value.
        For batters the prior is the player&apos;s <b>own normal-ball skill</b> (pressure skill is mostly overall skill, the
        pressure-specific part is small). <b>Recency</b>: a ball&apos;s weight halves every 2 seasons back for batters, every season
        for bowlers. These two settings were chosen by an out-of-time test (below).
      </>
    ),
  },
  {
    t: "Composite rating 0–100",
    body: (
      <>
        Each shrunk component is standardised, multiplied by a weight (a prior × its split-half reliability, so components that
        do not repeat between halves of a player&apos;s matches count less), summed, and mapped to 0–100 with
        <b> 100·Φ(z / 2)</b>: 50 = an average qualified player. <b>1,000 bootstrap resamples</b> of each player&apos;s matches give the
        90% interval, the rank range and the chance of being top 10.
      </>
    ),
  },
];

const BAT = [
  ["Net runs above expected / pressure ball", "0.150"],
  ["Runs above expected / pressure ball", "0.088"],
  ["Win probability added / pressure ball", "0.080"],
  ["Pressure minus normal (delta)", "0.076"],
  ["Dismissals above expected (lower = better)", "−0.063"],
  ["vs Elite/Strong bowlers in PP + death", "0.041"],
  ["Consistency (matches above average)", "0.030"],
  ["Batting through a collapse", "0.015"],
  ["Rescue (team win prob. < 20%)", "0.006"],
];
const BOWL = [
  ["Control vs teammates (same innings)", "0.055"],
  ["Runs saved vs expected / pressure ball", "0.040"],
  ["Dot-ball % under pressure", "0.034"],
  ["Breaking set partnerships", "0.032"],
  ["Consistency", "0.027"],
  ["Win probability added / pressure ball", "0.026"],
  ["Death-over clamp (≤ 9 runs vs finishers)", "0.021"],
  ["Heist (defending when the game looked lost)", "0.019"],
  ["Wickets above expected / pressure ball", "0.012"],
];

function WeightTable({ rows }: { rows: string[][] }) {
  return (
    <table className="w-full text-[12.5px]">
      <tbody>
        {rows.map(([k, v]) => (
          <tr key={k} className="border-t border-white/60">
            <td className="py-1.5 pr-3 text-text-100">{k}</td>
            <td className="tnum py-1.5 text-right font-semibold text-text-100">{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function MethodAlgorithm() {
  const flow = flowSvg();
  return (
    <div className="space-y-6">
      <Card index={1} glow="pink" className="p-6">
        <CardHeader icon={<GitBranch size={16} />} title="The algorithm, step by step" subtitle="From raw balls to the top-10 lists" />
        <div className="glass-raised mb-6 overflow-x-auto p-4">
          <div className="mx-auto min-w-[560px] max-w-[760px]" dangerouslySetInnerHTML={{ __html: flow.svg.replace(/width="\d+" height="\d+"/, 'width="100%"') }} />
        </div>
        <ol className="grid gap-3 md:grid-cols-2">
          {STEPS.map((s, i) => (
            <li key={s.t} className="glass-raised p-4">
              <div className="flex items-center gap-2">
                <span className="grid h-6 w-6 place-items-center rounded-full bg-pink-500 text-[11px] font-bold text-white">{i + 1}</span>
                <span className="font-display text-[15px] font-semibold">{s.t}</span>
              </div>
              <p className="mt-2 text-[13px] leading-relaxed text-text-400">{s.body}</p>
            </li>
          ))}
        </ol>
      </Card>

      <div className="grid grid-cols-12 gap-6">
        <Card index={2} className="col-span-12 p-6 lg:col-span-6">
          <CardHeader icon={<Medal size={16} />} title="How the top 10 batters are chosen" subtitle="Batting-side pressure balls only" />
          <ul className="mb-4 space-y-1.5 text-[13px] leading-relaxed text-text-400">
            <li>
              <b className="text-text-100">Qualify:</b> ≥ 150 pressure balls faced and ≥ 15 matches with pressure balls (87 batters qualify
              overall). Filtered views scale this minimum to the share of balls in scope.
            </li>
            <li>
              <b className="text-text-100">Rank:</b> sort by the composite rating; ties closer than 0.3 points between neighbours are broken by
              the player&apos;s captaincy effect.
            </li>
            <li>
              <b className="text-text-100">Components and final weights</b> (prior × reliability):
            </li>
          </ul>
          <WeightTable rows={BAT} />
        </Card>
        <Card index={3} className="col-span-12 p-6 lg:col-span-6">
          <CardHeader icon={<Target size={16} />} title="How the top 10 bowlers are chosen" subtitle="Bowling-side pressure balls only" />
          <ul className="mb-4 space-y-1.5 text-[13px] leading-relaxed text-text-400">
            <li>
              <b className="text-text-100">Qualify:</b> ≥ 120 pressure balls bowled and ≥ 15 matches with pressure balls (99 bowlers qualify
              overall), scaled the same way in filtered views.
            </li>
            <li>
              <b className="text-text-100">Rank:</b> composite rating with the same tie-break; recency half-life 1 season, population prior.
            </li>
            <li>
              <b className="text-text-100">Components and final weights</b> (prior × reliability):
            </li>
          </ul>
          <WeightTable rows={BOWL} />
        </Card>

        <Card index={4} className="col-span-12 p-6 lg:col-span-6">
          <CardHeader icon={<Split size={16} />} title="IPL vs T20I separation" subtitle="Every view is rated on its own balls" />
          <ul className="space-y-2 text-[13px] leading-relaxed text-text-400">
            <li>
              Each leaderboard view (<b className="text-text-100">IPL</b> or <b className="text-text-100">T20I</b> × season × phase) is re-rated
              using only the balls in that scope, with its own bootstrap: an IPL rating never mixes in internationals.
            </li>
            <li>A player can qualify in IPL but not in T20I; each player appears at most once per table (the build fails otherwise).</li>
            <li>
              Team label = the team the player represented in that scope: the franchise in IPL, the country in T20I; other teams and seasons
              are listed in the badge tooltip.
            </li>
            <li>All-rounders (≥ 75 batting and ≥ 60 bowling pressure balls) combine batting and bowling WPA over all formats.</li>
          </ul>
        </Card>
        <Card index={5} className="col-span-12 p-6 lg:col-span-6">
          <CardHeader icon={<ListChecks size={16} />} title="How the settings were tested" subtitle="Out-of-time backtest, 3 periods" />
          <p className="mb-3 text-[13px] leading-relaxed text-text-400">
            Rate players on earlier seasons, then check how well that predicts their pressure performance in later seasons
            (2022–23 → 2024, 2022–24 → 2025–26, 2022–25 → 2026). The chosen settings beat the old model in all three periods:
          </p>
          <table className="w-full text-[12.5px]">
            <thead className="text-[10.5px] uppercase tracking-[0.1em] text-text-400">
              <tr>
                <th className="py-1 text-left font-semibold">Metric</th>
                <th className="py-1 text-right font-semibold">Before</th>
                <th className="py-1 text-right font-semibold">Now</th>
              </tr>
            </thead>
            <tbody className="tnum">
              {[
                ["Batters: rank correlation with later seasons", "0.07", "0.15"],
                ["Batters: predicted top 10 in later top quartile", "30%", "37%"],
                ["Batters: split-half stability", "0.45", "0.65"],
                ["Bowlers: rank correlation with later seasons", "0.28", "0.31"],
                ["Bowlers: split-half stability", "0.63", "0.74"],
              ].map(([k, a, b]) => (
                <tr key={k} className="border-t border-white/60">
                  <td className="py-1.5 pr-3">{k}</td>
                  <td className="py-1.5 text-right text-text-400">{a}</td>
                  <td className="py-1.5 text-right font-semibold text-success">{b}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 flex items-start gap-1.5 text-[12px] text-text-400">
            <BrainCircuit size={14} className="mt-0.5 shrink-0" /> Pressure performance is noisy everywhere in sport; the rating
            shows a 90% interval so close ranks are read as close.
          </p>
        </Card>
      </div>
    </div>
  );
}
