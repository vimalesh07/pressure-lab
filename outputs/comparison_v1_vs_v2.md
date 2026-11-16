# Pressure Lab: v1 vs v2

v1 = the pipeline before the fixes (snapshot in `outputs/baseline_v1/`). v2 = after FIX 1-9. Same data, same seed, same evaluation split (fit 2022-23, choose/calibrate 2024, test 2025-26).

## 1. Win-probability model

| version | model | innings | test AUC | test Brier | test log loss |
|---|---|---|---|---|---|
| v1 | logreg | all | 0.7990 | 0.1845 | 0.5384 |
| v1 | logreg | 1 | 0.6751 | 0.2375 | 0.6763 |
| v1 | logreg | 2 | 0.9076 | 0.1258 | 0.3859 |
| v1 | lgbm | all | 0.8044 | 0.1831 | 0.5357 |
| v1 | lgbm | 1 | 0.6841 | 0.2349 | 0.6703 |
| v1 | lgbm | 2 | 0.9087 | 0.1257 | 0.3868 |
| v2 ml_only | logreg | all | 0.7915 | 0.1880 | 0.5461 |
| v2 ml_only | logreg | 1 | 0.6575 | 0.2420 | 0.6852 |
| v2 ml_only | logreg | 2 | 0.9022 | 0.1281 | 0.3922 |
| v2 ml+endgame_dp | logreg | all | 0.7916 | 0.1876 | 0.5446 |
| v2 ml+endgame_dp | logreg | 1 | 0.6575 | 0.2420 | 0.6852 |
| v2 ml+endgame_dp | logreg | 2 | 0.9036 | 0.1274 | 0.3891 |
| v2 ml_only | lgbm | all | 0.7939 | 0.1866 | 0.5436 |
| v2 ml_only | lgbm | 1 | 0.6611 | 0.2406 | 0.6810 |
| v2 ml_only | lgbm | 2 | 0.9037 | 0.1270 | 0.3915 |
| v2 ml+endgame_dp | lgbm | all | 0.7943 | 0.1862 | 0.5416 |
| v2 ml+endgame_dp | lgbm | 1 | 0.6611 | 0.2406 | 0.6810 |
| v2 ml+endgame_dp | lgbm | 2 | 0.9055 | 0.1261 | 0.3873 |

Model used for scoring in v2: **logreg**, refit on all seasons 2022-2026 after the honest test (in-sample metrics of the refit are in `tables/wp_model_metrics.csv`).

### End-game calibration (2nd innings, test seasons; pred vs actual win %)

| balls left | n | actual | before (ML only) | after (ML + DP) | gap before | gap after | ECE before | ECE after |
|---|---|---|---|---|---|---|---|---|
| 1 | 95 | 7.4 | 11.8 | 6.7 | +4.5 | -0.7 | 6.5 | 1.8 |
| 2-3 | 252 | 17.5 | 21.9 | 16.0 | +4.4 | -1.5 | 5.0 | 2.5 |
| 4-6 | 468 | 26.9 | 30.9 | 23.6 | +4.0 | -3.3 | 4.6 | 4.3 |
| 7-12 | 1234 | 37.5 | 39.9 | 33.3 | +2.4 | -4.2 | 2.9 | 4.2 |
| 13-24 | 3154 | 46.5 | 47.3 | 44.4 | +0.7 | -2.1 | 1.9 | 3.1 |
| 25+ | 32003 | 53.0 | 51.3 | 51.3 | -1.7 | -1.7 | 2.6 | 2.6 |

### 1st-innings reliability by over (test seasons)

| overs | n | actual | predicted | gap | ECE |
|---|---|---|---|---|---|
| 1-6 | 12527 | 46.3 | 54.1 | +7.8 | 8.5 |
| 7-10 | 8248 | 46.0 | 56.4 | +10.4 | 10.4 |
| 11-15 | 10332 | 46.1 | 57.6 | +11.5 | 11.5 |
| 16-20 | 10051 | 47.9 | 59.1 | +11.1 | 11.1 |

## 2. Top 10 batters: v1 vs v2

