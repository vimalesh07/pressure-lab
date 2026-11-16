# Pressure Lab

**Who delivers when the match is on the line?**
A T20 pressure-performance dashboard (IPL + T20I, 2022–2026) built for SupeRR Selector Season 2, Round 1.

> Unofficial fan analytics project. Not affiliated with Rajasthan Royals. No official logos, crests, wordmarks, sponsor marks or player photos are used. All iconography is original or from lucide.

This repository is a **UI template only**. Every number on screen comes from JSON files in `public/data/`. The shipped files contain **fictional sample data** ("Batter A", "Bowler K", fictional team codes such as `DSR`, `HBR`, `NTN-A`). There is no analytics code in the app: replace the JSON with your model's output and the screens update.

---

## Quick start

```bash
npm install
npm run dev            # http://localhost:3000
npm run build          # static export to ./out (Vercel-ready)
npm start              # serves ./out at http://localhost:4173 (don't double-click out/index.html; it needs http://)
npm run screenshots    # captures every screen at 1440×900 into ./screenshots (needs a prior build)
npm run mock:generate  # regenerates the fictional sample JSON in public/data
```

Requirements: Node 18.18+ (tested on Node 22). The screenshot script uses `playwright-core` with your installed Chrome or Edge; set `CHROME_PATH` if it isn't found.

### Deploy to Vercel

The project is a static export (`output: "export"` in `next.config.ts`). Import the repo in Vercel and keep the defaults (framework: Next.js). You can also upload `./out` to any static host.

---

## Screens

| # | Route | Screen | Data files |
|---|-------|--------|-----------|
| 1 | `/` | Overview: hero, KPIs, how it works, top-3 previews | `kpis.json`, `leaderboard_batters.json`, `leaderboard_bowlers.json` |
| 2 | `/leaderboards/?tab=batters\|bowlers` | Top 10 with Format / Season / Phase filters in the top bar | `leaderboard_*.json` |
| 3 | `/player/?id=<playerId>` | Player profile: gauge, normal vs pressure, radar, consistency strip, matchups, weakness heatmap, signature moments | `player_profiles.json`, `players.json` |
| 4 | `/replay/` | Ball-by-ball win probability with pressure band and key moments | `match_replay.json` |
| 5 | `/matchups/` | Matchup arena: "Who bowls the 19th over?" | `matchups.json` |
| 6 | `/scouting/` | Fix plans and attack plans | `scouting.json` |
| 7 | `/method/` | Pipeline diagram, calibration, phase impact, sensitivity, limitations | `method.json` |

Screenshots of every screen at 1440×900 are in [`screenshots/`](./screenshots).

### Exporting player data

On the player profile, **Export** opens a dialog:

1. **Players**: starts with the player on screen. Search by name or team, filter batters or bowlers, or add the top 10 batters or bowlers in one click.
2. **Include**: summary, normal vs pressure, feature scores, matchups, season record, heatmap and signature moments.
3. **Format**:
   - **Word (.docx)**: one player per page, with a summary table first when several players are exported.
   - **PDF**: opens the print dialog; choose "Save as PDF".
   - **Excel (.csv)**: one row per player.
   - **JSON**: the raw profile fields.

Files are built in the browser from `player_profiles.json` (code: `src/lib/exportPlayers.ts`, `src/components/ExportDialog.tsx`), so the static site needs no server. Players below the eligibility rules have profiles but no rank, and they export as "Unranked".

---

## Folder structure

```
pressure-lab/
├─ public/data/              ← drop real model output here (9 JSON files)
├─ scripts/
│  ├─ generate-mock.mjs      ← fictional sample-data generator (not analytics)
│  └─ screenshots.mjs        ← 1440×900 screenshot capture
├─ screenshots/              ← PNGs of each screen
└─ src/
   ├─ app/                   ← one folder per screen (App Router)
   │  ├─ page.tsx            ← Overview
   │  ├─ leaderboards/  player/  replay/  matchups/  scouting/  method/
   │  ├─ layout.tsx          ← fonts + AppShell
   │  └─ globals.css         ← design tokens, glass surfaces, motion
   ├─ components/
   │  ├─ layout/             ← AppShell (sidebar, top bar, footer), Filters
   │  ├─ ui/                 ← KpiCard, RankRow, ConfidenceBand, DeltaPill, TeamChip,
   │  │                         PressureGauge, Sparkline, SectionHeader, Controls
   │  │                         (Segmented/Select/Tabs/Legend), Skeleton/EmptyState/DataGate
   │  └─ charts/             ← RadarCard, HeatmapCard, WpCurveCard, ConsistencyStrip, Donut
   └─ lib/
      ├─ types.ts            ← TypeScript contract for every JSON file
      ├─ data.ts             ← useData() runtime loader + file→type map
      ├─ format.ts           ← number formatting, pressure colour scale
      └─ nav.ts              ← sidebar items
```

