# Win-Probability and Leverage Models for Limited-Overs Cricket (T20 first)

Context: notes for improving Pressure Lab (LightGBM WP plus isotonic calibration, exact DP end-game over the last 12 balls, leverage = expected |dWP| per ball, top-20% pressure balls). Research done 2026-11-18. Every claim has a source link. Items from memory that I could not confirm are listed under Gaps and marked UNVERIFIED.

## 1. Main published and industry WP models: inputs, methods, validation

### Takeaway
There are three families of published WP models. The first is dynamic programming or Markov models over (balls, wickets, runs/target), such as WASP and recent arXiv work. The second is direct classifiers: dynamic logistic regression (Asif & McHale), plain logistic, and gradient-boosted trees. The third is player-level ball-by-ball simulators (Swartz group). Industry tools (WinViz, ESPNcricinfo Forecaster) publish almost no methodology or accuracy numbers. The closest analogue to Pressure Lab, and the most important source here, is Mishra (arXiv, Aug 2026). It finds that an exact DP chase model is badly miscalibrated on IPL 2024–26 while simple logistic models calibrate much better.

### Cited Findings
**WASP (Brooker & Hogan, Univ. of Canterbury; on TV since Nov 2012)**
- Developed by Scott Brooker (PhD) and supervisor Seamus Hogan, grounded in dynamic programming. On TV it shows a projected score in the 1st innings and the chaser's win probability in the 2nd. It has been owned by NV Play since 2018 — [Wikipedia: WASP](https://en.wikipedia.org/wiki/WASP_(cricket_calculation_tool))
- DP recurrence (per Hogan's 2012 blog, as quoted on Wikipedia): V(b,w) = r(b,w) + p(b,w)·V(b+1,w+1) + (1−p(b,w))·V(b+1,w), with V(b*,w)=0. V is expected additional runs, r is expected runs on the next ball and p is the wicket probability. Values in rarely seen states are driven mainly by well-populated later states, which acts as built-in smoothing. The 2nd-innings model adds runs and target and uses "the same logic" — [Wikipedia: WASP](https://en.wikipedia.org/wiki/WASP_(cricket_calculation_tool))
- Data: non-shortened ODIs and T20s between the top-8 nations from about 2006. It assumes average team vs average team "in the given conditions". First shown on Sky NZ in a Nov 2012 HRV Cup T20. NV Play reportedly added a "pressure" concept (Wikipedia marks this "citation needed") — [Wikipedia: WASP](https://en.wikipedia.org/wiki/WASP_(cricket_calculation_tool))
- Venue and day conditions enter through an expert-set pre-match par score (set by the NZC statistician and the Sky commentary team), not through the core model. It does not model the batters at the crease, but it does encode that batters 2–3 are better than 8–9 (wickets-lost state) — [NZC: What's WASP all about](https://www.nzc.nz/news-items/archive/whats-wasp-all-about/)
- Criticism: because it models average vs average, it shows "who is currently winning", not who will win. Probabilities are rounded to integers, so it shows 0% or 100% before the end — [Wikipedia: WASP](https://en.wikipedia.org/wiki/WASP_(cricket_calculation_tool)); [NZC](https://www.nzc.nz/news-items/archive/whats-wasp-all-about/)
- Brooker & Hogan (2011), "A Method for Inferring Batting Conditions in ODI Cricket from Historical Data" (UC Econ WP 11/44). It infers ground conditions from only the first-innings score and the match result, treats conditions as a nuisance variable, and tests across a major rule change using pre/post matches — [IDEAS/RePEc](https://ideas.repec.org/p/cbt/econwp/11-44.html); [UC repository](https://ir.canterbury.ac.nz/handle/10092/6406)

**Duckworth-Lewis-Stern (resource tables)**
- Stern (2016), JORS 67(12):1469–1480, doi 10.1057/jors.2016.30. It adapts DL to the extreme scoring rates of T20 — [IDEAS](https://ideas.repec.org/a/pal/jorsoc/v67y2016i12d10.1057_jors.2016.30.html). The Stern edition was adopted by the ICC in Oct 2014 — [REF 2021 impact case](https://results2021.ref.ac.uk/impact/396ae21e-8c20-4179-854a-4b42c925a414/pdf)
- A T20 resource table is indexed by overs left (20→1) × wickets lost (0–9) and must decrease monotonically along both axes. Older T20 tables were derived by simply transforming the ODI table — [SA Statistical Journal paper](https://www.journals.ac.za/sasj/article/download/4951/3115)

**CricViz WinViz (industry)**
- Uses venue-specific par scores from recent data at each ground. The player's record is "the more important variable" — [Swarajya interview with CricViz, 2019](https://swarajyamag.com/sports/swarajya-speaks-to-cricviz-the-team-behind-the-data-intelligence-models-for-cricket-world-cup-2019)
- The 2023 Test version is "powered by AI and machine learning", draws on a database of the last 500 Tests, and adds conditional "what-if" outputs (for example, WinViz after two more wickets). The Hundred version was modelled on the last 100 balls of T20 innings — [CricViz/Ellipse press](https://ellipsedata.com/?p=39772); [Ellipse](https://ellipsedata.com/?p=642)
- No public accuracy, calibration, or feature list was found.

**ESPNcricinfo Forecaster (Superstats, with IIT Madras / Gyan Data, 2019–)**
- "Statistical and machine learning models" predict the final innings score and win probability, plus next-over run and wicket probabilities for each bowler. The expected score includes team momentum (runs and wickets in the last over) and historical win rates from similar positions — [AIM on IITM-ESPNcricinfo](https://analyticsindiamag.com/iit-madras-espncricinfos-ai-powered-tool-is-enhancing-the-ipl-experience-this-season/); [ESPNcricinfo Superstats launch](https://www.espncricinfo.com/ci/content/story/1178276.html)
- Smart Stats values every run and wicket by batter and bowler quality and match pressure — [ESPN Smart Stats explainer](https://www.espn.co.uk/cricket/story/_/id/26312449)

**Academic classifiers**
- Asif & McHale (2016), Int. J. Forecasting 32(1):34–43, "In-play forecasting of win probability in ODI cricket: a dynamic logistic regression model". The logistic coefficients evolve smoothly over the match. This dramatically reduces parameters and gives stable, intuitive probabilities with minimal loss of explanatory power. A later review says its forecasts resemble betting-market odds — [IDEAS](https://ideas.repec.org/a/eee/intfor/v32y2016i1p34-43.html); [OUCI](https://ouci.dntb.gov.ua/works/426xePm4)
- Mishra (2026, arXiv 2608.14696, single author, not peer reviewed). IPL 2008–2026 2nd-innings chases from Cricsheet: 1,162 chases and 130,029 legal balls. Test set is 2024–26 (164 matches, 18,010 balls). Held-out results (Brier / log loss / ECE):
  - Constant: 0.2503 / 0.6937 / 0.0169
  - Base Markov (exact DP): 0.2040 / 0.8011 / 0.2235
  - RRR-conditioned Markov: 0.1637 / 0.5313 / 0.1627
  - RRR Markov + era adjustment: 0.1489 / 0.4741 / 0.1310
  - Logistic on RRR alone: 0.1404 / 0.4379 / 0.0773
  - Logistic with engineered features: 0.1350 / 0.4157 / 0.0700

  [arXiv HTML](https://arxiv.org/html/2608.14696); [abstract](https://arxiv.org/abs/2608.14696)
- Same paper: the exact model is over-dispersed (too extreme at both ends). It is too confident in easy chases (RRR 0–8: +0.014 to +0.032) and too pessimistic at RRR 10–12 (model 0.183 vs empirical 0.294, gap −0.112). Per-ball marginals match the data to within TV ≤ 0.02, so the error comes from within-state dependence: run-scoring persistence of about 3–5 balls. Innings-level heterogeneity explains only about 18%, and wickets anti-cluster — [arXiv HTML](https://arxiv.org/html/2608.14696)
- Open-source CricLeverage (GitHub): Cricsheet T20, separate 1st and 2nd innings models, logistic baseline vs LightGBM. Features: score, wickets, balls left, RR, RRR, venue, recent momentum. Season-based split; Brier, log loss and calibration curves (result values are placeholders). It has a pressure index and Bayesian-shrunk clutch ratings — [GitHub CricLeverage](https://github.com/PushkarSingh-tech/CricLeverage)
- R-bloggers (2020) T20 WPA: tidymodels logistic regression on 600k+ Cricsheet balls (IPL, internationals, BBL, Blast, PSL). Separate 1st and 2nd innings models; only ROC curves reported. The 1st-innings model is clearly weaker — [R-bloggers](https://www.r-bloggers.com/2020/06/twenty20-win-probability-added/)
- A 2017 dynamic IPL winner predictor uses relative team strength from player ratings plus runs and balls remaining, and deliberately excludes venue — [MLSA17, KU Leuven](https://dtai.cs.kuleuven.be/events/MLSA17/papers/MLSA17_paper_5.pdf)

**Simulators (Swartz group, SFU)**
- Davis, Perera & Swartz (2015), "A Simulator for Twenty20 Cricket", ANZ J. Stat. 57(1):55–71. Ball-outcome probabilities depend on batter, bowler, overs consumed and wickets lost. A companion empirical-Bayes method infers player batting and bowling characteristics adjusted for game situation — [SFU PDF](https://www.sfu.ca/~tswartz/papers/t20sim.pdf); [BL record](https://eld.bl.uk/catalog/100048791298_0x000001). The PDF text could not be extracted, so validation numbers were not verified.
- 2026 arXiv (submitted to JQAS): an MDP plus Monte Carlo simulation optimises batting order and bowling plans to maximise win probability, assuming independent ball outcomes — [arXiv 2604.13861](https://arxiv.org/html/2604.13861v1)

### Inferences
- Pressure Lab's held-out AUC of about 0.79 is in line with these sources. None report a markedly better in-play T20 AUC, but Brier, log loss and ECE are the comparable metrics. Mishra's numbers (Brier about 0.135–0.14 for good 2nd-innings models on IPL 2024–26) are a direct benchmark for the Pressure Lab chase model on the same seasons.
- Mishra's finding bears directly on Pressure Lab's last-12-balls exact DP. An independence-assuming DP is over-dispersed even with accurate marginals. Pressure Lab should check reliability of the DP segment separately, by RRR slice, before trusting it over the ML model. Possible fixes: condition DP outcome probabilities on RRR and era (Mishra's RRR Markov plus era roughly halved log loss vs base), or blend toward ML over more balls.
- Asif & McHale's smoothly varying coefficients map onto the 13–24-ball DP-to-ML blend. A Pressure Lab equivalent would be to fit smooth, balls-left-indexed calibration or blend weights instead of a fixed linear ramp.

### Gaps
- No public methodology or accuracy numbers for CricViz WinViz or ESPNcricinfo Forecaster beyond press descriptions.
- WASP has no peer-reviewed validation numbers. Hogan's original 2012 "Offsetting Behaviour" blog post could not be retrieved.
- UNVERIFIED (from memory, not confirmed): Lock & Nettleton (2014, JQAS) random-forest NFL WP. nflfastR's xgboost WP uses monotone constraints and a spread-adjusted variant: CRAN docs confirm [wp_model](https://rdrr.io/cran/fastrmodels/man/wp_model.html), [wp_model_spread](https://rdrr.io/cran/fastrmodels/man/wp_model_spread.html), and the [Open Source Football xgboost WP tutorial](https://opensourcefootball.netlify.app/posts/2021-04-13-creating-a-model-from-scratch-using-xgboost-in-r/) mentions monotone constraints.
- I found no published neural-net or fully Bayesian in-play T20 WP model with temporal validation numbers.

## 2. First-innings WP, venue/pitch, team strength, toss, dew, rule changes (Impact Player), calibration drift

### Takeaway
No source publishes a fix for first-innings calibration drift. The documented practice is to anchor the first innings to a par score (expert-set in WASP, venue-recent-data in WinViz) and treat conditions as a nuisance parameter that is re-estimated (Brooker & Hogan 2011). Scoring has kept shifting since 2023, so a single binary era flag is probably too coarse. That fits Pressure Lab's +10-point first-innings drift on 2025–26.

### Cited Findings
- WASP: a pre-match par score set by experts from venue history and day conditions feeds the model — [NZC](https://www.nzc.nz/news-items/archive/whats-wasp-all-about/)
- WinViz: par score at each ground based on recent data there — [Swarajya/CricViz](https://swarajyamag.com/sports/swarajya-speaks-to-cricviz-the-team-behind-the-data-intelligence-models-for-cricket-world-cup-2019)
- Brooker & Hogan (2011): infer batting conditions per match from the 1st-innings score and the result, and handle a rule change by comparing pre and post matches — [IDEAS](https://ideas.repec.org/p/cbt/econwp/11-44.html)
- Mishra (2026): adding an era adjustment to the RRR Markov model improved held-out log loss from 0.5313 to 0.4741 and ECE from 0.163 to 0.131. A one-feature RRR logistic "transferred across eras" better than the exact model — [arXiv HTML](https://arxiv.org/html/2608.14696)
- IPL scoring drift after the Impact Player rule:
  - 1st-innings average 184.7 since 2023 vs 168.2 in 2018–22 — [ESPNcricinfo (2024)](https://www.espncricinfo.com/ci/content/story/1436641.html)
  - 200+ totals: 18 (2022 record), 37 (2023), 41 (2024), 52 (2025) — [ESPNcricinfo 2026 run-fest](https://africa.espn.com/cricket/story/_/id/48474161/ipl-2026-run-fest-already-flying-fifties-sixy-powerplays-routine-200s)
  - IPL 2026 1st-innings average about 192 (192.04 in full 20-over games, the IPL high) vs about 191 in 2025, with 65 totals of 200+ vs 52 — [search summary of 2026 stats coverage](https://zyzjpl2.pages.dev/cricket/story/_/id/48870685/ipl-2026-stats-breakneck-scoring-rates-200-plus-totals-spinners-go-missing). This is a mirror domain, so verify against ESPNcricinfo.
  - Powerplay average rose from 45–50 pre-2023 to 52.3 in 2023 — [ESPNcricinfo 2023](https://africa.espn.com/cricket/story/_/id/36223170/ipl-2023-how-much-impact-impact-player-rule-had)
  - 2025 had slower surfaces at some venues (e.g. Lucknow), and the mid-season run rate was 9.49, about 2024's level — [Outlook India](https://www.outlookindia.com/sports/cricket/indian-premier-league-2025-mid-season-review-new-faces-dominate-as-batting-frenzy-equals-last-season)
- Toss, home and dew: older T20I regression with venue, toss outcome and decision, day/night and a dew term — [ResearchGate](https://www.researchgate.net/publication/228920576_On_the_Effect_of_Home_Team_Advantage_and_Winning_the_Toss_in_the_Outcome_of_T20_International_Cricket_Matches). Wharton student T20I model normalises player features by ground scoring rates, notes dew effects, and reaches about 70% test accuracy (logistic) — [Wharton 2025](https://wsb.wharton.upenn.edu/wp-content/uploads/2025/05/StatsStumps_CricketPrediction.pdf)
- Team strength: player-rating-based relative strength (MLSA17) — [KU Leuven](https://dtai.cs.kuleuven.be/events/MLSA17/papers/MLSA17_paper_5.pdf). WASP explicitly omits it and is criticised for that — [NZC](https://www.nzc.nz/news-items/archive/whats-wasp-all-about/). WinViz weights player records heavily — [Swarajya](https://swarajyamag.com/sports/swarajya-speaks-to-cricviz-the-team-behind-the-data-intelligence-models-for-cricket-world-cup-2019)
- Elo for limited-overs team strength (ODI, 2000–2021) — [Liu & Cheema, Wharton 2022](https://wsb.wharton.upenn.edu/wp-content/uploads/2022/05/Liu_2021_WSABI_cricket.pdf)

### Inferences (concrete plug-ins for Pressure Lab)
- **Compose the 1st-innings WP from the chase model instead of classifying it directly.** WP1(state) = Σ_T P(final total = T | state) · (1 − WP2(start of chase, target T+1)). Here P(T | state) comes from a WASP-style DP over (balls, wickets) or from the par-score model's predictive distribution. The 1st-innings WP then inherits calibration from the better-calibrated 2nd-innings surface. A level shift in scoring moves both the projected total and the chase difficulty, so the shifts partly cancel instead of being baked into a classifier trained on ≤2024. This follows the structure of WASP, which projects the score in innings 1 and gives WP in innings 2. It is a design inference, not a published validation.
- **Replace the binary Impact-Player flag with a rolling scoring-environment covariate.** For example, an exponentially weighted league and venue run rate or 1st-innings average over the last N matches, known before the match. Alternatively, re-estimate the par score per season, the way Brooker & Hogan re-infer conditions. The evidence of continued drift (200+ totals 37→41→52→65) means one 2023 flag cannot capture 2025–26.
- **Recalibrate on the most recent data, separately by innings.** For example, isotonic or Platt calibration on a rolling window per innings, possibly with balls-left bins. Calibrating only on 2024 cannot correct a 2025–26 environment shift. Keep 2026 as true out-of-time test.
- Toss and dew: add toss-winner-chooses-to-field × day/night × venue as pre-match covariates, or bake them into the par score. Evidence for a dew effect size in IPL 2022–26 was not found.

### Gaps
- No published study quantifies first-innings WP calibration drift, or a fix for it, in T20.
- No peer-reviewed estimate of the Impact Player effect on WP models. Only descriptive scoring statistics were found.
- No quantitative dew-effect estimate for IPL night games was found.

## 3. Simulation / Markov / DP vs direct classifiers

### Takeaway
DP and Markov models give exact, internally consistent WP (a martingale) and exact leverage and WPA attribution, and handle rare late states well. Their independence assumption makes them over-dispersed and worse-calibrated than simple classifiers on held-out IPL data. Classifiers calibrate better but are not martingales, so their per-ball swings are not exactly attributable. Mishra calls this a structural tradeoff.

### Cited Findings
- "Exactly attributable leverage and well-calibrated WP cannot be obtained from the same object over this state" (Mishra 2026). Exact leverage requires the martingale, the martingale requires conditional ball independence given the state, and that independence miscalibrates WP — [arXiv abstract](https://arxiv.org/abs/2608.14696)
- On held-out IPL 2024–26, the exact base Markov model has log loss 0.801 (worse than a constant, 0.694) and ECE 0.224. The engineered logistic has 0.416 and 0.070 — [arXiv HTML](https://arxiv.org/html/2608.14696)
- Fixes tested in that paper:
  - Adding striker balls-faced to the state changed log loss by only +0.0004 nats. The residual dependence looks like a hidden regime, not an observable covariate.
  - A block bootstrap with K≈20 balls closes about 26% of the calibration gap (mean absolute gap 0.0613→0.0451, six seeds).
  - Suggested but not built: a Markov-switching outcome model.
  - Post-hoc recalibration was rejected for the attribution layer because it breaks the martingale.

  [arXiv HTML](https://arxiv.org/html/2608.14696)
- Practitioner advice from the same paper:
  - Report WP from a calibrated surface, and use the exact martingale surface for leverage and WPA, with a published error bound.
  - Raw batting WPA summed to about +62 wins, which is bias, so de-drift WPA by WP bin before comparing roles.
  - Use match-clustered bootstrap intervals. Per-ball differences under about ±0.005 are within error.

  [arXiv HTML](https://arxiv.org/html/2608.14696)
- WASP's DP lets sparse late states borrow strength from well-populated later states — [Wikipedia: WASP](https://en.wikipedia.org/wiki/WASP_(cricket_calculation_tool))
- Player-level simulators (Davis, Perera & Swartz 2015) let outcome probabilities depend on batter, bowler, overs and wickets, which enables team-strength-aware WP and strategy optimisation — [SFU](https://www.sfu.ca/~tswartz/papers/t20sim.pdf). The 2026 MDP and Monte Carlo strategy paper also assumes independent balls — [arXiv 2604.13861](https://arxiv.org/html/2604.13861v1)

### Inferences
- Pressure Lab already mixes both families: DP for the last 12 balls, ML elsewhere, and empirical outcome probabilities for leverage. Mishra suggests a cleaner two-surface design: (a) a calibrated ML surface for displayed WP, and (b) a single consistent DP or Markov surface for leverage and WPA, conditioned on RRR and era. Its over-dispersion would be documented rather than "fixed" by isotonic regression.
- If displayed WP stays a DP/ML blend, calibrate the blended output, not the components. Check reliability in the 13–24-ball blend zone specifically.
- Dirichlet smoothing of death-over outcome probabilities fixes the marginals. It does not fix the dependence that Mishra identifies as the main source of miscalibration. Conditioning outcome probabilities on RRR does capture part of it (Base→RRR Markov: log loss 0.80→0.53).

### Gaps
- No published head-to-head between gradient boosting (LightGBM/XGBoost) and DP in T20 with temporal validation, apart from Mishra's logistic-vs-Markov comparison.
- The Swartz simulator's validation statistics could not be extracted (PDF text unreadable).

## 4. Leverage index definitions (cricket and baseball) and alternatives

### Takeaway
Pressure Lab's "expected absolute WP swing" is almost exactly Mishra's (2026) cricket swing and Tango's baseball LI before normalisation. The standard final step is to divide by the league-average swing so that LI averages 1.0, rather than taking a log or percentile. Cricket alternatives include the Bhattacharjee & Lemmer Pressure Index (RRR ratio × weighted wickets) and composite indices that combine closeness and RRR.

### Cited Findings
- Tango LI: LI quantifies how much WP could change on the event, with 1.0 neutral — [MLB glossary](https://www.mlb.com/glossary/advanced-stats/leverage-index). It is the sum of potential WE changes × their probabilities, divided by the average potential swing — [FanGraphs LI library](https://library.fangraphs.com/misc/li) (page returned 403 to the fetch tool; the definition is quoted via search). The average LI is set to 1.0 — [Tango 2003 archive](https://tangotiger.net/archives/stud0069.shtml); [Baseball-Reference](https://baseball-reference.com/about/wpa.shtml)
- LI is prospective, a property of the state before the play. "Realized leverage" is a distinct measure — [MetricGate](https://metricgate.com/calculator/leverage-index-baseball)
- Cricket swing (Mishra 2026): swing(s) = Σ_o p_o(s)·|V(s'_o) − V(s)|, over outcomes o ∈ {0…6, W}. LI = swing / mean swing over actual deliveries (reference mean 0.0170 WP per ball). In a coin-flip toy model, swing → 2p(1−p). Finishers and death bowlers occupy the highest-LI moments — [arXiv HTML](https://arxiv.org/html/2608.14696)
- Bhattacharjee & Lemmer (2016) Pressure Index for T20 chases: it builds on the initial vs current required run rate (IRRR = T×6/B) with Lemmer (2015) wicket weights instead of equal weights, and starts at 1. The 2025/26 extension with higher-order Markov models targets keeping PI in [0.5, 3.5] or below 0.5 — [arXiv 2505.01849](https://arxiv.org/abs/2505.01849v2); [Lemmer et al. 2018, SAJR SPER](https://ajol.info/index.php/sajrs/article/view/180184/169533). The original 2016 paper was not retrieved; the formula is as restated by later papers.
- CricLeverage pressure index: closeness of match + potential next-ball/over WP shift + RRR relative to balls left. Validated qualitatively by spikes in last-over finishes — [GitHub](https://github.com/PushkarSingh-tech/CricLeverage)
- Brooker (WASP): a dot ball with two overs left shifts the result far more than one in over 2, a qualitative statement of time-varying leverage — [NZC](https://www.nzc.nz/news-items/archive/whats-wasp-all-about/)

### Inferences (concrete plug-ins)
- **Normalise to LI = swing / mean swing** (computed on the training population, per format, possibly per innings) instead of the 99th-percentile cap plus log. LI is then interpretable (2.0 = twice an average ball) and comparable across seasons. Baseball-style bands (e.g. "high leverage" when LI > some threshold) could replace the top-20% rule, which forces exactly 20% of balls to be pressure balls regardless of how many matches were close.
- **Compute leverage from one consistent surface.** Mishra's point is that |V(s'_o) − V(s)| is exactly attributable only when V is the martingale value function used to generate p_o. Mixing calibrated ML WP for V with empirical p_o breaks the martingale, so expected WP drift is non-zero and some "leverage" is just model drift. Either compute swing from the DP/Markov surface throughout, or report the mean signed drift E[V(s') − V(s)] per state as a diagnostic.
- **Alternatives or complements to expected |dWP|:**
  - Outcome-spread leverage: the standard deviation of next-ball WP, or the max−min WP gap between wicket and six.
  - Over-level leverage: expected |dWP| over the next 6 balls, which is less noisy for bowler pressure.
  - Bhattacharjee–Lemmer PI as a WP-free chase-pressure feature (RRR ratio × weighted wickets).
  - Mishra's 2p(1−p) closeness term: close games have high swing.
  - Stakes multiplier analogous to baseball gmLI / championship leverage, which Pressure Lab already approximates with match stakes.
- For clutch ratings, use WPA / LI ("context-neutral" WPA) and Bayesian shrinkage, as CricLeverage does. De-drift WPA by WP bin before ranking (Mishra).

### Gaps
- UNVERIFIED (from memory): FanGraphs labels LI < 0.85 low, 0.85–2.0 medium and > 2.0 high, and defines pLI, gmLI, inLI and Clutch = (WPA/pLI) − WPA/LI. The FanGraphs page returned 403, so confirm before citing.
- The original Bhattacharjee & Lemmer (2016) paper was not retrieved. The exact PI formula and wicket weights need checking.
- NV Play's WASP "pressure" extension is undocumented (Wikipedia: citation needed).

## 5. Calibration and evaluation best practice

### Takeaway
For WP, proper scoring rules (log loss, Brier) plus ECE and reliability curves, evaluated out-of-time and by segment (innings, RRR slice, balls left), are the standard. Calibration-focused model selection matters more than accuracy when probabilities feed downstream decisions. Recalibration should be applied to displayed WP but not to the surface used for exact leverage and WPA.

### Cited Findings
- Walsh & Joshi (2024), Machine Learning with Applications, NBA betting: selecting models by calibration rather than accuracy gave average ROI +34.69% vs −35.17%, and best case +36.93% vs +5.56%. A corrigendum appeared in Mar 2025 (content not checked), and preprint numbers differ from the published ones — [Bath research portal](https://researchportal.bath.ac.uk/en/publications/machine-learning-for-sports-betting-should-model-selection-be-bas/); [DOAJ](https://doaj.org/article/2e36e6f3ec6a46b7b54308dee2d11c23)
- Mishra (2026) reports Brier, log loss and ECE together. The constant model has the lowest ECE (0.017) but the worst Brier, so ECE alone is insufficient. Mishra uses reliability by RRR slice, temporal hold-out (2024–26), and match-clustered bootstrap intervals — [arXiv HTML](https://arxiv.org/html/2608.14696)
- Season-based splits (not random rows) to avoid leakage between balls of the same match; log loss, Brier and calibration curves — [GitHub CricLeverage](https://github.com/PushkarSingh-tech/CricLeverage)
- nflfastR's WP models (xgboost, with and without spread) are an open, reproducible reference implementation — [CRAN fastrmodels](https://rdrr.io/cran/fastrmodels/man/wp_model.html); [OSF tutorial](https://opensourcefootball.netlify.app/posts/2021-04-13-creating-a-model-from-scratch-using-xgboost-in-r/)

### Inferences (Pressure Lab checklist)
- Report log loss, Brier and ECE (with a fixed binning, e.g. 10–20 equal-mass bins) on 2025 and 2026 separately, split by innings and balls-left band (0–12 DP, 13–24 blend, 25+ ML). AUC alone (0.79) hides the +10-point 1st-innings drift.
- Use match-clustered bootstrap for confidence intervals. Balls within a match are dependent, so ball-level standard errors are too narrow.
- Add a Brier decomposition (reliability / resolution / uncertainty) to separate drift (reliability) from sharpness. Also add a "calibration-in-the-large" check (mean predicted vs observed win rate per season and innings), which directly exposes era drift.
- Do rolling-origin (expanding-window) temporal validation: train ≤2022 → test 2023, train ≤2023 → test 2024, and so on. This shows whether drift grows with distance from the training era, which would argue for the scoring-environment covariate in section 2.
- Use monotone constraints in LightGBM (WP non-increasing in wickets lost and required rate, non-decreasing in balls left for a fixed chase) to stabilise sparse states. nflfastR's build uses monotone constraints; their direct benefit to calibration in cricket is not verified.

### Gaps
- No cricket-specific study comparing isotonic vs Platt vs beta calibration under temporal drift was found.
- The Walsh & Joshi corrigendum's content was not checked.