| # | v1 | v1 rating | v2 | v2 rating | change | group |
|---|---|---|---|---|---|---|
| 1 | Vaibhav Sooryavanshi | 95.3 | Vaibhav Sooryavanshi | 92.1 | = (v1 #1) | Core |
| 2 | Tim David | 92.2 | Abhishek Sharma | 88.4 | ▲3 (v1 #5) | Core |
| 3 | Rinku Singh | 90.0 | Tim David | 85.9 | ▼1 (v1 #2) | Core |
| 4 | Phil Salt | 89.2 | Yashasvi Jaiswal | 85.0 | ▲5 (v1 #9) | Core |
| 5 | Abhishek Sharma | 88.2 | Finn Allen | 81.9 | ▲9 (v1 #14) | Likely |
| 6 | Jonny Bairstow | 87.4 | Rovman Powell | 80.9 | ▲7 (v1 #13) | Likely |
| 7 | Priyansh Arya | 84.8 | Heinrich Klaasen | 80.0 | ▲8 (v1 #15) | Likely |
| 8 | Glenn Maxwell | 84.1 | Jonny Bairstow | 79.7 | ▼2 (v1 #6) | Likely |
| 9 | Yashasvi Jaiswal | 80.0 | Shreyas Iyer | 78.4 | ▲21 (v1 #30) | Likely |
| 10 | Suryakumar Yadav | 79.9 | Brandon King | 78.2 | ▲37 (v1 #47) | Likely |

**Entered:** Heinrich Klaasen, Finn Allen, Brandon King, Rovman Powell, Shreyas Iyer  
**Dropped out:** Suryakumar Yadav, Rinku Singh, Priyansh Arya, Glenn Maxwell, Phil Salt

- **Heinrich Klaasen** (in; v1 #15 -> v2 #7): largest single effect: FIX 6 state-based wicket value (+5.4 rating points; with it reverted they would rank #12); next: FIX 1 end-game DP -2.8, FIX 4 threat out of the pressure weight -0.6
- **Finn Allen** (in; v1 #14 -> v2 #5): largest single effect: FIX 4 threat out of the pressure weight (-4.0 rating points; with it reverted they would rank #4); next: FIX 6 state-based wicket value -2.4, FIX 5 leverage cap + log weights -1.4
- **Brandon King** (in; v1 #47 -> v2 #10): largest single effect: FIX 4 threat out of the pressure weight (+4.1 rating points; with it reverted they would rank #17); next: FIX 6 state-based wicket value +3.9, FIX 5 leverage cap + log weights +1.2
- **Rovman Powell** (in; v1 #13 -> v2 #6): largest single effect: FIX 6 state-based wicket value (+6.7 rating points; with it reverted they would rank #15); next: FIX 4 threat out of the pressure weight -1.6, FIX 1 end-game DP +0.4
- **Shreyas Iyer** (in; v1 #30 -> v2 #9): largest single effect: FIX 4 threat out of the pressure weight (+4.1 rating points; with it reverted they would rank #16); next: FIX 1 end-game DP +1.3, FIX 3/4 opponent in expectations -0.4
- **Suryakumar Yadav** (out; v1 #10 -> v2 #12): largest single effect: FIX 5 leverage cap + log weights (-2.9 rating points; with it reverted they would rank #7); next: FIX 4 threat out of the pressure weight +2.4, FIX 6 state-based wicket value +0.8
- **Rinku Singh** (out; v1 #3 -> v2 #15): largest single effect: FIX 5 leverage cap + log weights (+6.9 rating points; with it reverted they would rank #23); next: FIX 6 state-based wicket value -5.0, FIX 4 threat out of the pressure weight -1.5
- **Priyansh Arya** (out; v1 #7 -> v2 #17): FIX 3 removed 44 batting balls from A-team cups (8% of their balls); largest single effect: FIX 6 state-based wicket value (-3.3 rating points; with it reverted they would rank #13); next: FIX 4 threat out of the pressure weight -1.1, FIX 5 leverage cap + log weights +0.7
- **Glenn Maxwell** (out; v1 #8 -> v2 #not eligible): no longer eligible in v2 (pressure-ball count or matches below the minimum after the new pressure-ball set)
- **Phil Salt** (out; v1 #4 -> v2 #11): largest single effect: FIX 1 end-game DP (-4.1 rating points; with it reverted they would rank #7); next: FIX 4 threat out of the pressure weight -2.8, FIX 5 leverage cap + log weights -0.9

## 2. Top 10 bowlers: v1 vs v2

| # | v1 | v1 rating | v2 | v2 rating | change | group |
|---|---|---|---|---|---|---|
| 1 | Sunil Narine | 93.9 | Sunil Narine | 91.5 | = (v1 #1) | Core |
| 2 | Jasprit Bumrah | 90.6 | Jasprit Bumrah | 89.3 | = (v1 #2) | Core |
| 3 | Blessing Muzarabani | 85.3 | Krunal Pandya | 87.7 | ▲2 (v1 #5) | Core |
| 4 | Josh Hazlewood | 80.8 | Varun Chakravarthy | 87.3 | ▲3 (v1 #7) | Core |
| 5 | Krunal Pandya | 80.4 | Rashid Khan | 79.3 | ▲9 (v1 #14) | Likely |
| 6 | Akeal Hosein | 80.0 | Akeal Hosein | 79.4 | = (v1 #6) | Likely |
| 7 | Varun Chakravarthy | 79.4 | Mujeeb Ur Rahman | 78.9 | NEW (v1 #—) | Likely |
| 8 | Mahedi Hasan | 78.7 | Josh Hazlewood | 75.4 | ▼4 (v1 #4) | Likely |
| 9 | Trent Boult | 78.5 | Mohsin Khan | 74.6 | ▲1 (v1 #10) | Likely |
| 10 | Mohsin Khan | 76.3 | Maheesh Theekshana | 73.7 | ▲23 (v1 #33) | Likely |

**Entered:** Maheesh Theekshana, Rashid Khan, Mujeeb Ur Rahman  
**Dropped out:** Trent Boult, Blessing Muzarabani, Mahedi Hasan

- **Maheesh Theekshana** (in; v1 #33 -> v2 #10): largest single effect: FIX 4 threat out of the pressure weight (+3.8 rating points; with it reverted they would rank #16); next: FIX 5 leverage cap + log weights -1.3, FIX 1 end-game DP -0.5
- **Rashid Khan** (in; v1 #14 -> v2 #5): largest single effect: FIX 4 threat out of the pressure weight (+4.6 rating points; with it reverted they would rank #10); next: FIX 6 state-based wicket value -2.1, FIX 5 leverage cap + log weights -1.4
- **Mujeeb Ur Rahman** (in; v1 #not eligible -> v2 #7): largest single effect: FIX 3/4 opponent in expectations (-1.3 rating points; with it reverted they would rank #5); next: FIX 5 leverage cap + log weights +1.2, FIX 6 state-based wicket value +1.0
- **Trent Boult** (out; v1 #9 -> v2 #18): largest single effect: FIX 4 threat out of the pressure weight (-2.1 rating points; with it reverted they would rank #15); next: FIX 3/4 opponent in expectations +1.1, FIX 6 state-based wicket value -1.1
- **Blessing Muzarabani** (out; v1 #3 -> v2 #36): largest single effect: FIX 4 threat out of the pressure weight (-8.7 rating points; with it reverted they would rank #20); next: FIX 5 leverage cap + log weights -3.2, FIX 6 state-based wicket value -2.5
- **Mahedi Hasan** (out; v1 #8 -> v2 #35): largest single effect: FIX 4 threat out of the pressure weight (-7.9 rating points; with it reverted they would rank #19); next: FIX 3/4 opponent in expectations -1.8, FIX 1 end-game DP -0.5

## 3. Repeatability (split-half, odd vs even matches)

| list | metric | v1 r | v2 r | v1 Spearman-Brown | v2 Spearman-Brown |
|---|---|---|---|---|---|
| batters | delta | -0.047 | 0.02 | -0.098 | 0.039 |
| batters | rating | 0.178 | 0.28 | 0.302 | 0.438 |
| batters | nrae_p | 0.052 | 0.19 | 0.099 | 0.32 |
| bowlers | delta | 0.011 | -0.118 | 0.021 | -0.268 |
| bowlers | rating | 0.489 | 0.443 | 0.656 | 0.614 |
| bowlers | rsae_p | 0.14 | 0.091 | 0.245 | 0.166 |

## 4. Sensitivity (top-10 overlap /10 and Spearman vs the main run)

| test | list | v1 overlap | v2 overlap | v1 rho | v2 rho |
|---|---|---|---|---|---|
| Threshold 10% | batters | 7 | 5 | 0.837 | 0.853 |
| Threshold 10% | bowlers | 7 | 8 | 0.948 | 0.952 |
| Threshold 30% | batters | 8 | 7 | 0.871 | 0.94 |
| Threshold 30% | bowlers | 9 | 9 | 0.953 | 0.965 |
| Stakes off | batters | — | 8 | — | 0.953 |
| Stakes off | bowlers | — | 9 | — | 0.967 |
| Stakes -50% | batters | — | 9 | — | 0.978 |
| Stakes -50% | bowlers | — | 10 | — | 0.98 |
| Stakes +50% | batters | — | 9 | — | 0.989 |
| Stakes +50% | bowlers | — | 9 | — | 0.987 |
| Without F3 | batters | 7 | 10 | 0.884 | 0.989 |
| Without F3 | bowlers | 6 | 10 | 0.927 | 0.997 |
| Without F6 | batters | 8 | 7 | 0.94 | 0.965 |
| Without F6 | bowlers | 9 | 9 | 0.985 | 0.974 |
| Without F7 | batters | 10 | 10 | 1.0 | 1.0 |
| Without F7 | bowlers | 10 | 10 | 0.999 | 0.999 |
| Without F8 | batters | 9 | 10 | 0.98 | 0.991 |
| Without F8 | bowlers | 10 | 10 | 0.998 | 0.998 |
| Without F9 | batters | 10 | 10 | 1.0 | 1.0 |
| Without F9 | bowlers | 7 | 7 | 0.732 | 0.776 |
| Without F10 | batters | 10 | 10 | 0.998 | 1.0 |
| Without F10 | bowlers | 10 | 10 | 0.999 | 0.999 |
| Without F11 | batters | 10 | 10 | 0.999 | 1.0 |
| Without F11 | bowlers | 10 | 10 | 0.999 | 0.999 |
| Without F12 | batters | 8 | 9 | 0.983 | 0.989 |
| Without F12 | bowlers | 9 | 10 | 0.994 | 0.993 |
| Without F13 | batters | 10 | 10 | 1.0 | 1.0 |
| Without F13 | bowlers | 9 | 10 | 0.973 | 0.958 |
| Without F14 | batters | 9 | 9 | 0.99 | 0.998 |
| Without F14 | bowlers | 10 | 10 | 1.0 | 1.0 |
| Without F18 | batters | 9 | 9 | 0.977 | 0.99 |
| Without F18 | bowlers | 10 | 10 | 0.989 | 0.99 |
| IPL only | batters | 6 | 5 | 0.894 | 0.947 |
| IPL only | bowlers | 6 | 5 | 0.909 | 0.912 |
| T20I only | batters | 4 | 5 | 0.847 | 0.847 |
| T20I only | bowlers | 4 | 6 | 0.849 | 0.858 |
| Rule-based pressure | batters | 6 | 5 | 0.645 | 0.799 |
| Rule-based pressure | bowlers | 4 | 6 | 0.738 | 0.869 |

Note: in v2, *Without F3* / *Without F10* remove the opponent tier / opposition Elo from the expected-value models (in v1 they removed the threat multiplier / Elo weight from the pressure weight). The stakes tests (off / -50% / +50%) are new in v2.

## 5. Other fixes (numbers)

- FIX 1: end-game DP for <= 12 balls left, linear blend to ML at 24; 1-ball bucket gap +4.5 -> -0.7 pts; worst |gap| (<= 24 balls) 4.5 -> 4.2 pts.
- FIX 2: era features post23, ipl_post23; model chosen on 2024 = logreg; refit on all seasons.
- FIX 3: excluded 30 A-team matches (6,973 balls, 172 players; per-player list in tables/excluded_competitions_players.csv). Opposition Elo effect per +100 Elo: bat_runs x1.010, striker_out x1.031, bowler_runs x1.052, bowler_wkt x0.972. Weak-opposition share > 25%: 74 eligible players (tables/weak_opposition_share.csv).
- FIX 4: pressure weight = leverage x stakes. Pressure-ball overlap with v1 (Jaccard): batting 0.75, bowling 0.55. Opponent tier effect inside E[runs] (batter vs Elite bowler): x0.949.
- FIX 5: leverage capped at p99; max single-over share of a top-20 player's weighted score: batters 12.1% -> 7.7% (v1 uniform 8.5%); bowlers 19.1% -> 17.3% (v1 uniform 13.1%).
- FIX 6: state-based wicket value, mean 8.93 runs (v1 fixed 8.32); tables/wicket_value_table.csv + figures/wicket_value_heatmap.png.
- FIX 7: stakes empirical check supports 3/8 multiplier directions (tables/stakes_empirical.csv).
- FIX 8: phase-win baselines in tables/phase_impact_baselines.csv: PP 76%; Middle 81%; Death 86%; PP + Middle 96%; PP + Death 97%; Middle + Death 99%.
- FIX 9: confidence groups + cards in tables/top10_cards_*.csv; wording changed to 'best and most consistent performer in high-pressure situations'.