---

## How to swap in real data

1. Export your Python model output to the nine files below, keeping the **file names** and **field names** exactly as documented.
2. Put them in `public/data/` (replacing the samples).
3. `npm run dev` to check, then `npm run build`.

Files are fetched **at runtime** (`src/lib/data.ts`), so on a deployed site you can also replace `out/data/*.json` (or set `NEXT_PUBLIC_DATA_BASE` to another URL path) without rebuilding.

Things to keep in mind:

- **Units.** Ratings are 0–100. Percentages are given as numbers like `13.9` (meaning 13.9%), not `0.139`. Win probability is 0–100. The pressure index is 0–1.
- **Sign convention for `deltaPct`.** Positive always means *better under pressure*. For bowlers, flip the sign of the economy change before export (economy falling 8% → `+8`).
- **IDs.** `playerId` must match between `players.json`, the leaderboards, `player_profiles.json` (object key **and** `id`), `match_replay.json` performers and `scouting.json`.
- If a file fails to load or is missing, the screen shows an error card naming the file instead of crashing.
- Python tip: `json.dump(obj, f, ensure_ascii=False, indent=2)`; convert NumPy types with `.item()` / `.tolist()`.

---

## JSON schemas

TypeScript definitions are in `src/lib/types.ts`. Field-by-field reference:

### `kpis.json` (object)

| Field | Type | Notes |
|---|---|---|
| `matchesAnalysed` | int | |
| `ballsAnalysed` | int | |
| `pressureBalls` | int | Balls above your pressure threshold |
| `playersRated` | int | After minimum-sample filter |
| `dataWindow` | string | e.g. `"2022–2026"` |
| `competitions` | `("IPL"\|"T20I")[]` | |
| `modelVersion` | string | Shown in the top bar |
| `lastUpdated` | ISO date | |
| `pressureThreshold` | string | Plain-English definition of a pressure ball |

### `players.json` (array of `Player`)

| Field | Type | Notes |
|---|---|---|
| `id` | string | Stable slug used in URLs |
| `name` | string | |
| `role` | `"Batter" \| "Bowler" \| "All-rounder"` | |
| `discipline` | `"batting" \| "bowling"` | Which leaderboard the player is rated on |
| `style` | string | `"Left-hand finisher"`, `"Right-arm leg spin"`… |
| `teams` | string[] | Short codes; first = current |
| `formats` | `("IPL"\|"T20I")[]` | |

### `leaderboard_batters.json` / `leaderboard_bowlers.json` (object)

```jsonc
{
  "discipline": "batting",
  "keyStat": "Strike rate",          // what deltaPct measures ("Economy" for bowlers)
  "seasons": ["2022", "2023", "2024", "2025", "2026"],
  "views": [
    { "format": "All", "season": "All", "phase": "All", "rows": [ /* LeaderboardRow × 10 */ ] }
    // one view per filter combination: format ∈ All|IPL|T20I, season ∈ All|<seasons>, phase ∈ All|Powerplay|Middle|Death
  ]
}
```

A missing combination shows the "No players meet the minimum sample" empty state, so you can export only the views you have.

`LeaderboardRow`:

| Field | Type | Notes |
|---|---|---|
| `rank` | int | 1–10 (1–3 get the gold treatment) |
| `playerId`, `name`, `team` | string | |
| `rating` | number | Pressure Rating 0–100 (after shrinkage) |
| `deltaPct` | number | % change of `keyStat` under pressure vs normal; **+ = better** |
| `ciLow`, `ciHigh` | number | Bootstrap interval of `rating` (the UI labels it 90%) |
| `pressureBalls`, `matches` | int | Sample size |
| `spark` | number[] | Match-by-match pressure scores 0–100, oldest → newest (UI shows up to 12) |

### `player_profiles.json` (object keyed by player id → `PlayerProfile`)

| Field | Type | Notes |
|---|---|---|
| `id`, `name`, `role`, `discipline`, `style`, `teams`, `formats` | | Same as `players.json` |
| `rating`, `ciLow`, `ciHigh` | number | |
| `rank`, `rankOf` | int | e.g. rank 4 of 148 batters |
| `pressureBalls`, `matches` | int | |
| `comparison` | `ComparisonMetric[]` | Normal vs pressure table (any length, 5 recommended) |
| `radar` | `RadarFeature[]` | 8 features |
| `consistency` | `ConsistencySeason[]` | |
| `matchups` | `MatchupTier[]` | Elite / Strong / Normal |
| `heatmap` | `Heatmap` | |
| `signatureMoments` | `SignatureMoment[]` | Top 3 |

