/**
 * Generates deterministic, clearly fictional mock data for the Pressure Lab UI.
 * This is NOT analytics — it only fabricates plausible-looking placeholder values
 * so every screen can be designed. Replace /public/data/*.json with real model output.
 *
 *   node scripts/generate-mock.mjs
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const OUT = join(process.cwd(), "public", "data");
mkdirSync(OUT, { recursive: true });

// ---------- seeded RNG ----------
let seed = 20262;
const rand = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};
const between = (a, b) => a + rand() * (b - a);
const int = (a, b) => Math.floor(between(a, b + 1));
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const round = (v, d = 1) => Math.round(v * 10 ** d) / 10 ** d;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const gauss = () => (rand() + rand() + rand() + rand() - 2) / 2; // ~N(0, ~0.58)

// ---------- fictional teams ----------
const IPL_TEAMS = ["DSR", "HBR", "CST", "MTR", "RVR", "SUM", "PLN", "HLD", "FRT", "VLY"];
const T20I_TEAMS = ["NTN-A", "NTN-B", "NTN-C", "NTN-D", "NTN-E", "NTN-F"];
const SEASONS = ["2022", "2023", "2024", "2025", "2026"];
const LETTERS = "ABCDEFGHIJKLMNOPQRST".split("");

const BAT_STYLES = [
  "Right-hand top order",
  "Left-hand top order",
  "Right-hand middle order",
  "Left-hand middle order",
  "Right-hand finisher",
  "Left-hand finisher",
];
const BOWL_STYLES = [
  "Right-arm fast",
  "Left-arm fast",
  "Right-arm fast-medium",
  "Left-arm orthodox spin",
  "Right-arm off spin",
  "Right-arm leg spin",
  "Left-arm wrist spin",
];

// ---------- players ----------
const players = [];
const mkPlayer = (discipline, letter, i) => {
  const isBat = discipline === "batting";
  const allRounder = rand() < 0.2;
  const formats = rand() < 0.55 ? ["IPL", "T20I"] : ["IPL"];
  const teams = [pick(IPL_TEAMS)];
  if (rand() < 0.35) teams.push(pick(IPL_TEAMS.filter((t) => t !== teams[0])));
  if (formats.includes("T20I")) teams.push(pick(T20I_TEAMS));
  return {
    id: `${isBat ? "bat" : "bowl"}-${letter.toLowerCase()}`,
    name: `${isBat ? "Batter" : "Bowler"} ${letter}`,
    role: allRounder ? "All-rounder" : isBat ? "Batter" : "Bowler",
    discipline,
    style: isBat ? BAT_STYLES[i % BAT_STYLES.length] : BOWL_STYLES[i % BOWL_STYLES.length],
    teams,
    formats,
    // hidden "true skill" used only to keep the fake numbers coherent
    _skill: clamp(88 - i * 2.1 + gauss() * 4, 35, 96),
  };
};
LETTERS.forEach((l, i) => players.push(mkPlayer("batting", l, i)));
LETTERS.forEach((l, i) => players.push(mkPlayer("bowling", l, i)));
const batters = players.filter((p) => p.discipline === "batting");
const bowlers = players.filter((p) => p.discipline === "bowling");

const spark = (skill, n = 12) =>
  Array.from({ length: n }, () => Math.round(clamp(skill + gauss() * 22, 5, 99)));

// ---------- leaderboards ----------
const FORMATS = ["All", "IPL", "T20I"];
const PHASES = ["All", "Powerplay", "Middle", "Death"];
const phaseBias = {
  batting: { All: 0, Powerplay: 0, Middle: 0, Death: 0 },
  bowling: { All: 0, Powerplay: 0, Middle: 0, Death: 0 },
};

function leaderboard(pool, discipline) {
  const views = [];
  // each player gets a stable per-phase / per-format affinity so filters reshuffle believably
  const aff = new Map(
    pool.map((p) => [
      p.id,
      {
        Powerplay: gauss() * 9,
        Middle: gauss() * 9,
        Death: gauss() * 9,
        IPL: gauss() * 4,
        T20I: gauss() * 6,
        seasons: Object.fromEntries(SEASONS.map((s) => [s, gauss() * 8])),
      },
    ]),
  );
  for (const format of FORMATS) {
    for (const season of ["All", ...SEASONS]) {
      for (const phase of PHASES) {
        const eligible = pool.filter((p) => format === "All" || p.formats.includes(format));
        const scored = eligible.map((p) => {
          const a = aff.get(p.id);
          let r = p._skill + phaseBias[discipline][phase];
          if (phase !== "All") r += a[phase];
          if (format !== "All") r += a[format];
          if (season !== "All") r += a.seasons[season];
          const narrow = (season === "All" ? 1 : 0.45) * (phase === "All" ? 1 : 0.4) * (format === "T20I" ? 0.5 : 1);
          const balls = Math.round(between(420, 900) * narrow) + 24;
          const width = clamp(260 / Math.sqrt(balls), 3, 18);
          // shrink toward 50 with small samples
          const k = balls / (balls + 120);
          const rating = clamp(50 + (r - 50) * k, 20, 97);
          return { p, rating, balls, width };
        });
        scored.sort((x, y) => y.rating - x.rating);
        const rows = scored.slice(0, 10).map((s, i) => ({
          rank: i + 1,
          playerId: s.p.id,
          name: s.p.name,
          team: s.p.teams[0],
          rating: round(s.rating),
          deltaPct: round((s.rating - 55) * 0.45 + gauss() * 4),
          ciLow: round(clamp(s.rating - s.width * between(0.8, 1.1), 0, 100)),
          ciHigh: round(clamp(s.rating + s.width * between(0.8, 1.1), 0, 100)),
          pressureBalls: s.balls,
          matches: Math.max(4, Math.round(s.balls / between(9, 14))),
          spark: spark(s.rating),
        }));
        views.push({ format, season, phase, rows });
      }
    }
  }
  return {
    discipline,
    keyStat: discipline === "batting" ? "Strike rate" : "Economy",
    seasons: SEASONS,
    views,
  };
}
const lbBat = leaderboard(batters, "batting");
const lbBowl = leaderboard(bowlers, "bowling");

// overall rank lookup (All/All/All)
const overall = (lb) => lb.views.find((v) => v.format === "All" && v.season === "All" && v.phase === "All");
const fullRank = (pool) =>
  [...pool].sort((a, b) => b._skill - a._skill).map((p, i) => [p.id, i + 1]);
const batRank = new Map(fullRank(batters));
const bowlRank = new Map(fullRank(bowlers));

// ---------- profiles ----------
const FEATURES = [
  "Ball Pressure",
  "Matchup Threat",
  "Death Clamp",
  "Powerplay Control",
  "Control vs Teammates",
  "Rescue / Heist",
  "Stakes",
  "Consistency",
];
const opponents = [...IPL_TEAMS, ...T20I_TEAMS];
const MONTHS = ["Mar", "Apr", "May", "Jun", "Jul", "Sep", "Oct", "Nov"];

function profile(p) {
  const isBat = p.discipline === "batting";
  const lbRow = overall(isBat ? lbBat : lbBowl).rows.find((r) => r.playerId === p.id);
  const rating = lbRow ? lbRow.rating : round(clamp(50 + (p._skill - 50) * 0.8, 20, 90));
  const width = lbRow ? (lbRow.ciHigh - lbRow.ciLow) / 2 : between(6, 12);
  const pressureBalls = lbRow ? lbRow.pressureBalls : int(180, 520);
  const lift = (rating - 55) / 100; // + means better under pressure

  const comparison = isBat
    ? (() => {
        const sr = between(128, 158);
        const dis = between(3.2, 5.4);
        const bnd = between(15, 22);
        const dot = between(30, 40);
        return [
          { key: "sr", label: "Strike rate", normal: round(sr), pressure: round(sr * (1 + lift * 0.5 + gauss() * 0.04)), unit: "", better: "higher" },
          { key: "dis", label: "Dismissal rate (per 100 balls)", normal: round(dis), pressure: round(dis * (1 - lift * 0.6 + 0.08)), unit: "", better: "lower" },
          { key: "bnd", label: "Boundary %", normal: round(bnd), pressure: round(bnd * (1 + lift * 0.4)), unit: "%", better: "higher" },
          { key: "dot", label: "Dot-ball %", normal: round(dot), pressure: round(dot * (1 - lift * 0.35 + 0.03)), unit: "%", better: "lower" },
          { key: "wpa", label: "Win probability added / inns", normal: round(between(0.5, 2.5)), pressure: round(lift * 22 + between(1, 4)), unit: "wpa", better: "higher" },
        ];
      })()
    : (() => {
        const ec = between(7.2, 8.9);
        const wk = between(4.2, 6.5);
        const bnd = between(12, 17);
        const dot = between(36, 46);
        return [
          { key: "econ", label: "Economy", normal: round(ec, 2), pressure: round(ec * (1 - lift * 0.4 + 0.04), 2), unit: "rpo", better: "lower" },
          { key: "wkt", label: "Wicket rate (per 100 balls)", normal: round(wk), pressure: round(wk * (1 + lift * 0.5)), unit: "", better: "higher" },
          { key: "bnd", label: "Boundary % conceded", normal: round(bnd), pressure: round(bnd * (1 - lift * 0.4 + 0.05)), unit: "%", better: "lower" },
          { key: "dot", label: "Dot-ball %", normal: round(dot), pressure: round(dot * (1 + lift * 0.3)), unit: "%", better: "higher" },
          { key: "wpa", label: "Win probability added / match", normal: round(between(0.5, 2.5)), pressure: round(lift * 20 + between(1, 4)), unit: "wpa", better: "higher" },
        ];
      })();

  const radar = FEATURES.map((f) => ({
    feature: f,
    score: Math.round(clamp(rating + gauss() * 22, 12, 99)),
    peerAvg: Math.round(between(46, 56)),
  }));

  const consistency = SEASONS.filter(() => rand() < 0.9).map((season) => ({
    season,
    innings: Array.from({ length: int(5, 13) }, (_, i) => {
      const opp = pick(opponents);
      return {
        matchId: `m-${season}-${int(100, 999)}`,
        label: `vs ${opp} · ${int(1, 28)} ${pick(MONTHS)}`,
        score: Math.round(clamp(rating + gauss() * 30, 2, 99)),
        balls: int(6, isBat ? 34 : 24),
      };
    }),
  }));

  const tiers = ["Elite", "Strong", "Normal"].map((tier, i) => {
    const base = isBat ? between(125, 150) : between(7.4, 8.8);
    const d = (lift * 30 - (2 - i) * 6 + gauss() * 6) * (i === 0 ? 1.2 : 1);
    return {
      tier,
      balls: int(60, 260) + i * 40,
      statLabel: isBat ? "SR" : "Econ",
      value: isBat ? round(base * (1 + d / 100)) : round(base * (1 - d / 100), 2),
      deltaPct: round(d),
      dismissals: int(2, 14),
    };
  });

  const rows = isBat
    ? ["Right-arm pace", "Left-arm pace", "Off spin", "Leg spin", "Left-arm orthodox", "Wrist spin (LA)"]
    : ["Elite finishers", "Set top-order", "Power hitters", "Anchors", "Lower order"];
  const cols = ["Powerplay", "Middle", "Death"];
  const cells = [];
  for (const row of rows) {
    for (const col of cols) {
      const balls = rand() < 0.14 ? int(3, 17) : int(18, 140);
      const value = rand() < 0.04 ? null : Math.round(clamp(100 + lift * 60 + gauss() * 34, 45, 160));
      cells.push({ row, col, value, balls: value === null ? 0 : balls });
    }
  }

  const momentTexts = isBat
    ? [
        "Took 19 off the 19th over with 31 needed from 12",
        "Rebuilt from 38/4 with a 41-ball half-century",
        "Two sixes off the final three balls to seal the chase",
        "Survived a hat-trick ball, then hit the next four for boundaries",
        "Paced a 24-ball 47 against the league's best death attack",
      ]
    : [
        "Defended 9 in the final over, conceding 4 with a wicket",
        "Removed a set batter on 68 with 22 needed from 14",
        "Bowled a wicket maiden in the 18th over of a chase",
        "Yorker-only 20th over: 5 runs, 2 wickets",
        "Three-over spell of 3/11 that broke a 90-run stand",
      ];
  const pool = [...momentTexts].sort(() => rand() - 0.5);
  const signatureMoments = [0, 1, 2]
    .map((k) => {
      const year = pick(SEASONS);
      const comp = rand() < 0.75 ? `IPL ${year}` : `T20I ${year}`;
      const a = p.teams[0];
      return {
        matchId: `m-${year}-${int(100, 999)}`,
        match: `${a} vs ${pick(opponents.filter((o) => o !== a))}`,
        competition: comp,
        date: `${year}-${String(int(3, 11)).padStart(2, "0")}-${String(int(1, 28)).padStart(2, "0")}`,
        over: `${int(16, 19)}.${int(1, 6)}`,
        description: pool[k],
        wpSwing: round(between(14, 38)),
      };
    })
    .sort((x, y) => y.wpSwing - x.wpSwing);

  const rankMap = isBat ? batRank : bowlRank;
  return {
    id: p.id,
    name: p.name,
    role: p.role,
    discipline: p.discipline,
    style: p.style,
    teams: p.teams,
    formats: p.formats,
    rating,
    ciLow: round(clamp(rating - width, 0, 100)),
    ciHigh: round(clamp(rating + width, 0, 100)),
    rank: lbRow ? lbRow.rank : rankMap.get(p.id),
    rankOf: isBat ? 148 : 131,
    pressureBalls,
    matches: lbRow ? lbRow.matches : Math.round(pressureBalls / 11),
    comparison,
    radar,
    consistency,
    matchups: tiers,
    heatmap: {
      rowLabel: isBat ? "Bowler type" : "Batter tier",
      colLabel: "Phase",
      rows,
      cols,
      metricLabel: "Performance index (100 = expected)",
      minBalls: 18,
      cells,
    },
    signatureMoments,
  };
}
const profiles = Object.fromEntries(players.map((p) => [p.id, profile(p)]));
// make leaderboard ranks consistent with profile rank for players outside the overall top 10
{
  const used = new Set();
  for (const pool of [batters, bowlers]) {
    const top = overall(pool === batters ? lbBat : lbBowl).rows.map((r) => r.playerId);
    let next = 11;
    pool
      .filter((p) => !top.includes(p.id))
      .sort((a, b) => profiles[b.id].rating - profiles[a.id].rating)
      .forEach((p) => {
        profiles[p.id].rank = next;
        next += int(1, 4);
        used.add(p.id);
      });
  }
}

// ---------- match replay ----------
function simulateMatch({ id, competition, stage, date, venue, teamA, teamB, chaseWins, seedOffset }) {
  seed += seedOffset;
  const balls = [];
  let wp = 50;
  let idx = 0;
  let runsA = 0, wktsA = 0, runsB = 0, wktsB = 0;
  for (const inn of [1, 2]) {
    for (let o = 0; o < 20; o++) {
      let overRuns = 0;
      for (let b = 1; b <= 6; b++) {
        const late = o / 19;
        const r = rand();
        let event, runs = 0, note;
        if (r < 0.05 + late * 0.03) {
          event = "W";
        } else if (r < 0.12 + late * 0.05) {
          event = "6"; runs = 6;
        } else if (r < 0.24 + late * 0.04) {
          event = "4"; runs = 4;
        } else runs = pick([0, 0, 1, 1, 1, 2]);
        overRuns += runs;
        // drift WP (team batting first perspective)
        const swingScale = inn === 1 ? 2.2 : 2.2 + late * 6;
        let delta = gauss() * swingScale * 0.6;
        if (event === "W") delta += inn === 1 ? -between(3, 7) : between(4, 8 + late * 12);
        if (event === "6") delta += inn === 1 ? between(1.5, 3.5) : -between(3, 6 + late * 8);
        if (event === "4") delta += inn === 1 ? between(0.8, 2) : -between(1.5, 4);
        if (inn === 1) { runsA += runs; if (event === "W") wktsA++; }
        else { runsB += runs; if (event === "W") wktsB++; }
        // pull 2nd innings toward the scripted result near the end
        if (inn === 2 && o >= 16) {
          const target = chaseWins ? 2 : 98;
          delta += (target - wp) * (0.02 + (o - 16) * 0.025);
        }
        const before = wp;
        wp = clamp(wp + delta, 2, 98);
        const over = `${o}.${b}`;
        const pressure = clamp(
          (inn === 2 ? 0.35 + late * 0.55 : 0.15 + late * 0.45) +
            (1 - Math.abs(wp - 50) / 50) * 0.3 +
            gauss() * 0.06,
          0.03,
          1,
        );
        // swing from the batting side's perspective
        const batSide = inn === 1 ? teamA : teamB;
        const swing = Math.round(inn === 1 ? wp - before : before - wp);
        if (event === "W" && swing <= -4 && (swing <= -7 || o >= 14))
          note = `Over ${over}: Wicket, WP −${Math.abs(swing)}% for ${batSide}`;
        else if (event === "6" && swing >= 4 && (swing >= 7 || o >= 15))
          note = `Over ${over}: Six, WP +${swing}% for ${batSide}`;
        else event = undefined;
        const ball = { innings: inn, over, idx, wp: round(wp), pressure: round(pressure, 2) };
        if (note) { ball.event = event; ball.note = note; }
        balls.push(ball);
        idx++;
      }
      if (overRuns >= 20) {
        const last = balls[balls.length - 1];
        if (!last.note) {
          last.event = "BIG_OVER";
          last.note = `Over ${o + 1}: ${overRuns}-run over by ${inn === 1 ? teamA : teamB}`;
        }
      }
    }
    if (inn === 1) wp = clamp(50 + (runsA - 175) * 0.6, 20, 80);
  }
  // keep only the 7 most decisive moments so the chart stays readable
  const noted = balls.filter((b) => b.note);
  const mag = (b) => (b.event === "BIG_OVER" ? 10 : Number((b.note.match(/WP [+−](\d+)/) || [0, 0])[1]));
  const keep = new Set([...noted].sort((x, y) => mag(y) - mag(x)).slice(0, 7));
  for (const b of noted) if (!keep.has(b)) { delete b.event; delete b.note; }
  // force final
  balls[balls.length - 1].wp = chaseWins ? 0 : 100;
  const chaseTotal = chaseWins ? runsA + int(1, 4) : runsA - int(3, 12);
  return {
    id,
    competition,
    stage,
    date,
    venue,
    teamA,
    teamB,
    scoreA: `${runsA}/${Math.min(wktsA, 9)} (20)`,
    scoreB: `${chaseTotal}/${Math.min(wktsB, chaseWins ? 7 : 9)} (${chaseWins ? "19.4" : "20"})`,
    result: chaseWins ? `${teamB} won by ${10 - Math.min(wktsB, 7)} wickets (2 balls left)` : `${teamA} won by ${runsA - chaseTotal} runs`,
    balls,
    performers: [
      ...[0, 1, 2].map((i) => {
        const pl = batters[int(0, 9)];
        const b = int(12, 38);
        return {
          playerId: pl.id,
          name: pl.name,
          team: i === 1 ? teamB : teamA,
          role: pl.role,
          line: `${Math.round(b * between(1.2, 2.1))} (${b}) · ${int(6, b)} pressure balls`,
          wpa: round(between(6, 24)),
        };
      }),
      ...[0, 1].map((i) => {
        const pl = bowlers[int(0, 9)];
        return {
          playerId: pl.id,
          name: pl.name,
          team: i === 0 ? teamB : teamA,
          role: pl.role,
          line: `4-0-${int(18, 34)}-${int(1, 4)} · ${int(8, 20)} pressure balls`,
          wpa: round(between(5, 20)),
        };
      }),
    ]
      .filter((v, i, a) => a.findIndex((x) => x.playerId === v.playerId) === i)
      .sort((a, b) => b.wpa - a.wpa),
  };
}
const replay = {
  matches: [
    simulateMatch({ id: "ipl-2025-q2", competition: "IPL 2025", stage: "Qualifier 2", date: "2025-05-30", venue: "Desert Bowl Stadium", teamA: "HBR", teamB: "DSR", chaseWins: true, seedOffset: 11 }),
    simulateMatch({ id: "ipl-2024-m48", competition: "IPL 2024", stage: "League · Match 48", date: "2024-04-27", venue: "Harbour Park", teamA: "DSR", teamB: "MTR", chaseWins: false, seedOffset: 7 }),
    simulateMatch({ id: "t20i-2026-sf1", competition: "T20I 2026", stage: "Tri-series final", date: "2026-02-15", venue: "Summit Oval", teamA: "NTN-A", teamB: "NTN-C", chaseWins: true, seedOffset: 23 }),
  ],
};

// ---------- matchups ----------
const tiersDef = [
  { id: "death-finishers", label: "Death finishers", description: "Top-15 batters by SR in overs 16–20 (min 150 balls)" },
  { id: "powerplay-hitters", label: "Powerplay hitters", description: "Top-15 batters by boundary % in overs 1–6 (min 200 balls)" },
];
const stats = (clamp_, econ, wk, dot, bnd, overs) => ({
  deathClampRate: round(clamp_),
  threatAdjEcon: round(econ, 2),
  setBatterWickets: wk,
  dotPct: round(dot),
  boundaryPct: round(bnd),
  overs,
});
const matchups = {
  tiers: tiersDef,
  leagueAverage: {
    "death-finishers": stats(31.4, 10.42, 0, 27.8, 21.6, 0),
    "powerplay-hitters": stats(38.9, 9.15, 0, 39.1, 19.4, 0),
  },
  eliteBenchmark: {
    "death-finishers": stats(48.2, 8.61, 0, 33.9, 15.2, 0),
    "powerplay-hitters": stats(52.7, 7.48, 0, 46.3, 13.1, 0),
  },
  bowlers: bowlers.slice(0, 14).map((b) => {
    const s = (b._skill - 60) / 40;
    return {
      id: b.id,
      name: b.name,
      team: b.teams[0],
      style: b.style,
      byTier: {
        "death-finishers": stats(clamp(32 + s * 22 + gauss() * 6, 12, 70), 10.4 - s * 2.2 + gauss() * 0.5, int(1, 9), 28 + s * 7 + gauss() * 3, 21 - s * 6 + gauss() * 2, int(14, 52)),
        "powerplay-hitters": stats(clamp(39 + s * 18 + gauss() * 6, 15, 75), 9.1 - s * 1.8 + gauss() * 0.5, int(1, 8), 39 + s * 8 + gauss() * 3, 19 - s * 5 + gauss() * 2, int(12, 46)),
      },
    };
  }),
};

// ---------- scouting ----------
const VS_BAT = ["Left-arm wrist spin", "Right-arm leg spin", "Left-arm fast", "Right-arm fast (145+)", "Off spin into the pads"];
const VS_BOWL = ["Left-hand power hitters", "Set top-order batters", "Right-hand finishers", "Switch-hitting batters"];
const DELIVERY_BAT = ["Slower ball (back of hand)", "Wide yorker", "Googly", "Short ball at the body", "Hard-length cutter"];
const DELIVERY_BOWL = ["Full toss under pressure", "Length ball on the stumps", "Slower bouncer", "Wide line leaking to third"];
const LINES = ["Outside off, 5th stump", "On the stumps", "Wide outside off", "Into the body", "Leg-stump line"];
const DISMISSAL_BAT = ["Caught deep", "Caught inner ring", "Bowled", "LBW", "Run out"];
const DISMISSAL_BOWL = ["Boundary hit (4)", "Boundary hit (6)", "Extras", "Dropped catch", "Misfield"];

function scout(p, side) {
  const isBat = p.discipline === "batting";
  const normal = Math.round(between(96, 122));
  const drop = round(-between(9, 34));
  const pressure = Math.round(normal * (1 + drop / 100));
  const phase = pick(["Powerplay", "Middle", "Death"]);
  const versus = isBat ? pick(VS_BAT) : pick(VS_BOWL);
  const delivery = isBat ? pick(DELIVERY_BAT) : pick(DELIVERY_BOWL);
  const line = pick(LINES);
  const recs = side === "fix"
    ? isBat
      ? [
          `Hold back until over 10 against ${versus.toLowerCase()}; pair with a left-right partner.`,
          `Net sessions vs ${delivery.toLowerCase()} on a ${line.toLowerCase()}; avoid sending in during a ${phase.toLowerCase()} collapse.`,
          `Use as a ${phase === "Death" ? "middle-overs anchor" : "death-overs finisher"} instead; pressure index rises there.`,
        ]
      : [
          `Keep out of the 19th over; bowl two of the first four overs instead.`,
          `Set a deep square-leg and long-on when bowling to ${versus.toLowerCase()}.`,
          `Pair with a wrist spinner at the other end in the ${phase.toLowerCase()} phase.`,
        ]
    : isBat
      ? [
          `Attack with ${versus.toLowerCase()} in the ${phase.toLowerCase()}; set a deep point and deep cover.`,
          `Bowl ${delivery.toLowerCase()} on a ${line.toLowerCase()}; dismissed ${int(4, 9)} times to it.`,
          `Build a pressure over: two dot balls in a row roughly doubles the dismissal risk.`,
        ]
      : [
          `Target the ${phase.toLowerCase()} overs with ${versus.toLowerCase()}; economy rises ${int(18, 42)}% under pressure.`,
          `Get the set batter on strike in a close chase; the ${delivery.toLowerCase()} leaks runs.`,
          `Attack early in the spell, before the ${line.toLowerCase()} settles.`,
        ];
  const dTypes = isBat ? DISMISSAL_BAT : DISMISSAL_BOWL;
  return {
    playerId: p.id,
    name: p.name,
    discipline: p.discipline,
    team: side === "fix" ? "DSR" : p.teams[0] === "DSR" ? "HBR" : p.teams[0],
    role: p.role,
    normalIndex: normal,
    pressureIndex: pressure,
    dropPct: drop,
    sampleBalls: int(90, 420),
    struggles: { versus, delivery, line, phase },
    dismissals: dTypes.map((type, i) => ({ type, count: Math.max(1, Math.round(between(1, 12) * (1 - i * 0.15))) })),
    recommendation: pick(recs),
  };
}
const fixPool = [batters[3], batters[8], batters[12], bowlers[5], bowlers[10], bowlers[15]];
const attackPool = [batters[1], batters[6], batters[14], batters[17], bowlers[2], bowlers[9], bowlers[13]];
const scouting = {
  squadName: "DSR",
  fix: fixPool.map((p) => scout(p, "fix")).sort((a, b) => a.dropPct - b.dropPct),
  attack: attackPool.map((p) => scout(p, "attack")).sort((a, b) => a.dropPct - b.dropPct),
};

// ---------- kpis ----------
const kpis = {
  matchesAnalysed: 1284,
  ballsAnalysed: 296412,
  pressureBalls: 71836,
  playersRated: 279,
  dataWindow: "2022–2026",
  competitions: ["IPL", "T20I"],
  modelVersion: "v0.9 · template",
  lastUpdated: "2026-11-10",
  pressureThreshold: "Pressure index ≥ 0.6 (top ~24% of deliveries)",
};

// ---------- method ----------
const method = {
  pipeline: [
    { id: "situation", title: "Situation", detail: "Ball-by-ball state: runs needed, balls left, wickets in hand, required vs current rate.", output: "Base win probability per ball" },
    { id: "stakes", title: "Stakes", detail: "Match importance: playoff race, knockout, bilateral decider, tournament stage.", output: "Stakes multiplier 0.8–1.5" },
    { id: "threat", title: "Opponent threat", detail: "Quality of the bowler or batter faced, by tier and phase.", output: "Threat-adjusted expectation" },
    { id: "performance", title: "Performance vs expected", detail: "Runs, wickets and WP added on each pressure ball, relative to the expected outcome.", output: "Per-ball residual" },
    { id: "rank", title: "Shrink & rank", detail: "Empirical-Bayes shrinkage toward the role mean, bootstrap 1,000× for intervals.", output: "Pressure Rating 0–100 ± CI" },
  ],
  calibration: Array.from({ length: 10 }, (_, i) => {
    const pred = (i + 0.5) * 10;
    return { predicted: round(pred), observed: round(clamp(pred + gauss() * 4, 0, 100)), n: int(1800, 9000) };
  }),
  phaseImpact: [
    { phase: "Powerplay", batting: 0.82, bowling: 0.91 },
    { phase: "Middle", batting: 0.64, bowling: 0.58 },
    { phase: "Death", batting: 1.37, bowling: 1.46 },
  ],
  sensitivity: [
    { test: "Pressure threshold", change: "0.6 → 0.5", rankCorrelation: 0.94, top10Overlap: 9 },
    { test: "Pressure threshold", change: "0.6 → 0.7", rankCorrelation: 0.91, top10Overlap: 8 },
    { test: "Shrinkage prior", change: "k = 120 → 60 balls", rankCorrelation: 0.89, top10Overlap: 8 },
    { test: "Drop stakes feature", change: "remove", rankCorrelation: 0.96, top10Overlap: 9 },
    { test: "IPL only", change: "exclude T20I", rankCorrelation: 0.87, top10Overlap: 7 },
    { test: "Leave-one-season-out", change: "drop 2022", rankCorrelation: 0.92, top10Overlap: 9 },
  ],
  limitations: [
    { title: "Small samples at the death", detail: "Specialist finishers face few pressure balls per season; intervals stay wide even after shrinkage." },
    { title: "No ball-tracking data", detail: "Line and length come from commentary tags, which are inconsistent across broadcasters." },
    { title: "Fielding not modelled", detail: "Dropped catches and misfields are credited to the bowler and batter, not the fielder." },
    { title: "Team context", detail: "Batting depth changes how freely a batter can attack; this is only partly captured by wickets in hand." },
    { title: "T20I opposition strength", detail: "Associate-nation fixtures are down-weighted, but the weighting itself is a modelling choice." },
  ],
};

// ---------- write ----------
const strip = ({ _skill, ...rest }) => rest;
const write = (name, data) => {
  writeFileSync(join(OUT, name), JSON.stringify(data, null, 2) + "\n");
  console.log("wrote", name);
};
write("kpis.json", kpis);
write("players.json", players.map(strip));
write("leaderboard_batters.json", lbBat);
write("leaderboard_bowlers.json", lbBowl);
write("player_profiles.json", profiles);
write("match_replay.json", replay);
write("matchups.json", matchups);
write("scouting.json", scouting);
write("method.json", method);
