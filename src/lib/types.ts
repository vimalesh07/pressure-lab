/**
 * Pressure Lab — data contracts.
 * Every screen renders from these shapes, loaded from /public/data/*.json.
 * Replace the JSON files with real model output that matches these types.
 * Full field-by-field documentation lives in README.md → "JSON schemas".
 */

export type Format = "IPL" | "T20I";
export type FormatFilter = Format | "All";
export type Phase = "Powerplay" | "Middle" | "Death";
export type PhaseFilter = Phase | "All";
export type Role = "Batter" | "Bowler" | "All-rounder";
export type Discipline = "batting" | "bowling";

/* ---------- kpis.json ---------- */
export interface Kpis {
  matchesAnalysed: number;
  ballsAnalysed: number;
  pressureBalls: number;
  playersRated: number;
  dataWindow: string; // e.g. "2022–2026"
  competitions: Format[];
  modelVersion: string;
  lastUpdated: string; // ISO date
  pressureThreshold: string; // human description of what counts as a pressure ball
}

/* ---------- players.json ---------- */
export interface Player {
  id: string; // stable slug, used in URLs: /player?id=<id>
  name: string;
  role: Role;
  discipline: Discipline; // which leaderboard the player is rated on
  style: string; // "Right-hand top order", "Left-arm wrist spin", ...
  teams: string[]; // short team codes, first = current
  formats: Format[];
  rank?: number; // rank on its discipline's list; 0 = below eligibility (unranked)
  rating?: number;
}

/** How a player's role was decided: pressure balls on each side vs half the eligibility minimum. */
export interface Classification {
  role: Role;
  batPressureBalls: number;
  batMatches: number;
  batThreshold: number;
  batRating: number | null; // null = not eligible on the batting list
  batRank: number | null;
  bowlPressureBalls: number;
  bowlMatches: number;
  bowlThreshold: number;
  bowlRating: number | null;
  bowlRank: number | null;
}

/* ---------- leaderboard_batters.json / leaderboard_bowlers.json ---------- */
export interface LeaderboardRow {
  rank: number;
  playerId: string;
  name: string;
  team: string;
  rating: number; // Pressure Rating 0–100 (shrunk)
  deltaPct: number; // % change of key stat under pressure vs normal (+ = better)
  ciLow: number; // bootstrap lower bound of rating
  ciHigh: number; // bootstrap upper bound of rating
  pressureBalls: number;
  matches: number;
  spark: number[]; // match-by-match pressure scores (0–100), oldest → newest
  team2?: string | null; // All view: muted secondary team (the other format's team)
  teamsOther?: { code: string; seasons: string }[]; // other teams in scope, e.g. SRH 2024–25
  sparkPoints?: SparkPoint[]; // same scores with the match behind each point
  sparkNormal?: number | null; // player's normal (non-pressure) per-ball value on the same 0–100 scale
  resamples?: number; // bootstrap resamples behind ciLow / ciHigh (0 = no interval)
}

export interface SparkPoint {
  matchId: string;
  date: string; // ISO
  label: string; // "RR vs MI"
  score: number; // 0–100
}

export interface LeaderboardView {
  format: FormatFilter;
  season: string; // "All" or "2022".."2026"
  phase: PhaseFilter;
  rows: LeaderboardRow[]; // top 10, rank ascending
}

export interface Leaderboard {
  discipline: Discipline;
  keyStat: string; // what deltaPct measures, e.g. "Strike rate"
  seasons: string[]; // available season filter values (excluding "All")
  views: LeaderboardView[];
}

/* ---------- player_profiles.json ---------- */
export interface ComparisonMetric {
  key: string;
  label: string;
  normal: number | null; // null = not defined (e.g. an average with no dismissals / wickets)
  pressure: number | null;
  unit: "" | "%" | "rpo" | "wpa";
  better: "higher" | "lower";
}

export interface RadarFeature {
  feature: string; // one of the 8 model features
  score: number; // 0–100 percentile vs peers
  peerAvg: number; // 0–100
}

export interface PressureInnings {
  matchId: string;
  label: string; // "vs HBR · 14 May"
  score: number; // 0–100 performance vs expected
  balls: number;
  date?: string; // ISO match date
  normalScore?: number | null; // same match, normal (non-pressure) balls, same 0–100 scale; null = too few balls
}

export interface ConsistencySeason {
  season: string;
  innings: PressureInnings[];
}

export interface MatchupTier {
  tier: "Elite" | "Strong" | "Normal";
  balls: number;
  statLabel: string; // "SR" or "Econ"
  value: number;
  deltaPct: number; // vs player's own overall pressure baseline (+ = better)
  dismissals: number;
}

export interface HeatmapCell {
  row: string;
  col: string;
  value: number | null; // performance index (100 = expected); null = no data
  balls: number;
  runs?: number; // runs scored (batter) / conceded (bowler)
  expRuns?: number; // expected runs for those balls
  rate?: number; // strike rate (batter) / economy (bowler)
  dismissals?: number; // dismissals (batter) / wickets (bowler)
}

