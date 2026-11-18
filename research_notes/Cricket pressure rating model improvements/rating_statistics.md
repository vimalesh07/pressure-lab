# Statistical machinery for player ratings under small samples and opponent effects (applied to Pressure Lab)

Scope: methods that could replace or extend Pressure Lab's current pipeline. That pipeline does empirical-Bayes (EB) shrinkage per component, then reliability-weighted composites, a 100·Φ(z/2) mapping, a match bootstrap, and opponent adjustment only through expected-runs and expected-wicket GLMs. The data is IPL + T20I ball-by-ball from 2022 to 2026, about 250k balls. Each "Cited Findings" bullet carries its source. The cost estimates and the Pressure Lab mappings under "Inferences" are my own reasoning and are not sourced.

---

## 1. Bayesian hierarchical / multilevel models vs empirical-Bayes shrinkage; published cricket examples

### Takeaway
Pressure Lab's EB shrinkage is the classic Efron–Morris / James–Stein estimator. A full hierarchical model gives the same partial pooling, plus three things EB lacks: it propagates uncertainty in the prior (hyper)parameters, it pools across structured groups (role, competition, era), and it gives posterior distributions for ranks directly. Cricket has peer-reviewed Bayesian batting models (Stevenson & Brewer 2017 and 2021, Swartz group 2009–2015), but none targets T20 "pressure" specifically.

