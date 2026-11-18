# Ball-level expected-value (xR/xW) and matchup models in cricket: methods for improving Pressure Lab

Scope note: about 15 tool calls. Primary sources fully read: Davis, Perera & Swartz T20 simulator (SFU PDF), Rafique cricWAR (CMSAC 2022 PDF), Ganesh arXiv 2604.13861 (2026), Bandyopadhyay arXiv 2608.18020 (2026, abstract page only), Opta Next Ball Predictor (2022), Kartikeya Date ESPN xR/xW article (2024). Other items come from search snippets and are marked as such.

## 1. Published expected-runs / expected-wickets models and the features that matter without tracking data

### Takeaway
Public, documented xR/xW models fall into three families. (a) State-only expected-runs tables or GLMs (over × wickets, with innings, venue, pace/spin and platoon adjustments), as in cricWAR. (b) Hierarchical multinomial per-ball outcome models with player effects and multiplicative state factors, as in the Swartz simulator and Opta's neural network. (c) Control/false-shot-driven xW, as in the ESPNcricinfo/Kartikeya Date model and Dan Weston's IPL work. CricViz's xR/xW methodology (Hawk-Eye-based) is proprietary, and I found no public methodology document for it. Pressure Lab's design (Poisson GLM on state, opponent tier and Elo offset) is already in family (a)/(b). Adopting the documented best practices from those families would improve it more than switching model families.