export interface Heatmap {
  rowLabel: string; // "Bowler type" or "Batter tier"
  colLabel: string; // "Phase"
  rows: string[];
  cols: string[];
  metricLabel: string;
  minBalls: number; // cells below this are hatched / greyed
  formula?: string; // exact definition of the index
  ballsLabel?: string;
  runsLabel?: string;
  rateLabel?: string;
  dismissalsLabel?: string;
  cells: HeatmapCell[];
}

export interface SignatureMoment {
  matchId: string;
  match: string; // "HBR vs DSR"
  competition: string; // "IPL 2025"
  date: string;
  over: string; // "19.2"
  description: string;
  wpSwing: number; // percentage points, signed (+ = in player's team favour)
}

export interface PlayerProfile {
  id: string;
  name: string;
  role: Role;
  discipline: Discipline;
  classification?: Classification;
  style: string;
  teams: string[];
  formats: Format[];
  rating: number;
  ciLow: number;
  ciHigh: number;
  rank: number;
  rankOf: number;
  pressureBalls: number;
  matches: number;
  comparison: ComparisonMetric[];
  radar: RadarFeature[];
  consistency: ConsistencySeason[];
  matchups: MatchupTier[];
  heatmap: Heatmap;
  signatureMoments: SignatureMoment[];
  bests?: BestPerformance[];
}

/** Best line overall and on pressure balls only. */
export interface BestPerformance {
  kind: "overall" | "pressure";
  label: string;
  line: string; // "54* (31)" or "4/18 (4.0)"
  matchId: string;
  opponent: string;
  date: string;
  competition: string;
}

/* ---------- logs/<playerId>.json (loaded on demand) ---------- */
export interface MatchLogBat {
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  out: boolean;
  how: string | null;
  pRuns: number;
  pBalls: number;
  pOut: boolean;
}

export interface MatchLogBowl {
  balls: number;
  runs: number;
  wkts: number;
  dots: number;
  pBalls: number;
  pRuns: number;
  pWkts: number;
}

export interface MatchLogRow {
  matchId: string;
  competition: string;
  stage: string;
  date: string;
  venue: string;
  teamA: string; // batting first
  teamB: string;
  scoreA: string;
  scoreB: string;
  result: string;
  team: string; // player's team code
  opponent: string;
  won: boolean | null;
  bat?: MatchLogBat;
  bowl?: MatchLogBowl;
  pressureScore: number | null;
  normalScore: number | null;
  hasDetail: boolean; // a matches/<id>.json file holds this player's ball-by-ball
}

export interface MatchLogFile {
  id: string;
  matches: MatchLogRow[];
}

/* ---------- match_replay.json ---------- */
export type BallEvent = "W" | "6" | "4" | "BIG_OVER";

export interface ReplayBall {
  innings: 1 | 2;
  over: string; // "18.4"
  idx: number; // 0-based global ball index across both innings
  wp: number; // win probability (0–100) for team batting first
  pressure: number; // 0–1 pressure index of the delivery
  event?: BallEvent;
  note?: string; // tooltip text for key moments
}

export interface MatchPerformer {
  playerId: string;
  name: string;
  team: string;
  role: Role;
  line: string; // "34 (19) · 11 pressure balls"
  wpa: number; // win probability added, percentage points
}

export interface ReplayMatch {
  id: string;
  competition: string; // "IPL 2025"
  stage: string; // "Qualifier 2"
  date: string;
  venue: string;
  teamA: string; // batting first
  teamB: string;
  scoreA: string;
  scoreB: string;
  result: string;
  balls: ReplayBall[];
  performers: MatchPerformer[];
}

export interface MatchReplayFile {
  matches: ReplayMatch[];
}

/* ---------- matchups.json ---------- */
export interface MatchupStats {
  deathClampRate: number; // % of overs conceding ≤ 9 runs
  threatAdjEcon: number; // economy adjusted for batter threat
  setBatterWickets: number; // wickets of batters on 20+ balls faced
  dotPct: number;
  boundaryPct: number;
  overs: number;
}

export interface BatterTierDef {
  id: string;
  label: string; // "Death finishers"
  description: string;
}

export interface MatchupBowler {
  id: string;
  name: string;
  team: string;
  style: string;
  byTier: Record<string, MatchupStats>; // key = BatterTierDef.id
}

export interface MatchupsFile {
  tiers: BatterTierDef[];
  leagueAverage: Record<string, MatchupStats>;
  eliteBenchmark: Record<string, MatchupStats>; // top-decile bowlers vs that tier
  bowlers: MatchupBowler[];
}

/* ---------- scouting.json ---------- */
export interface DismissalSlice {
  type: string; // "Caught deep", "Bowled", ...
  count: number;
}

export interface ScoutCard {
  playerId: string;
  name: string;
  discipline: Discipline; // decides batter vs bowler wording
  team: string;
  role: Role;
  normalIndex: number; // performance index in normal situations (100 = expected)
  pressureIndex: number; // performance index under pressure
  dropPct: number; // negative = drop under pressure
  sampleBalls: number;
  struggles: {
    versus: string; // bowler type (for batters) or batter type (for bowlers)
    delivery: string;
    line: string;
    phase: Phase;
  };
  dismissals: DismissalSlice[];
  recommendation: string;
}

