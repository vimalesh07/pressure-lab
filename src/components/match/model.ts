import type { EvidenceDelivery, ReplayBall } from "@/lib/types";

/** Everything the match centre draws: one match + one player's deliveries in it. Presentation only. */
export interface MatchView {
  id: string;
  competition: string;
  stage: string;
  date: string;
  venue: string;
  teamA: string; // batting first
  teamB: string;
  teamACode: string;
  teamBCode: string;
  scoreA: string;
  scoreB: string;
  result: string;
  winner: "A" | "B" | null;
  matchNumber: number | null;
  curve: ReplayBall[];
  player: {
    id: string;
    name: string;
    role: string; // "Batter" / "Bowler" / "All-rounder"
    team: string; // code
    isA: boolean; // player's team batted first
    line: string;
    matchWpa: number;
    pressureWpa: number;
    deliveries: EvidenceDelivery[];
  };
}

export const ROSE = "#C2507A";
export const BLUE = "#3B6FB6";
export const GOOD = "#2F7D5B";
export const BAD = "#C0453B";
export const BORDER = "#EADFCB";

/** Short code from a full team name, for older files without codes. */
export function codeFromName(name: string) {
  const w = name.split(/\s+/).filter(Boolean);
  return w.length > 1 ? w.map((x) => x[0]).join("").toUpperCase().slice(0, 4) : name.slice(0, 3).toUpperCase();
}

export const sideOf = (d: EvidenceDelivery, role: string): "bat" | "bowl" => d.side ?? (role === "Bowler" ? "bowl" : "bat");

/** Upper-case outcome word for callouts and tooltips. */
export function outcomeWord(d: EvidenceDelivery) {
  const o = d.outcome.toLowerCase();
  if (o.startsWith("wicket")) return `WICKET${o.includes("(") ? " " + o.slice(o.indexOf("(")) : ""}`;
  if (o === "six") return "SIX";
  if (o === "four") return "FOUR";
  if (o === "wide") return "WIDE";
  if (o === "dot ball") return "DOT";
  if (o === "single") return "1 RUN";
  return o.toUpperCase();
}

/** Chip glyph and style for the over-by-over view. */
export function chipOf(d: EvidenceDelivery): { glyph: string; kind: "dot" | "run" | "four" | "six" | "wkt" | "extra" } {
  if (d.wicket) return { glyph: "W", kind: "wkt" };
  const o = d.outcome.toLowerCase();
  if (o === "six") return { glyph: "6", kind: "six" };
  if (o === "four") return { glyph: "4", kind: "four" };
  if (o === "wide") return { glyph: "wd", kind: "extra" };
  if (d.runs === 0) return { glyph: "•", kind: "dot" };
  return { glyph: String(d.runs), kind: "run" };
}

export function pressureLevel(p: number) {
  return p >= 0.95 ? "Extreme" : p >= 0.9 ? "Very high" : p >= 0.8 ? "High" : p >= 0.5 ? "Moderate" : "Calm";
}

/** Structured state from the delivery's state text ("171 needed off 92 · 3 down" / "120/3 after 12.4 ov"). */
export function stateOf(d: EvidenceDelivery): { text: string; rrr: number | null } {
  const m = d.state.match(/(-?\d+) needed off (\d+)/);
  if (m) {
    const need = Number(m[1]);
    const left = Number(m[2]);
    return { text: `${need} needed off ${left}`, rrr: left > 0 ? (need * 6) / left : null };
  }
  return { text: d.state.replace(/ · .*$/, ""), rrr: null };
}

/** Continuous over position (0–20) for every ball of one innings; extras sit just before the legal ball. */
export function positions(balls: ReplayBall[]) {
  const pos = new Map<number, number>();
  for (let i = 0; i < balls.length; i++) {
    const [o, b] = balls[i].over.split(".").map(Number);
    let p = o + (Math.max(1, b) - 0.5) / 6;
    // repeated label = extra delivery before the legal ball: nudge it left
    let k = 0;
    for (let j = i + 1; j < balls.length && balls[j].over === balls[i].over; j++) k++;
    p -= k * 0.35 / 6;
    pos.set(balls[i].idx, p);
  }
  return pos;
}

export const signed1 = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : "±"}${Math.abs(n).toFixed(1)}`;

/** Player-facing summary numbers for one side. */
export function sideStats(ds: EvidenceDelivery[], side: "bat" | "bowl") {
  const mine = ds.filter((d) => (d.side ?? side) === side);
  const legal = mine.filter((d) => d.legal !== false && d.outcome !== "wide");
  const runs = mine.reduce((a, d) => a + d.runs, 0);
  const p = mine.filter((d) => d.isPressure);
  const pLegal = p.filter((d) => d.legal !== false && d.outcome !== "wide");
  const pRuns = p.reduce((a, d) => a + d.runs, 0);
  return {
    n: mine.length,
    balls: legal.length,
    runs,
    fours: mine.filter((d) => d.outcome === "four").length,
    sixes: mine.filter((d) => d.outcome === "six").length,
    wkts: mine.filter((d) => d.wicket).length,
    dots: legal.filter((d) => d.runs === 0 && !d.wicket).length,
    pBalls: p.length,
    pLegal: pLegal.length,
    pRuns,
    pDots: pLegal.filter((d) => d.runs === 0 && !d.wicket).length,
    pBoundaries: p.filter((d) => d.outcome === "four" || d.outcome === "six").length,
    pWkts: p.filter((d) => d.wicket).length,
    pWpa: p.reduce((a, d) => a + d.wpa, 0),
  };
}

export const oversText = (balls: number) => `${Math.floor(balls / 6)}.${balls % 6}`;