### Cited Findings
- **Efron & Morris (1975), "Data Analysis Using Stein's Estimator and Its Generalizations"** (JASA 70(350):311–319) is the canonical sports demonstration of shrinkage. It used the batting averages of 18 MLB players after their first 45 at-bats in 1970 to predict their rest-of-season averages. The shrunken estimates beat the raw averages on sum of squared error. The paper deliberately included an extreme player (Clemente) to stress-test the method. — [Efron & Morris 1975 PDF](https://www.medicine.mcgill.ca/epidemiology/hanley/bios602/MultilevelData/EfronMorrisJASA1975.pdf). The data ships as `pscl::EfronMorris` in R and `efron_morris75` in TFDS. — [pscl docs](https://search.r-project.org/CRAN/refmans/pscl/html/EfronMorris.html); [TFDS](https://www.tensorflow.org/datasets/catalog/efron_morris75)
  - One secondary source says the James–Stein shrinkage in this example is about 80%. A blog claim of a ~65% reduction in squared error could not be verified and looks illustrative, so do not use it. — [Efron & Morris reading](https://faculty.ucmerced.edu/jvevea/classes/290_21/readings/week%204/Efron%20and%20Morris.pdf); [metricgate (unverified)](https://metricgate.com/docs/hierarchical-beta-binomial-baseball/)
- **Stevenson & Brewer (2017), "Bayesian survival analysis of batsmen in Test cricket"** (JQAS 13(1):25–36) models batting ability as a function of the batter's current score within an innings. It finds that most players start an innings at only a quarter to a half of their "eased-in" ability. It also builds a hierarchical model for New Zealand opening batsmen. — [arXiv 1609.04078](https://arxiv.org/abs/1609.04078); [RePEc JQAS](https://econpapers.repec.org/RePEc:bpj:jqsprt:v:13:y:2017:i:1:p:25-36:n:3)
- **Stevenson & Brewer (2021), "Finding your feet: A Gaussian process model for estimating the abilities of batsmen in Test cricket"** (JRSS C 70(2):481–506) models career trajectories with a Gaussian process. It captures short-term changes within an innings and long-term changes between innings (age, experience). The authors say it quantifies and predicts ability better than the batting average and the official ICC ratings. — [arXiv 1908.11490](https://arxiv.org/abs/1908.11490v2); [RePEc JRSS C](https://econpapers.repec.org/RePEc:bla:jorssc:v:70:y:2021:i:2:p:481-506)
  - A BAYSM 2018 conference version is fitted with nested sampling. — [arXiv 1903.07218](https://arxiv.org/pdf/1903.07218)
  - A University of Auckland news item says the model estimates Kane Williamson's current ability above his career average. — [NeSI/Auckland item](https://www.nesi.org.nz/node/1329)
- **Swartz group (SFU):**
  - Swartz, Gill & Muthukumarana (2009) built a Bayesian latent-variable model for batting outcome probabilities in ODIs.
  - An earlier paper used a WinBUGS Bayesian log-linear model to simulate ODI batting orders.
  - Davis, Perera & Swartz, "A Simulator for Twenty20 Cricket" (2015), estimates ball-outcome multinomial parameters with a hierarchical Bayesian model for matches between ICC sides.
  - — [T20 simulator PDF](https://www.sfu.ca/~tswartz/papers/t20sim.pdf); [BL catalogue (12 Mar 2015)](https://eld.bl.uk/catalog/100048791298_0x000001)
- **Follow-on Swartz work** includes a T20 "Moneyball" player-evaluation metric based on relative value statistics, with players split into batsmen, bowlers and all-rounders. Another paper does lineup optimisation by simulated annealing. — [moneyball.pdf](https://www.sfu.ca/~tswartz/papers/moneyball.pdf); [lineups.pdf](https://www.sfu.ca/~tswartz/papers/lineups.pdf)
- **Industry example of a full move from penalized mixed models to full Bayes.** Baseball Prospectus' Deserved Run Average (DRA, 2015) was first fitted with `lme4::lmer`. It had random intercepts for batter, pitcher, catcher and umpire, and fixed effects for park, temperature and game state. BP argued that players belong in the random effects because they are draws from an effectively unlimited population of abilities. — [BP DRA methodology 2015](https://baseballprospectus.com/?p=29118); [Introducing DRA](https://www.baseballprospectus.com/news/article/26195/prospectus-feature-introducing-deserved-run-average-draand-all-its-friends/)
  - The model later grew from one linear mixed model to 24 event-specific models. — [BP DRA in-depth](https://www.baseballprospectus.com/news/article/28121/best-of-bp-2015-dra-an-in-depth-discussion)
  - By 2021 it had been converted from lme4 (penalized optimisation) to Stan (fully Bayesian). — [BP Deserved stats 2021](https://www.baseballprospectus.com/news/article/66474/deserved-stats-for-the-2021-season/)

### Inferences
- **Recommended structure for Pressure Lab** (my proposal): one ball-level model per outcome (runs as Poisson or ordinal 0/1/2/3/4/6; wicket as Bernoulli) with these terms:
  - fixed effects for phase × over, wickets in hand, target/required rate, venue, innings, competition and season;
  - batter and bowler random intercepts;
  - a batter × pressure random slope and a bowler × pressure random slope.

  The pressure slope is the quantity Pressure Lab's noisy "pressure − normal delta" is trying to estimate. A random slope partially pools each player's delta toward the population delta *jointly* with their overall level. It handles the delta's noise far better than differencing two separately-shrunk rates. Grouping players by role (opener, finisher, pace, spin) can enter as a fixed effect on the random-effect mean. That is partial pooling "by role" rather than toward one global mean.
- EB with method-of-moments prior strength treats the prior variance as known. When the true-talent SD is small relative to the noise (likely for pressure deltas), this understates uncertainty and can give unstable or zero prior-variance estimates. A hierarchical model integrates over that variance.
- **Rough cost on ~250k balls** (my estimate, not benchmarked):
  - `lme4::glmer` or `glmmTMB` with two crossed random intercepts and one random slope each: minutes on a laptop.
  - Stan/PyMC NUTS on 250k Bernoulli/Poisson rows with ~1–2k player effects: typically 30 min to a few hours for 4 chains.
  - Aggregating to sufficient statistics (batter × bowler × context-cell counts) can cut rows by 10× or more and is the main speed lever.

### Gaps
- I found no published Bayesian *bowling* model by Stevenson & Brewer. Their papers are batting/Test-focused.
- I found no peer-reviewed hierarchical model of T20 *pressure* or clutch performance. The full model specification of the Swartz T20 simulator (exact batter/bowler parameterisation) was not retrieved.

---

## 2. Simultaneous adjustment for teammates and opponents (RAPM, crossed random effects, Bradley–Terry, Elo/Glicko/TrueSkill/WHR)

### Takeaway
The cleanest opponent adjustment for cricket is a model that is additive in batter and bowler effects (with context covariates), fitted jointly. Ridge or random effects shrink the estimates. RAPM-style ridge is the same idea from the frequentist side, with λ chosen by out-of-sample prediction. Rating systems (Elo, Glicko, TrueSkill, WHR) add time dynamics. Smoothing versions (WHR, TrueSkill Through Time) beat filtering versions (Elo, Glicko, TrueSkill) on prediction, at higher cost.

### Cited Findings
- **RAPM.** Joe Sill, "Improved NBA Adjusted +/- Using Regularization and Out-of-Sample Testing" (MIT Sloan 2010), replaced OLS adjusted plus-minus with ridge regression. He framed ridge as a Bayesian prior on reasonable coefficient ranges and evaluated models on games not used in training. He reported that this nearly doubles APM's accuracy. — [Sill 2010 PDF](https://supermariogiacomazzo.github.io/STOR538_WEBSITE/Articles/Basketball/Basketball_Sill.pdf); [Sloan page](https://www.sloansportsconference.com/research-papers/improved-nba-adjusted-using-regularization-and-out-of-sample-testing); [Wikipedia APM](https://en.wikipedia.org/wiki/Adjusted_Plus_Minus)
  - Extensions exist for the NHL (ridge on goals, shots, Fenwick, Corsi). — [arXiv 1201.0317](https://arxiv.org/pdf/1201.0317)
  - Extensions exist for soccer. — [arXiv 1706.04943](https://arxiv.org/pdf/1706.04943)
  - A soccer extension uses FIFA ratings as informative priors. — [ar5iv 1810.08032](https://ar5iv.org/html/1810.08032)
  - A 2026 "Lineup RAPM" uses informed priors. — [arXiv 2601.15000](https://arxiv.org/pdf/2601.15000)
- **Cricket additive batter–bowler model.** An arXiv T20 paper models expected runs as intercept + batter rating a_i − bowler rating b_j + error, which explicitly adjusts for strong and weak opponents. — [arXiv 2209.06346](https://arxiv.org/pdf/2209.06346)
- **cricWAR (Rafique, CMSAC 2022)** computes runs above average, VORP and WAR for limited-overs cricket from ball-by-ball data. It uses a runs-conservation rule: the bowler is credited with the negative of the batter's run value on each ball. Its published results cover IPL 2019. — [Rafique cricWAR PDF](https://www.stat.cmu.edu/cmsac/conference/2022/assets/pdf/HassanRafique.pdf); [Sloan listing](https://www.sloansportsconference.com/research-papers/cricwar-a-reproducible-system-for-evaluating-player-performance-in-limited-overs-cricket)
- **Mixed models in T20 practice.** A public analysis ("The Real T20 Batting Performance Rankings") regresses log skill ratio on competition fixed effects and batter random effects. The data is batter-competition samples weighted by balls faced, since 2021, for 511 batters with ≥10 balls in at least two competitions. Its baseline is weighted by competition, year, phase and pace/spin. The post reports no out-of-sample validation. — [arnavj Substack](https://arnavj.substack.com/p/the-real-t20-batting-performance)
- **Whole-History Rating (Coulom 2008)** is a dynamic Bradley–Terry model. It computes the exact MAP over every player's entire rating history instead of updating incrementally. Coulom reports better prediction than Elo, Glicko, TrueSkill and decayed-history methods, at higher computational cost that is still fast enough for large online servers. — [WHR PDF](https://www.remi-coulom.fr/WHR/WHR.pdf); [HAL inria-00323349](https://hal.archives-ouvertes.fr/inria-00323349)
- **TrueSkill Through Time** (Dangauthier, Herbrich, Minka, Graepel; NIPS 2007, pub. 2008) infers a player's whole skill time series by *smoothing* rather than filtering. — [NIPS2007 PDF](https://microsoft.com/en-us/research/wp-content/uploads/2008/01/NIPS2007_0931.pdf)
  - A later paper argues that filtering methods propagate information incompletely and give poor initial estimates. — [arXiv 2101.00400](https://pdf.arxiv.org/pdf/2101.00400)
- **Glicko-2** adds a volatility parameter: the expected degree of fluctuation in a player's rating. One arXiv source calls Glicko-2 flawed, but I could not see its reasoning. — [arXiv 2101.00400](https://pdf.arxiv.org/pdf/2101.00400) (context from search snippet)
- **Per-delivery Elo for cricket** exists in the `bouncer` R package. Each ball has three actors (batter, bowler, venue). — [In The Game](https://inthegame-blog.pages.dev/cricket/) (via search summary; not fetched)

### Inferences
- **Option A (cheapest, strongest gain): a crossed random-effects GLMM.** Ball outcome ~ context + (1 + pressure | batter) + (1 + pressure | bowler) + (1 | venue) + competition × season. One fit replaces Pressure Lab's two-stage approach (xR/xW GLM with opponent tier, then per-player residual shrinkage). It adjusts every batter for the actual bowlers faced, and vice versa, rather than for a coarse "opponent tier" plus a team Elo offset.
  - Team Elo becomes redundant for player ratings, since opponent quality is the bowlers' random effects themselves.
  - It is roughly equivalent to RAPM with a player-specific ridge penalty learned from the data (REML variance components).
  - Cost: minutes.
- **Option B: ridge/RAPM in Python.** A sparse one-hot design (batter + bowler + context), `sklearn.linear_model.Ridge` or `glum` with Poisson/logistic loss, and λ tuned on held-out matches. Cost: seconds. It does not easily give uncertainty, so a bootstrap is still needed.
- **Batter × bowler crossed interaction** (a matchup random effect) will be extremely sparse. Most pairs face fewer than 20 balls in 2022–2026. Only a heavily shrunk random effect is defensible. Its main use is matchup display, not the rating itself.
- **WHR or TrueSkill Through Time at player level:** worth considering only if Pressure Lab wants a single time-varying "skill" track. For multi-component ratings, a GLMM with time-varying effects (Q3) is more natural. Elo and Glicko filtering is inferior for retrospective ratings: smoothing uses future data to correct past estimates.

### Gaps
- I retrieved no published validation comparing cricket opponent-adjusted ratings (GLMM or RAPM) against unadjusted ones out of sample.
- The cricWAR PDF was not machine-readable, so its xR model covariates and any reliability statistics are unverified.

---

## 3. Time weighting / recency, aging curves, era and competition-level adjustment

### Takeaway
Use explicit time structure, such as season-level random walks or GP effects (as in Stevenson & Brewer), or at minimum exponential decay weights tuned by prediction. Add competition (IPL, T20I tiers) and season fixed effects inside the same model. For aging, the delta method is standard but has a debated survivor bias. Competition-strength multipliers can be estimated from players who appear in multiple competitions.

### Cited Findings
- **Stevenson & Brewer's GP model** captures ability changes between innings due to age and experience in different match conditions. It is a published template for a time-varying cricket ability. — [arXiv 1908.11490](https://arxiv.org/abs/1908.11490v2)
- **WHR (dynamic Bradley–Terry)** models each player's strength as a Wiener process in time. TrueSkill Through Time smooths skill across time. Both are principled alternatives to ad-hoc decay. — [WHR PDF](https://www.remi-coulom.fr/WHR/WHR.pdf); [TTT NIPS2007](https://microsoft.com/en-us/research/wp-content/uploads/2008/01/NIPS2007_0931.pdf)
- **Glicko-2's volatility parameter** models how much a rating is expected to fluctuate. — [arXiv 2101.00400](https://pdf.arxiv.org/pdf/2101.00400)
- **Aging, delta method.** Next-season change is modelled as a function of age and last season's value, and chaining the changes gives a curve. The method is credited to Tom Tango and Mitchel Lichtman. — [arXiv 2210.02383](https://arxiv.org/html/2210.02383v3)
  - Critics argue that survivor bias makes the delta method overstate aging effects. Lichtman's correction relies on an assumed replacement level. — [BP critique](https://www.baseballprospectus.com/?p=59491)
  - A BP simulation finds little survivor bias under a mixture-distribution scenario, but real bias under truncation. — [BP](https://baseballprospectus.com/?p=59972)
  - A 2022 arXiv paper uses multiple imputation of missing player-seasons to handle dropout. — [arXiv 2210.02383](https://arxiv.org/html/2210.02383v3)
- **Competition translation in T20.**
  - A mixed model with competition fixed effects gives multiplicative weights. In that analysis IPL was 21.12% "harder" than the BPL and 2.5% above "T20I top 6", and the LPL and BPL fell below "T20I bottom six".
  - The author acknowledges two confounded explanations: higher bowling quality versus high scoring compressing relative skill.
  - — [arnavj Substack](https://arnavj.substack.com/p/the-real-t20-batting-performance)
- **Changing league variance matters for regression.** A FanGraphs/THT piece shows that the amount of regression to the mean depends on the spread of talent in the league, which changes over time. — [THT: Regression with changing talent levels](https://tht.fangraphs.com/regression-with-changing-talent-levels-the-effects-of-variance/)

### Inferences
- **Concrete options for Pressure Lab, in order of complexity:**
  1. **Season fixed effects + competition fixed effects** (IPL, T20I full members, T20I associates) in the xR/xW model or the GLMM. This absorbs era drift such as IPL scoring inflation from 2023 (Impact Player rule) without hand tuning. Cost: negligible.
  2. **Exponential decay weights** w = exp(−Δt/τ), with τ (e.g. 1–3 seasons) chosen by maximising next-season log-likelihood or Spearman correlation. Use the weights as case weights in the GLMM or EB. Effective n then shrinks, so recompute the prior strength and reliability with weighted n.
  3. **Player × season random walk:** θ_{p,s} = θ_{p,s−1} + ε, with ε ~ N(0, σ_drift²). σ_drift is estimated, so the data decide how fast ratings move (Glicko-volatility-like). In Stan/PyMC this adds ~5 seasons × N players parameters, still tractable on aggregated data (tens of minutes). In `glmmTMB` it can be approximated with an AR1 covariance on season within player.
- **Competition-specific talent SDs:** allow a separate random-effect variance for IPL and T20I, or a competition-specific player offset. Mixing a strong IPL pool with T20I associates otherwise inflates the apparent talent variance, which leads to under-shrinkage.
- **Aging:** with only 5 seasons, a full aging curve is weakly identified. Use a smooth age fixed effect (spline) in the GLMM rather than a delta-method curve. Treat it as a nuisance adjustment, not a headline.

### Gaps
- I found no peer-reviewed cricket-specific league translation factors (IPL ↔ T20I ↔ domestic); only blog analyses.
- I found no published T20 aging curve with survivor-bias correction.

---

## 4. Reliability and stabilisation (split-half, KR-20/alpha, stabilisation points, eligibility thresholds, component weighting)

### Takeaway
Reliability = true-talent variance / observed variance, and it is the same quantity as the EB shrinkage factor n/(n+k). The "stabilisation point" is the n at which reliability = 0.5, which equals the prior strength k. Pressure Lab's split-half + Spearman–Brown is legitimate, but it must be stepped up to the *full* sample size to avoid halving thresholds. Component weights are better learned by predicting future outcomes than set as prior weights × reliability.

### Cited Findings
- **Russell Carleton ("Pizza Cutter")** introduced stabilisation analysis. He split each player's PAs into even and odd groups and correlated the halves. Reliability is defined as talent variance / observed variance, and curves are summarised by the n at which reliability crosses 0.5. — [Retrosheet research summary (Pavitt)](https://www.retrosheet.org/resources/retrosheet-a-c.pdf); [FanGraphs: A New Way to Look at Sample Size](https://blogs.fangraphs.com/a-new-way-to-look-at-sample-size)
  - Alternatives include ICC, KR-20/KR-21 and Cronbach's alpha. A critique argues that Carleton's second article treated the split-half correlation at n/2 as reliability at n, while KR-21/alpha give full-sample reliability, so the thresholds may be off by a factor of two. — [Retrosheet/Pavitt](https://retrosheet.org/Research/Pavitt/retrosheet-a-c.pdf)
  - Carleton later used Cronbach's alpha. — [FanGraphs: Randomness, Stabilization, & Regression](https://blogs.fangraphs.com/randomness-stabilization-regression) (page returned 403; cited via search summary)
- **There is no single point at which a stat "becomes stable".** Each additional PA/BIP increases reliability continuously. — [FanGraphs: A New Way to Look at Sample Size](https://blogs.fangraphs.com/a-new-way-to-look-at-sample-size)
- **Replications are noisy.** A Baseball Prospectus update found interval correlations of 0.10–0.15, implying stabilisation figures from 30 to 450 attempts. The author distrusted the weighted average of 94. — [BP p=14215](https://baseballprospectus.com/?p=14215); [BP p=14293](https://www.baseballprospectus.com/?p=14293)
- **Related work:** a reliability analysis of intrinsic batted-ball stats — [THT](https://tht.fangraphs.com/the-reliability-of-intrinsic-batted-ball-statistics/); a 2025 arXiv paper on stabilisation — [arXiv 2510.25961](https://www.arxiv.org/pdf/2510.25961) (not read in full)

### Inferences
- **Key identity** (standard result, consistent with the sources above): if reliability at n balls is R(n) = n/(n+k), then k = n(1−R)/R. The EB shrunk estimate is μ + R(n)·(x̄ − μ). Pressure Lab can check its method-of-moments k against the split-half-derived k. Large disagreement signals model misspecification, for example overdispersion within matches.
- **Spearman–Brown pitfall:** odd/even match split-half r estimates the reliability of *half* the sample. The full-sample reliability is 2r/(1+r). If Pressure Lab multiplies weights by the unstepped r, it under-weights reliable components. That penalty is systematic, so it does not matter for the relative weights if applied uniformly. It does matter for absolute claims.
- **Split-half on matches is noisy with few matches per player** (typical T20 careers in a 5-season window: 20–70 matches). Average over many random match splits (e.g. 200 random half-splits) instead of one odd/even split. Alternatively, compute alpha or ICC from a one-way random-effects ANOVA on per-match values.
- **Eligibility threshold (150/120 pressure balls):** choose it so that R(n_min) ≥ some target (e.g. 0.4–0.5) for the *least* reliable component that carries material weight. Better still, drop hard thresholds once a hierarchical model is in place: show all players with posterior intervals, and filter only the "top 10" display by posterior SD.
- **Composite weights (better than prior × reliability):**
  1. Regress next-season (or held-out-match) outcome, such as runs above expected per ball, on this period's shrunk components. The coefficients are the predictive weights. Fit them by ridge to avoid instability.
  2. PCA/factor analysis on the shrunk components shows whether the components measure one construct. It optimises variance explained, not prediction, so use it as a diagnostic.
  3. In the GLMM approach, the "components" become the random intercept and pressure slope. Their posterior covariance gives the natural combination.

### Gaps
- I found no published stabilisation points for T20 cricket stats (strike rate, dot%, boundary%, wicket rate per ball).
- I could not read Carleton's original articles directly (403 / not retrieved).

---

## 5. Uncertainty quantification: bootstrap vs posterior intervals, rank uncertainty, multiple comparisons in top-10 lists

### Takeaway
A posterior from a hierarchical model gives coherent intervals and rank distributions that already include shrinkage and hyperparameter uncertainty. A match bootstrap of an EB pipeline is a reasonable approximation, but it re-estimates the prior on each resample and can be miscalibrated for small n. Hierarchical models handle the "top-10 list" multiple-comparisons issue through partial pooling rather than Bonferroni-style widening. For ranks, use estimators designed for ranks (Shen & Louis triple-goal) rather than ranking posterior means.

### Cited Findings
- **Gelman, Hill & Yajima (2012), "Why We (Usually) Don't Have to Worry About Multiple Comparisons"** (J. Research on Educational Effectiveness 5(2):189–211) argues that multilevel models address multiple comparisons by partial pooling, which shifts estimates toward each other. Classical corrections instead widen intervals. The multilevel approach is also more efficient, especially when group-level variation is low. — [arXiv 0907.2478](https://arxiv.org/abs/0907.2478); [Columbia PDF](https://sites.stat.columbia.edu/gelman/research/unpublished/multiple2.pdf)
- **Shen & Louis (1998), "Triple-goal estimates in two-stage hierarchical models"** (JRSS B 60(2):455–471) shows that no single set of estimates simultaneously optimises individual estimates, the histogram of true values, and ranks. Posterior means can rank poorly. Their "GR" estimator targets the histogram (G) and ranks (R) via posterior expected rank loss. — [RePEc](https://econpapers.repec.org/RePEc:bla:jorssb:v:60:y:1998:i:2:p:455-471); [IDEAS](https://ideas.repec.org/a/bla/jorssb/v60y1998i2p455-471.html)
  - It is implemented as `HETOP::triple_goal`, which takes posterior draws and returns posterior mean ranks plus integer ranks. — [HETOP docs](https://search.r-project.org/CRAN/refmans/HETOP/html/triple_goal.html)
  - A decision-theoretic follow-up covers ensembles of parameters. — [arXiv 1105.5004](https://arxiv.org/pdf/1105.5004)

### Inferences
- **For Pressure Lab:**
  - From posterior draws (or bootstrap replicates), compute per draw the rank of every player. Report P(rank ≤ 10), the 90% rank interval, and the posterior mean rank. Order the displayed list by triple-goal GR ranks or by P(top 10), not by the point rating.
  - Pressure Lab already does P(top 10). The improvement is to compute it from a joint posterior rather than from a bootstrap of a two-stage estimate.
- **Bootstrap caveats:**
  - Resampling matches keeps within-match dependence (good).
  - Each resample duplicates some matches, which inflates apparent reliability and can understate prior strength k.
  - Recomputing EB on each replicate captures some hyperparameter uncertainty, but not that of the xR/xW GLM unless it is refit per replicate. Check whether the pipeline does.
  - Percentile intervals for shrunken estimates are known to be too narrow at small n. A parametric bootstrap or the full posterior fixes this.
- **The 100·Φ(z/2) display mapping is monotone,** so intervals and ranks transfer directly. It is cosmetic.
- **Top-10 list multiplicity:**
  - With partial pooling, intervals need no Bonferroni correction (Gelman et al.).
  - If labels like "elite" are shown, attach a posterior probability, e.g. P(θ > 90th-percentile talent) > 0.8. That controls a Bayesian false discovery rate: the average (1 − P) over labelled players.
- **Compute:** 1,000 bootstrap refits of a GLMM take ~1,000 × minutes, which is too slow. Alternatives:
  - fit one Stan/PyMC model (4 chains × 1,000 draws gives 4,000 joint draws);
  - use `glmmTMB`/`lme4` conditional modes with their conditional variances plus a parametric bootstrap of ~200;
  - use INLA (fast approximate Bayes) on aggregated counts.

### Gaps
- I found no cricket-specific study comparing bootstrap and posterior interval calibration.

---

## 6. Validating a rating: out-of-sample prediction and calibration

### Takeaway
Validate the way Sill did for RAPM: fit on period t, predict held-out matches or period t+1, and compare models by log-loss or Brier score at ball level, and by Spearman/RMSE at player level. Efron–Morris is the template for comparing "raw vs shrunk vs model" predictions of future performance.

### Cited Findings
- Sill (2010) proposed judging adjusted plus-minus by its ability to predict future games not in the training data. On that criterion ridge nearly doubled accuracy. — [Sill 2010](https://supermariogiacomazzo.github.io/STOR538_WEBSITE/Articles/Basketball/Basketball_Sill.pdf)
- Efron & Morris (1975) validated shrinkage by predicting rest-of-season batting averages from 45 at-bats, scored by total squared error. — [Efron & Morris 1975](https://www.medicine.mcgill.ca/epidemiology/hanley/bios602/MultilevelData/EfronMorrisJASA1975.pdf)
- Stevenson & Brewer (2021) validated by predictive comparison against the batting average and the ICC ratings. — [arXiv 1908.11490](https://arxiv.org/abs/1908.11490v2)
- Coulom (2008) compared WHR to Elo, Glicko, TrueSkill and decayed history on predictive performance. — [WHR PDF](https://www.remi-coulom.fr/WHR/WHR.pdf)
- The public T20 mixed-model ranking reported no out-of-sample validation. This is a common weakness of cricket ratings. — [arnavj Substack](https://arnavj.substack.com/p/the-real-t20-batting-performance)

### Inferences
- **Proposed validation protocol for Pressure Lab:**
  1. **Temporal split:** fit on 2022–2024, predict 2025 (later, roll forward to 2026).
  2. **Ball-level metrics:** log-loss/Brier for wicket and multinomial log-loss for runs on held-out pressure balls. Compare four models: (a) league average + context only; (b) current EB pipeline; (c) GLMM with pressure slopes; (d) GLMM + decay or random walk.
  3. **Player-level metrics:** Spearman correlation and RMSE between the period-t rating and the period-(t+1) observed pressure runs-above-expected per ball, weighted by balls faced. Also correlation with the (t+1) *shrunk* value, to reduce noise on the target side.
  4. **Calibration:** bin players by predicted P(top-10) or by predicted interval, and check coverage. 90% intervals should contain the next-period estimate about 90% of the time, after accounting for next-period noise. For ball-level probabilities, use reliability diagrams by decile.
  5. **Tune hyperparameters on the validation period only:** the decay τ, the eligibility threshold, and the component weights.
- **Incremental value of the pressure component:** test whether adding the pressure slope improves held-out log-loss on pressure balls beyond the player's overall level. If it does not, the pressure-specific rating is mostly noise. That is an important, falsifiable check of the product's core claim.
- **Compute:**
  - each GLMM fit takes minutes, so a 3–4-fold rolling validation finishes in under an hour;
  - full Stan versions take several hours in total;
  - ridge/RAPM variants take seconds, which makes a λ grid search trivial.

### Gaps
- I found no published out-of-sample validation of any T20 *pressure* or clutch rating.
- I found no benchmark timing for GLMMs at ~250k–1M ball rows with crossed effects. The lme4 vignette says scaling in observations and levels is reasonable, and that the bottleneck is the number of top-level (variance) parameters. glmmTMB may be faster for GLMMs with many such parameters, and MixedModels.jl can be much faster. — [lme4 performance vignette](https://cran.r-project.org/web/packages/lme4/vignettes/lmerperf.html); [glmmTMB vignette](https://search.r-project.org/CRAN/packages/glmmTMB/vignettes/glmmTMB.pdf)
  - A 2026 comparison of 7 R GLMM packages found lme4 (Laplace) and glmmTMB fast, but with lower convergence rates and more bias in variance components. — [arXiv 2606.15933](https://arxiv.org/abs/2606.15933) (abstract only)
  - That bias matters here, because the variance components drive shrinkage.