export interface ScoutingFile {
  squadName: string;
  fix: ScoutCard[]; // our squad
  attack: ScoutCard[]; // opponents
}

/* ---------- method.json ---------- */
export interface PipelineStep {
  id: string;
  title: string;
  detail: string;
  output: string;
}

export interface MethodFile {
  pipeline: PipelineStep[];
  calibration: { predicted: number; observed: number; n: number }[];
  phaseImpact: { phase: Phase; batting: number; bowling: number }[];
  sensitivity: {
    test: string;
    change: string;
    rankCorrelation: number; // Spearman ρ vs baseline ranking
    top10Overlap: number; // out of 10
  }[];
  limitations: { title: string; detail: string }[];
}

/* ---------- evidence.json ---------- */
export interface EvidenceDelivery {
  idx: number; // index into the match curve
  innings: 1 | 2;
  over: string;
  opponent: string;
  outcome: string;
  runs: number;
  wicket: boolean;
  state: string; // "34 needed off 18 · 5 down"
  wpBefore: number; // player's team win probability, %
  wpAfter: number;
  wpa: number; // percentage points
  pressure: number; // 0–1 percentile of this side's pressure weight
  level: "Extreme" | "Very high" | "High" | "Normal";
  isPressure: boolean;
  situation: string;
  tags: string[];
  factors: { leverage: number; stakes: number; threat: number; threatTier: string };
  side?: "bat" | "bowl"; // which side of the ball the player was on
  batter?: string; // presentation: striker and bowler names, legal delivery
  bowler?: string;
  legal?: boolean;
}

/** Presentation fields on a match summary (match centre header / lookup). */
export interface MatchSummaryExtra {
  teamACode?: string;
  teamBCode?: string;
  matchNumber?: number | null;
  season?: string;
  winner?: "A" | "B" | null;
}

/* ---------- matches/index.json ---------- */
export interface MatchIndexEntry {
  id: string;
  competition: string;
  stage: string;
  date: string;
  season?: string;
  matchNumber?: number | null;
  teamA: string;
  teamB: string;
  teamACode?: string;
  teamBCode?: string;
  scoreA: string;
  scoreB: string;
  result: string;
  players: { id: string; name: string; discipline: Discipline }[];
}

export interface EvidenceMatch extends MatchSummaryExtra {
  id: string;
  competition: string;
  stage: string;
  date: string;
  venue: string;
  teamA: string;
  teamB: string;
  scoreA: string;
  scoreB: string;
  result: string;
  playerTeam: string;
  playerTeamIsA: boolean;
  won: boolean | null;
  line: string;
  pressureBalls: number;
  pressureWpa: number;
  matchWpa: number;
  batWpa?: number; // all-rounders: pressure WPA split
  bowlWpa?: number;
  deliveries: EvidenceDelivery[];
}

export type EvidenceRole = "batter" | "bowler" | "allrounder";

export interface EvidenceCompare {
  metric: string;
  pressure: number;
  normal: number;
  higherIsBetter: boolean;
}

export interface EvidencePlayer {
  key?: string; // key in EvidenceFile.players (unique per tab)
  playerId: string; // profile slug
  name: string;
  team: string;
  team2?: string | null;
  teamsOther?: { code: string; seasons: string }[];
  role: EvidenceRole;
  rank: number;
  rating: number;
  ratingLo: number;
  ratingHi: number;
  pTop10: number;
  pressureBalls: number;
  pressureMatches: number;
  positiveMatchShare: number;
  totalPressureWpa: number;
  compare: EvidenceCompare; // batting SR for batters and all-rounders, economy for bowlers
  compareBowl?: EvidenceCompare; // all-rounders: bowling economy
  pressureBallsBat?: number;
  pressureBallsBowl?: number;
  totalPressureWpaBat?: number;
  totalPressureWpaBowl?: number;
  matches: EvidenceMatch[];
}

/* ---------- matches/<matchId>.json (loaded on demand) ---------- */
export interface MatchPlayerDetail {
  name: string;
  discipline: Discipline;
  playerTeam: string;
  playerTeamIsA: boolean;
  won: boolean | null;
  line: string;
  pressureBalls: number;
  pressureWpa: number;
  matchWpa: number;
  deliveries: EvidenceDelivery[];
}

export interface MatchFile extends MatchSummaryExtra {
  id: string;
  competition: string;
  stage: string;
  date: string;
  venue: string;
  teamA: string;
  teamB: string;
  scoreA: string;
  scoreB: string;
  result: string;
  curve: ReplayBall[];
  players: Record<string, MatchPlayerDetail>;
}

export interface EvidenceFile {
  levels: { min: number; label: string }[];
  players: Record<string, EvidencePlayer>;
  curves: Record<string, ReplayBall[]>;
}

/* ---------- player_photos.json (scripts/fetch_player_photos.py, Wikimedia Commons) ---------- */
export interface PlayerPhotoInfo {
  file: string; // public/players/<file>
  name: string;
  source: string; // Commons file page
  license: string;
  licenseUrl: string;
  artist: string;
}