`ComparisonMetric`: `key` string, `label` string, `normal` number, `pressure` number, `unit` (`""`, `"%"`, `"rpo"` = 2 decimals, `"wpa"` = shown as signed points), `better` (`"higher"` | `"lower"`, which decides green/red).

`RadarFeature`: `feature` (one of *Ball Pressure, Matchup Threat, Death Clamp, Powerplay Control, Control vs Teammates, Rescue / Heist, Stakes, Consistency*), `score` 0–100 percentile, `peerAvg` 0–100.

`ConsistencySeason`: `season` string, `innings`: `{ matchId, label ("vs HBR · 14 May"), score 0–100 (50 = as expected), balls }[]`. Score bands: ≥ 70 delivered, 40–69 par, < 40 missed.

`MatchupTier`: `tier` (`"Elite"|"Strong"|"Normal"`), `balls`, `statLabel` (`"SR"` or `"Econ"`), `value`, `deltaPct` (+ = better), `dismissals`.

`Heatmap`:

```jsonc
{
  "rowLabel": "Bowler type",           // or "Batter tier" for bowlers
  "colLabel": "Phase",
  "rows": ["Right-arm pace", "Left-arm pace", "Off spin", "..."],
  "cols": ["Powerplay", "Middle", "Death"],
  "metricLabel": "Performance index (100 = expected)",
  "minBalls": 18,                       // cells below this are hatched and greyed
  "cells": [{ "row": "Off spin", "col": "Death", "value": 87, "balls": 42 }]  // value null = no data
}
```