### Cited Findings
- **cricWAR (Hassan Rafique, CMSAC 2022, Univ. of Indianapolis).** Expected runs are defined by game state = over (o) × wickets lost (w). Run value = actual minus expected. Run values are then adjusted by regression for venue, bowling pace (spin vs pace), platoon advantage (batting hand vs bowling arm/type) and innings (1st vs 2nd), and weighted by a variant of the Leverage Index. Uncertainty in RAA/WAR comes from resampling and simulation. Fully reproducible, open-source, uses the R package `cricketdata` (co-developed by the author). It criticises grouping by phase (PP/middle/death) as an "over-simplification" that loses within-phase dynamics, and argues for using over-level state. — [Rafique, cricWAR (CMSAC 2022 PDF)](https://www.stat.cmu.edu/cmsac/conference/2022/assets/pdf/HassanRafique.pdf)
- **Context-adjusted Player Evaluation for T20 (Rhitankar Bandyopadhyay, arXiv 2608.18020, Aug 2026).** Data: about 2.7M legal T20 deliveries. *Runs Above Expected* uses a multiplicative log-linear cohort scoring-rate model, estimated per cell as a conditional-Poisson MLE multiplier fitted by iterated backfitting. *Dismissal Adjusted Runs* values a wicket as the runs it forgoes, via a batting-side value function solved by dynamic programming (Bellman recursion). The realised wicket cost is centred against an expectation from a league-wide dismissal hazard, giving a mean-zero "martingale residual", so players are only charged for deviating from average dismissal behaviour. Empirical-Bayes shrinkage pools thin contexts toward the population. A single "opposition symmetry" puts batting and bowling on the same scale. The abstract reports no quantitative validation and names no code repository. — [arXiv 2608.18020](https://arxiv.org/abs/2608.18020)
  - This closely mirrors Pressure Lab's "net runs above expected + state-based wicket value". The DP/Bellman wicket valuation and the centring of wicket cost against an expected hazard are the two parts worth borrowing directly.
- **Kartikeya Date / ESPNcricinfo xR and xW (Oct 2024, Test cricket).** Uses ESPNcricinfo's ball-by-ball shot-type and *control* records. No ball tracking. The author says trajectory would be ideal but treats bowling-style categories as a "usable proxy". Features: bowling style, batting hand, shot type, false-shot frequency. Outputs per-ball xR and xW, and "expected average" = xR/xW. Example: Bumrah's career expected average of 20.8 vs his actual 20.51. Australia 2020-21 expected average 37.0 vs actual 29.3 (luck). The author explicitly warns that finer categories leave too few balls per cell and cautions against ever-more-elaborate categories. — [ESPN, "How lucky were India…" (2024)](https://africa.espn.com/cricket/story/_/id/41970645/how-lucky-were-india-their-last-tour-australia-statistical-model-tells-us)
- **Control metrics definitions.** ESPNcricinfo's control record is a human coder's judgement after each ball. A play-and-miss or an edge counts as not in control. The derived metrics are balls per false shot, false shots per dismissal, and runs per false shot. — [Pitchvision summary](https://cdn6.pitchvision.com/quick-tip-measure-control-to-score-more-runs); [ESPN control/luck WC review](https://africa.espn.com/cricket/story/_/id/39108772/luck-got-do-control-review-world-cup); [Kartikeya Date, Control FAQ](https://cricketingview.substack.com/p/control-faq). (Search snippets; the FAQ was not opened.)
- **Dan Weston, "False Shots & Expected Wickets in the IPL" (Sept 2024).** Builds xW from false shots for IPL teams and players, framed as luck. The methodology is paywalled and was not verified. — [Dan's Newsletter](https://danweston.substack.com/p/false-shots-and-expected-wickets)
- **Third-party xW from state only.** One analyst's xW uses balls remaining, wickets in hand and scoring rate at the start of the delivery (search-snippet summary of a Substack). — [cricketingview RAAR post](https://cricketingview.substack.com/p/runs-above-average-replacement-raar)
- **Opta Next Ball Predictor (Stats Perform, Oct 2022, updated 2025).** A multilayer feed-forward neural network, tuned per format, that outputs per-ball outcome probabilities (dot, runs, 4, 6, wicket). Features: (i) pre-game: home advantage plus six *hierarchical Bayesian ratings* per format (batter SR, bowler economy, venue economy, batter balls-per-out, bowler wickets-per-ball, venue wickets-per-ball, all scaled 0–1) and boundary share; (ii) in-game performance relative to pre-game expectation (live pitch behaviour); (iii) match situation (RRR, balls remaining). No ball tracking is mentioned and no calibration metrics are published. Example wicket probability 3.4%, dot 53.7%. — [Opta Analyst](https://theanalyst.com/articles/opta-next-ball-predictor)
- **CricViz.** No public methodology for xR/xW was found. Search results only confirm WinViz (a Test model built on the last 500 Tests). Treat CricViz Hawk-Eye-based xW/xR claims as proprietary and unverified. — [r-bloggers WPA post (mentions CricViz)](https://www.r-bloggers.com/2020/06/twenty20-win-probability-added/)
- **What ball tracking adds (inference from the Date article, plus a 2026 student paper).** Date names delivery trajectory as the ideal input that bowling style only approximates. A 2026 student paper ("Does good length outside off really work?") studies IPL wickets using ball-tracking line/length (title only seen). — [NHSJS PDF](https://nhsjs.com/wp-content/uploads/2026/06/Does-Good-Length-Outside-Off-Really-Work-A-Ball-Tracking-Study-of-Wickets-in-the-IPL.pdf)
- **Low-quality / unverified:** "Hybrid xR Engine" (Anhad Jaj) blends a physics "fuzzy prior" with history using Bühlmann credibility w(n)=n/(n+K), K=250, EV = xR − 8·xW, plus PPO and K-means personas. No data description, no calibration, no code. Flag as unverified hobby work, though the credibility-weighting idea is standard. — [hybrid-xr.onrender.com](https://hybrid-xr.onrender.com/)

### Inferences
- Without tracking data, the features with documented value are game state (over-level, not just phase; wickets; innings; RRR/target), batter and bowler identity (shrunk), bowling type × batting hand (platoon), venue, and live match/pitch form (Opta's in-game deviation). Pressure Lab lacks venue and an in-match pitch-form term. Adding a venue random effect and an "innings-so-far scoring vs expectation" covariate are cheap wins.
- Replacing phase with over number (spline or one-hot over) in the state GLM is consistent with Rafique's critique.
- Control/false-shot data are the main non-tracking signal Pressure Lab lacks. Cricsheet has no control field, so the xW model must rely on state and identity alone.

### Gaps
- No public CricViz xR/xW methodology, feature list or calibration was found.
- No published head-to-head comparison of xR/xW accuracy with vs without Hawk-Eye.
- I did not find quantitative feature-importance results (e.g., SHAP from a GBM per-ball model) in a peer-reviewed cricket paper.

## 2. Multinomial / ordinal ball-outcome models vs separate Poisson + logistic

### Takeaway
The academic standard for T20 ball simulation is a single multinomial over {0,1,2,3,4,(5),6,W}, with player baselines and multiplicative state factors (Swartz and colleagues). One 2026 paper reports that such a per-ball distribution matches empirical frequencies closely (TV distance ≤ 0.02) even when the downstream win probabilities are miscalibrated. Separate Poisson (runs) and logistic (wicket) models ignore the run/wicket trade-off (aggression raises both). They also mis-specify runs, whose distribution is lumpy at 0/1/4/6 and not Poisson. I found no direct published calibration comparison between multinomial and Poisson+logistic models for cricket.

### Cited Findings
- **Davis, Perera & Swartz, "A Simulator for Twenty20 Cricket" (SFU; Australian & NZ J. Stat., c. 2015).** Eight outcomes (0–6 runs and dismissal), multinomial. Probabilities depend on batsman, bowler, overs consumed and wickets lost. Model structure: p(outcome j | batsman i, over o, wickets w) ∝ τ_owj · p_i70j. The batsman baseline p_i70j is defined at the reference state (over 7, 0 wickets), and the τ_owj are multiplicative state factors, estimated first (profile-likelihood-like two-step). Batsman baselines get a Dirichlet(a_0..a_7) prior with empirical-Bayes hyperparameters a_j = c × pooled rate. The authors chose c = 60 (results were insensitive for c ∈ (50,80)). c acts like a prior sample size of about 60 balls, and was chosen "substantially greater than zero" because of batters with limited histories. Fitting is Metropolis-within-Gibbs. Extensions cover specific batsman/bowler matchups, home advantage, and second-innings target-dependent aggression. Validation was by goodness-of-fit diagnostics. — [Davis, Perera & Swartz (PDF)](https://www.sfu.ca/~tswartz/papers/t20sim.pdf)
- Earlier ODI work (Swartz, Gill & Muthukumarana 2009, Canadian J. Stat. 37) used a Bayesian latent-variable model for batting outcome probabilities, criticised for coarse 9-category state. — cited within [Davis et al.](https://www.sfu.ca/~tswartz/papers/t20sim.pdf)
- **Ganesh, arXiv 2604.13861 (Apr 2026, submitted to JQAS).** 1,161 IPL matches 2008–2025 from Cricsheet via `yorkr`, about 264.8k legal balls. Outcomes Ω={W,0,1,2,3,4,6} (5s dropped, <0.1%). Phase-specific player outcome vectors with Laplace (+1) smoothing, then shrinkage p_i = λ·p̂_i + (1−λ)·p̄_phase with λ = n/(n+50). No matchup or bowler-type term. No out-of-sample calibration. Code: github.com/tvganesh/T20-MDP-optimisation. — [arXiv 2604.13861v2](https://arxiv.org/html/2604.13861v2)
- **"The Calibration-Leverage Tradeoff in Exactly Solvable Win-Probability Models" (arXiv 2608.14696, 2026).** Second-innings Markov model built from one per-ball distribution over runs 0–6 + W. The per-ball distribution matches the empirical one with total variation ≤ 0.02 at each RRR, yet the resulting win probabilities are miscalibrated. The authors rule out tail-thinning and marginal mis-estimation. (Search snippet only; full paper not read.) — [arXiv 2608.14696](https://arxiv.org/pdf/2608.14696)
- **Opta** uses a single neural network that outputs the full outcome distribution, not separate run and wicket models. — [Opta Analyst](https://theanalyst.com/articles/opta-next-ball-predictor)
- A public prediction-engine site uses an XGBoost multi-class classifier on Cricsheet with 6 classes (dot, single, double, boundary, six, wicket). It is unreviewed. — [cricket-website.pages.dev](https://cricket-website.pages.dev/prediction-engine)

### Inferences
- Recommended upgrade: fit one multinomial-logit model (or a GBM with softmax objective such as LightGBM/XGBoost `multi:softprob`) over {0,1,2,3,4,6,W}, with the same state, tier and Elo covariates. Then xR = Σ k·p_k (plus extras handled separately) and xW = p_W, which are coherent by construction. Compare with the current Poisson+logit on held-out seasons using multiclass log loss, Brier score and reliability diagrams (per-class and for p_W). Ordinal models are a poor fit because W is not on the run scale. A two-part "W vs not-W (logit), then ordinal/multinomial runs | not-W" hurdle is an alternative.
- The Swartz τ_owj × player-baseline factorisation is a good template for Pressure Lab: state multipliers are estimated on all data, and player deviations are a Dirichlet-shrunk baseline with a prior of about 50–60 balls.
- The 2608.14696 result suggests a warning: good per-ball calibration does not guarantee calibrated aggregate WP or pressure metrics. Validate the aggregate outputs too.

### Gaps
- No published cricket study directly compares multinomial vs Poisson+logistic calibration. Pressure Lab would have to run this test itself.
- I could not verify the journal/year of the Davis et al. paper from the PDF itself (c. 2015 by its references to the 2014 World Cup).

## 3. Batter-vs-bowler matchups with sparse data: hierarchical Bayes, latent factors, embeddings, shrinkage

### Takeaway
Raw batter-vs-bowler or cell-level ratios with <20 balls are noise. The literature's tools are: (1) Dirichlet/Beta empirical-Bayes shrinkage with a prior of roughly 50–60 balls (Swartz c=60; Ganesh n/(n+50); credibility n/(n+K)); (2) hierarchical log5-style models, where the matchup effect = batter effect + bowler effect + small shrunk interaction (Doo & Kim baseball template); (3) latent-factor or embedding models (CRICTRS head-to-head embeddings, Siamese team embeddings, Stats Perform patent with frequency-weighted blending to global average). A tensor decomposition over (bowler, batter, phase) is proposed but not yet implemented in public cricket work.

### Cited Findings
- **Davis/Perera/Swartz** extend their simulator to specific batsman/bowler matchups, and estimates "borrow information from related scenarios". — [SFU PDF](https://www.sfu.ca/~tswartz/papers/t20sim.pdf)
- **Doo & Kim (2018, PLOS ONE), "Modeling the probability of a batter/pitcher matchup event: A Bayesian approach."** A hierarchical Bayesian log5 model for batter/pitcher matchups. It is the closest methodological template for cricket. — [PMC6192592](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC6192592/)
- **CRICTRS (arXiv 2010.15607, 2020).** Level-1 embedding: index i = a batter's performance vs bowler i. Level-2 embeddings represent batters by the bowlers they dominate and vice versa. Used for semi-supervised team recommendation. — [arXiv 2010.15607](https://arxiv.org/pdf/2010.15607)
- **IIT Madras (arXiv 2108.07139, 2021).** Siamese network learns 64-d player embeddings, mean-pooled into team batting/bowling representations to predict innings outcomes. — [arXiv 2108.07139](https://arxiv.org/pdf/2108.07139)
- **Stats Perform/Stats LLC patent (US11715303B2).** Personalised batter and bowler embeddings plus an LSTM over delivery sequence to predict shot type. Players with limited history (e.g., <500 deliveries) are blended with the global average, weighted by deliveries. The patent claims no prior personalised cricket shot prediction work (self-claim). — [Google Patents US11715303](https://patents.google.com/patent/US11715303)
- **Baseball analogue:** Heaton & Mitra (arXiv 2109.05280) learn batter/pitcher embeddings from at-bats with contrastive learning. — [arXiv 2109.05280](https://arxiv.org/pdf/2109.05280)
- **Ganesh (2026)** names a tensor decomposition over (bowler, batsman, phase) as future work. — [arXiv 2604.13861v2](https://arxiv.org/html/2604.13861v2)
- **Matchup evidence:** An LJMU study of leg/off/orthodox/unorthodox spin concludes that certain bowler-batter match-ups give tactical advantages in T20 (frequentist). — [LJMU PDF](https://researchonline.ljmu.ac.uk/id/eprint/27042/1/Leg%20Spin%20or%20Off%20Spin%20Orthodox%20or%20Unorthodox%20An%20In%20Depth%20Examination%20of%20Bowling.pdf)
- **Quantile regression with a Bayesian extension** for T20I bowling effectiveness (J. Sports Analytics). — [JSA-200556](https://dx.doi.org/10.3233/JSA-200556)
- **Kartikeya Date's caution:** finer categories leave too few deliveries per cell. — [ESPN 2024](https://africa.espn.com/cricket/story/_/id/41970645/how-lucky-were-india-their-last-tour-australia-statistical-model-tells-us)
- A commercial betting page's "2.4x dismissal multiplier" for matchups has no methodology. Unreliable. — [pillarlab](https://pillarlab-web.pages.dev/pillars/batter-vs-bowler-matchup-matrix)

### Inferences (concrete fixes for the <20-ball heatmap)
- **Gamma-Poisson / Beta-Binomial shrinkage of each heatmap cell.** For a batter × bowler-type × phase cell with actual runs R and expected runs E (from the GLM), report the posterior ratio (R + k)/(E + k), where k ≈ expected runs in about 50–60 balls (Swartz c=60; Ganesh 50). Do the same for wickets with a Beta/Gamma prior. Show credible intervals and grey out cells whose interval spans 1.
- **Hierarchical shrinkage targets.** Shrink a cell toward the batter's overall ratio (not toward 1), and that toward the batting-order/role cohort. This is partial pooling through the hierarchy batter → bowler-type → phase, and can be done with a mixed-effects Poisson GLM: `runs ~ state + offset(log E) + (1|batter) + (1|batter:bowltype) + (1|batter:bowltype:phase)` in lme4/glmmTMB/brms or statsmodels BayesMixedGLM.
- **Matchup arena:** model log-rate = batter_i + bowler_j + u_iᵀv_j (low-rank interaction, rank 2–4, L2-regularised). This is collaborative filtering on the batter × bowler residual matrix and lets sparse pairs borrow from similar players. With bowling type known, put bowler-type in v_j as a side feature (factorisation machine).

### Gaps
- No peer-reviewed cricket paper evaluates matrix factorisation or embeddings against simple shrinkage for out-of-sample matchup prediction. The relative gain is unknown.
- I did not open the Doo & Kim paper to extract its prior structure.

## 4. Phase/role specialists, intent/control, dot-ball pressure and its downstream effect on dismissals

### Takeaway
"Pressure builds through dot balls, which leads to wickets" is widely asserted but weakly evidenced. I found no peer-reviewed T20 study that isolates the effect of preceding dots on dismissal hazard. One small Test-cricket blog analysis found little effect. Control/false-shot data (human-coded, ESPNcricinfo) are the best public intent proxy, and Cricsheet lacks them. Pressure Lab can test the dot-ball hypothesis itself by adding "dots in last k balls" and "balls since last boundary" to the wicket model and checking for a positive coefficient after controlling for state and bowler quality.

### Cited Findings
- A Roar blog analysis (Test cricket, one Ashes series) found dot-ball share barely changed expected wicket rates between 50% and 90% dots. Only the 90%+ bucket changed sharply (fewer wickets). Small sample. — [The Roar](https://www.theroar.com.au/?p=234334)
- A PLOS ONE study of 712 Tests found no change in dismissal probability around the "nervous nineties", which is evidence against simple psychological-pressure effects on dismissal hazard. — [PLOS ONE 10.1371/journal.pone.0287700](https://doi.org/10.1371/journal.pone.0287700)
- Wisden (IPL 2025): bowlers in T20 "can't go searching for wickets" (Badree). Defensive bowling yields wickets "thanks to the amount of risk batters take of their own accord". This is practitioner opinion. — [Wisden](https://www.wisden.com/series/ipl-2025/cricket-features/the-20-over-death-why-bowlers-must-forget-about-wickets-to-hit-back-in-the-ipl)
- The Swartz simulator models second-innings aggression as a function of target. Validation suggested teams falling behind do not raise aggression incrementally. — [SFU PDF](https://www.sfu.ca/~tswartz/papers/t20sim.pdf)
- Phase-specific player outcome vectors with shrinkage (PP 0–5, middle 6–14, death 15–19). — [Ganesh 2026](https://arxiv.org/html/2604.13861v2)
- Control metrics: balls per false shot, false shots per dismissal, runs per false shot (ESPNcricinfo). — [ESPN WC review](https://africa.espn.com/cricket/story/_/id/39108772/luck-got-do-control-review-world-cup)
- ESPNcricinfo analysis of how many boundaries a T20 team should attempt ("more than you might think") is relevant to intent and risk (not opened). — [ESPNcricinfo](https://www.espncricinfo.com/ci/content/story/1240901.html)

### Inferences
- Without control data, intent can be proxied from outcomes: boundary% and dot% relative to expected (from the multinomial), plus the run-vs-wicket trade-off estimated per batter (an "aggression" latent, as in Swartz's target-driven aggression).
- Role-specific models: add batter-role (opener/anchor/finisher) × phase interactions, or fit phase-specific player random effects. The shrinkage target for death specialists should be the death-phase cohort mean, not the league mean.

### Gaps
- No rigorous dot-ball → dismissal causal study was found for T20 (selection bias: good bowlers cause both dots and wickets).
- CricViz "control %" and false-shot definitions with Hawk-Eye were not found publicly.

## 5. Open datasets and code

### Takeaway
Cricsheet (free ball-by-ball JSON/YAML/CSV) is the shared base. `cricketdata` (R, used by cricWAR) and `yorkr` (R, Ganesh) wrap it. Public xR implementations are cricWAR (open source) and Ganesh's MDP repo. Most GitHub/Kaggle "xR" projects actually predict team totals.

### Cited Findings
- cricWAR is open-source and reproducible on `cricketdata` (R) ball-by-ball data. — [Rafique PDF](https://www.stat.cmu.edu/cmsac/conference/2022/assets/pdf/HassanRafique.pdf)
- Ganesh's code: github.com/tvganesh/T20-MDP-optimisation, data from Cricsheet via `yorkr`. — [arXiv 2604.13861v2](https://arxiv.org/html/2604.13861v2)
- swarnava-96 "Men's T20 Cricket Runs Predictor": Cricsheet YAML → XGBoost for first-innings totals (R² 0.987, MAE 1.67, self-reported). This is not a per-ball model. — [GitHub](https://github.com/swarnava-96/Men-s-T20-Cricket-Runs-Predictor)
- XGBoost 6-class per-ball classifier on Cricsheet (unreviewed site). — [cricket-website.pages.dev](https://cricket-website.pages.dev/prediction-engine/how-it-works)
- Cricsheet data source — [cricsheet.org](https://cricsheet.org/)

### Inferences
- Pressure Lab can benchmark its GLMs against cricWAR-style over×wicket expected runs as a baseline. The multinomial upgrade can be validated on the same Cricsheet IPL/T20I data with season-based holdout.

### Gaps
- I found no open-source per-ball xW model with published calibration. No Kaggle notebook on per-ball xR with calibration was verified.