`SignatureMoment`: `matchId`, `match` ("HBR vs DSR"), `competition` ("IPL 2025"), `date` (ISO), `over` ("19.2"), `description`, `wpSwing` (percentage points, + = toward the player's team).

### `match_replay.json`

```jsonc
{
  "matches": [{
    "id": "ipl-2025-q2",
    "competition": "IPL 2025", "stage": "Qualifier 2", "date": "2025-05-30", "venue": "…",
    "teamA": "HBR",                 // batting first; all wp values are from teamA's perspective
    "teamB": "DSR",
    "scoreA": "158/5 (20)", "scoreB": "159/7 (19.4)",
    "result": "DSR won by 3 wickets (2 balls left)",
    "balls": [
      { "innings": 1, "over": "0.1", "idx": 0, "wp": 49.5, "pressure": 0.21 },
      { "innings": 2, "over": "18.4", "idx": 220, "wp": 31.0, "pressure": 0.92,
        "event": "W", "note": "Over 18.4: Wicket, WP −18% for DSR" }   // event + note → marker with tooltip
    ],
    "performers": [
      { "playerId": "bat-h", "name": "Batter H", "team": "HBR", "role": "Batter",
        "line": "56 (37) · 12 pressure balls", "wpa": 21.8 }
    ]
  }]
}
```

- `idx` is a 0-based index across both innings and must be increasing. `over` uses cricket notation (`"19.5"` = 20th over, 5th ball).
- `event` ∈ `"W" | "6" | "4" | "BIG_OVER"`. Only balls with both `event` and `note` get markers; keep it to about 5–8 per match so the chart stays readable.

### `matchups.json`

```jsonc
{
  "tiers": [{ "id": "death-finishers", "label": "Death finishers", "description": "Top-15 batters by SR in overs 16–20 (min 150 balls)" }],
  "leagueAverage": { "death-finishers": MatchupStats },
  "eliteBenchmark": { "death-finishers": MatchupStats },
  "bowlers": [{ "id": "bowl-a", "name": "Bowler A", "team": "CST", "style": "Right-arm fast",
                "byTier": { "death-finishers": MatchupStats, "powerplay-hitters": MatchupStats } }]
}
```

`MatchupStats`: `deathClampRate` (% of overs ≤ 9 runs), `threatAdjEcon` (rpo), `setBatterWickets` (int), `dotPct`, `boundaryPct`, `overs` (int sample).

### `scouting.json`

```jsonc
{
  "squadName": "DSR",
  "fix": [ScoutCard],     // our squad
  "attack": [ScoutCard]   // opponents
}
```

`ScoutCard`: `playerId`, `name`, `discipline` (`"batting"|"bowling"`), `team`, `role`, `normalIndex` and `pressureIndex` (100 = expected), `dropPct` (negative = drop), `sampleBalls`, `struggles` `{ versus, delivery, line, phase }`, `dismissals` `{ type, count }[]` (for bowlers: how runs leak), `recommendation` (one sentence). The list is shown in file order, so sort by `dropPct` ascending.

### `method.json`

| Field | Shape |
|---|---|
| `pipeline` | `{ id, title, detail, output }[]` (5 stages) |
| `calibration` | `{ predicted, observed, n }[]`, in % by decile |
| `phaseImpact` | `{ phase, batting, bowling }[]`, multipliers vs the overall mean (1.0) |
| `sensitivity` | `{ test, change, rankCorrelation, top10Overlap }[]` |
| `limitations` | `{ title, detail }[]` |

---

## Design system

| Token | Value | Use |
|---|---|---|
| `--bg-900` / `800` / `700` | `#070B1A` / `#0E1430` / `#18204A` | Base, cards, raised |
| `--pink-500` / `300` | `#EA1A85` / `#FF6FB5` | Primary accent, "high pressure" |
| `--blue-500` / `300` | `#254AA5` / `#5B8CFF` | Secondary accent, "calm" |
| `--gold-400` | `#E8B84A` | Ranks 1–3 only |
| `--text-100` / `400` | `#F4F6FF` / `#9AA3C7` | Text (AA on all surfaces) |
| `--success` / `--danger` | `#2ED39A` / `#FF5A6E` | Always paired with ▲/▼ |
| Pressure scale | `#5B8CFF → #8A6CFF → #EA1A85 → #FF3B5C` | Gauge, pressure band |

- Type: Space Grotesk (headings, big numbers) and Inter (body), tabular numerals on every stat.
- Glass cards: 20px radius, 1px `rgba(255,255,255,0.08)` border, blur. Glow only on hero elements.
- Motion: count-ups, chart draw-ins and fade-and-rise. All of it is disabled under `prefers-reduced-motion`.
- Accessibility: deltas use ▲/▼ glyphs as well as colour; low-sample heatmap cells are hatched as well as greyed; consistency dots differ in shape (circle, square, diamond); charts have tooltips, legends and ARIA labels.
- Layout: collapsible sidebar (auto-collapses below 1280px, drawer on mobile), 12-column grid, 1440px max width.

## Analytics pipeline (Python)

The ratings shown in the app are produced by a reproducible, CPU-only Python pipeline.

```bash
py -m pip install -r requirements.txt     # Windows ("python -m pip" elsewhere)
py run_all.py                             # full run, about 2 minutes on a laptop
```

**Input:** the six raw CSVs in `data/raw/` (read-only; mapped by name pattern, so ID prefixes are fine).
**Settings:** every threshold, weight and multiplier is in `config.yaml`.
**Log:** `outputs/logs/run_log.txt` records every exclusion, threshold, model metric and the
data-based justification for each weight. The run ends with the acceptance checklist.

| Module | Stage |
| --- | --- |
| `src/data_prep.py` | File mapping, extras rules, super-over/DLS/no-result handling, pre-ball state, reconciliation vs results |
| `src/win_probability.py` | F1: par-score model, WP model (logistic baseline + LightGBM, time split), WPA, leverage |
| `src/threat.py` | F3: Elite/Strong/Normal tiers per phase with leave-one-out, data-derived multipliers |
| `src/stakes.py` | F6 stakes, F10 Elo (IPL / international), F12 IPL points table + NRR race, F18 favourite under threat |
| `src/pressure_index.py` | Pressure weight = leverage × stakes × threat; pressure ball = top 20% |
| `src/player_metrics.py` | Expected values, net runs above expected, per player-match sums for every component (F2, F7–F9, F11, F13, F14) |
| `src/ranking.py` | F4 Empirical-Bayes shrinkage + eligibility, rating, F5 bootstrap by match, F17 captain tie-break |
| `src/validation.py` | Sensitivity, split-half reliability, sanity table, F15 phase impact |
| `src/scouting.py` | F16 fragile list, weakness profiles, Fix / Attack plans |
| `src/export.py` | CSVs, figures and the `public/data/*.json` files this app reads |

**Outputs:** `outputs/tables/` (top 10s, full ratings, sensitivity, fragile list, weakness profiles,
phase impact, WP metrics and more), `outputs/figures/` (PNG), `outputs/models/` (WP + par models),
and `public/data/` (JSON for the UI). The original sample JSON is kept in `data/ui_sample_backup/`.

**How the rating works, in short:** each ball's leverage is the expected win-probability swing of
the next ball. That is multiplied by match stakes and the opponent's threat tier, and the top 20%
of balls are pressure balls. Each player's performance on them (runs, wickets and WPA vs the
state's expectation), their pressure-vs-normal delta, consistency and the feature scores
F7–F14 are shrunk toward the population mean, standardised by the true-talent spread and
combined. Each weight is the prior in `config.yaml` × that component's split-half reliability.
The result is shown on a 0–100 scale (50 = average eligible player) with a bootstrap interval
and P(top 10).
