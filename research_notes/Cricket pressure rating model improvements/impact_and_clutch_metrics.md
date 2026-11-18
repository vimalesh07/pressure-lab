# Player impact, clutch and pressure-performance metrics (cricket and other sports): survey for Pressure Lab

Scope note: compiled 2026-11-18 from about 20 searches and fetches. Primary methodology pages were used where they could be reached. The FanGraphs library returned HTTP 403, so the FanGraphs formulas below come from search snippets of FanGraphs and Baseball-Reference pages; they match the widely documented definitions. CricViz publishes no full methodology, so those claims are flagged as proprietary.

## Q1. Cricket impact systems: what they compute and how

### Takeaway
Every serious cricket impact system works the same way. It builds a state-based expectation (par score, expected runs, or win probability), credits each ball by actual minus expected (or by the change in projection), and converts wickets into runs so batting and bowling share one unit. The public, reproducible versions add three things Pressure Lab does not fully have: a value-function price for dismissals with an expectation-centred wicket charge, an iterative opposition adjustment, and resampling CIs. ESPNcricinfo and CricViz stay proprietary on their weights.

### Cited Findings
**ESPNcricinfo Smart Stats (Superstats, launched 2019)**
- Each ball gets a "pressure-index value" for both batter and bowler. Its inputs are match context (required run rate, wickets in hand), the quality of the batters still to come, and the quality of the bowlers still to bowl. "Each run scored or conceded is multiplied by this pressure-index value." — [ESPN Explainer: how Smart Stats works, 20 Mar 2019](https://www.espn.in/cricket/story/_/id/26312449)
- Smart Wickets weight a wicket by the quality of the batter dismissed and by when the dismissal happened. Smart strike rate = Smart Runs / balls. Player Impact / MVP converts wickets into a run value "so that all numbers are on the same scale". It can be negative, and fielding is excluded. No formulas, weights or replacement level are published (proprietary). — [ESPN Explainer 2019](https://www.espn.in/cricket/story/_/id/26312449)
- Bowling impact reportedly includes "the replacement benefit or cost to the team… if the bowler's performance is replaced with the match average". Example given: in IPL 2013, Gayle's 708 runs = 773.46 Smart Runs. — search summary of [ESPNcricinfo Smart Stats articles](https://www.espncricinfo.com/print/story/1234120) (snippet, not fully verified)
- Note: Smart Stats multiplies runs by a pressure index. That is a leverage weighting of raw runs, not of runs above expectation. Like WPA, it credits players for the situations they happen to be in.

**CricViz (Impact / Match Impact)**
- CricViz simulates the rest of a game thousands of times to project outcomes, and PlayViz splits team performance into batting, bowling and fielding. I found no public formula for Batting/Bowling Impact or Match Impact, so treat it as **proprietary / unverified**. — search summary ([crunchbase](https://www.crunchbase.com/organization/cricviz); blog reference in [bfern.github.io "Introducing Contribution Score", 2023](https://bfern.github.io/posts/2023-05-17-introducing-contribution-score), which calls CricViz Match Impact the closest analogue to its own metric)

**Minor League Cricket impact (US, 2021)**
- Compares each batter's actual runs and outs with an average batter's in the same match situations, adjusts for ground, and reports bowling impact per over. — search summary of [MiLC Player Impact Rankings 2021](https://news.minorleaguecricket.com/2021/10/06/minor-league-cricket-player-impact-rankings/)

**Delta (Misra & Rajaraman, Columbia / Unicorns AI, April 2026). Full text read.**
- Projected total T_k = s_k + g(120−b_k, 10−w_k). g is an empirical table of mean remaining runs by (balls left, wickets in hand), trained on IPL 2022–25 first innings only (292 innings, about 35k balls) to avoid chase truncation. Batter delta = T_k − T_{k−1}; the bowler gets the negative. Deltas are additive across roles, so an all-rounder's value is simply bat delta + bowl delta. — [Misra & Rajaraman 2026, Delta](https://www.cs.columbia.edu/%7Emisra/delta-2026.pdf)
- Opposition adjustment is an iterative fixpoint, like HITS/PageRank on the bipartite batter–bowler graph: each ball delta is adjusted by the opponent's per-ball average and recomputed until it converges (under 0.07 runs/ball after 8 passes; they run 10). This "materially reorders" high-leverage bowlers. — [Delta 2026](https://www.cs.columbia.edu/%7Emisra/delta-2026.pdf)
- They prove the ranking is invariant to additive shifts in the par-score function. They acknowledge that one unconditioned par table for both innings is "conceptually wrong for a chase" (an optimal-stopping problem) and propose a target-conditioned second-innings model as future work. — [Delta 2026](https://www.cs.columbia.edu/%7EMISRA/delta-2026.pdf)
- Robustness: the Spearman correlation between full-sample and first-innings-only match delta for the top 15 is 0.44 for batters and 0.65 for bowlers, attributed partly to small-sample noise (Mustafizur: N=5, +14.86 vs +3.15). Appendix A gives 95% CIs. They suggest, but do not implement, hierarchical partial pooling. — [Delta 2026](https://www.cs.columbia.edu/%7Emisra/delta-2026.pdf)
- All-rounder rule: at least 200 balls faced AND at least 2 overs/match. Narine is the only all-rounder clearly positive on both (+4.21 bat, +4.47 bowl per match). Breakout bowlers regress sharply the next season (Noor Ahmad, Pathirana). — [Delta 2026](https://www.cs.columbia.edu/%7Emisra/delta-2026.pdf)
- Despite the title, "leverage-weighted" here means valuing balls by their change in projected total, not by a win-probability leverage index. — inference from the same paper.

**Context-adjusted Player Evaluation for T20 (Bandyopadhyay, arXiv:2608.18020, Aug 2026; preprint, not peer reviewed)**
- Runs Above Expected (RAE) = runs on a ball minus a contextual expectation. The expectation comes from a multiplicative log-linear (conditional Poisson) model fitted by iterated backfitting, with **empirical Bayes shrinkage of thin context cells** toward the population mean. — [arXiv 2608.18020](https://arxiv.org/abs/2608.18020)
- Dismissal Adjusted Runs (DAR) prices a wicket as the runs it forgoes, taken from a batting-side value function solved by a Bellman/DP recursion. The realised wicket cost (realDAR) is centred on its expectation (xDAR) using a league dismissal hazard, giving a "run-weighted, mean-zero martingale residual". RAE + DAR = a symmetric "Impact" for batters and bowlers on about 2.7M T20 balls. No CIs or reliability stats are reported on the abstract page. — [arXiv 2608.18020](https://arxiv.org/abs/2608.18020)

**cricWAR (Hassan Rafique, Sloan SSAC). Year ambiguous: listed under SSAC26, but the repo is named cricWAR_SSAC23.**
- Builds sabermetric-style run value, runs above average (RAA), VORP and WAR for batters and bowlers from public ball-by-ball data (R package cricketdata), with resampling-based uncertainty for RAA and WAR and a discussion of reliability. Replacement-level details were not visible on the landing page. — [Sloan: cricWAR](https://sloansportsconference.com/research-papers/cricwar-a-reproducible-system-for-evaluating-player-performance-in-limited-overs-cricket)

**Other cricket valuation work**
- Chandrakar & Das, "Measuring the values of cricket players" (ANZ Journal of Statistics, 2022): values a player by how his inclusion changes the team's win probability, applied to the IPL. Full text not read. — [IIMB research](https://research.iimb.ac.in/fac_pubs/30)
- Davis, Perera & Swartz: a Markov-chain T20 simulator that values players through counterfactual lineup substitution (cited as the closest predecessor to Delta). — cited in [Delta 2026](https://www.cs.columbia.edu/%7Emisra/delta-2026.pdf)
- A 2024 Journal of Sports Analytics paper builds a pressure index for the team batting second in T20Is. — [JSA 240792](https://journals.sagepub.com/doi/10.3233/JSA-240792)
- Informal WPA work: GooglyPlusPlus computes per-ball batter/bowler win-probability contribution with logistic regression and deep-learning WP models ([R-bloggers 2023](https://www.r-bloggers.com/2023/03/googlyplusplus-computing-t20-players-win-probability-contribution/amp/)). The Boundary Line blog proposes evidence-weighted WPA variants ([Medium](https://medium.com/boundary-line/evaluating-player-contribution-e2e7c9d2a5ce)). Neither is peer reviewed.
- A systematic review of impact-ranking methods in limited-overs cricket exists (title only seen). — [LIDA record 4091922](https://lida.sport-iat.de/twm/Record/4091922?lng=en)

**IPL auction valuation**
- Hedonic regression of price on runs, wickets and age (Karnik, 2008 auction) — [ESPNcricinfo "Hedonic regression and the IPL"](https://www.espncricinfo.com/story/hedonic-regression-and-the-ipl-616252). Lenten et al. (2012) and Bhattacharya & Bhattacharya (2012) regress price on attributes; a critique says this ignores the sequential auction dynamics — [ISI 2019 proceedings](https://isi2019.org/proceeding/3.CPS/CPS%20VOL%203/files/basic-html/page46.html). A JSA paper compares predicted auction price with "economic value" — [JSA 200580](https://content.iospress.com/articles/journal-of-sports-analytics/jsa200580). A 2026 Sport, Business & Management paper uses fixed effects, hedonic regression and PSM on 2,547 player-seasons (2015–24) — [DOI 10.1108/sbm-01-2026-0014](https://www.citedrive.com/en/discovery/return-on-investment-and-player-valuation-effectiveness-in-the-indian-premier-league-a-comprehensive-analysis-of-foreign-versus-domestic-player-economics/). (Secondary summaries; not read in full.)

### Inferences
- Pressure Lab's "runs above expected + dismissals above expected" matches RAE/DAR. Adopting Bandyopadhyay's **xDAR centring** (charging a wicket only relative to the expected dismissal hazard in that state, priced by a value function rather than a flat run value) would make the dismissal component mean-zero by construction and less noisy.
- **Opposition adjustment through Delta's fixpoint** is cheap and fits Pressure Lab's bowler/batter data: alternately update batter and bowler per-ball residuals for opponent quality. It matters most for pressure balls, where death bowlers face elite finishers.
- Delta's first-innings / second-innings caveat applies directly. If Pressure Lab's expected-runs model is not target-conditioned, chase pressure balls are mis-baselined.
- Smart Stats' "runs × pressure index" mixes opportunity with skill. Pressure Lab should keep separating "value accrued in pressure" (WPA-like) from "performance relative to expectation in pressure" (clutch-like).

### Gaps
- No public formula for CricViz Impact or Match Impact, or for Smart Stats weights.
- cricWAR replacement level, reliability results and exact year were not retrieved (PDF not opened).
- No paper found that applies Shapley values to cricket player contribution. Additive per-ball schemes like Delta make Shapley unnecessary for batter/bowler splits; it would matter only for partnership or non-striker credit.
- Cricmetric methodology was not found.

## Q2. Other sports: WPA, Clutch, LI, WAR, RAPM/EPM, EPA, xG/xT/VAEP, tennis

### Takeaway
Baseball gives the cleanest template for separating opportunity from clutch. WPA = context-dependent value; WPA/LI = context-neutral value; Clutch = WPA/pLI − WPA/LI = how much better a player did in high leverage than his own leverage-neutral rate. Basketball's RAPM shows how to stabilise noisy estimates with ridge regression and informative (box-score / prior-season) priors. VAEP/xT show "change in scoring minus conceding probability" valuation of every action.

### Cited Findings
- **FanGraphs/Baseball-Reference:** WPA/LI sums each play's WPA divided by that play's leverage index ("context-neutral wins"). WPA/pLI is total WPA divided by the player's average LI. **Clutch = WPA/pLI − WPA/LI**. An older version was WPA − WPA/LI. If pLI were 1.00 in every PA, Clutch would be 0 whatever the player's actual clutch ability. Pitchers have WPA/LI and Clutch too. — [FanGraphs "All About Clutch"](https://blogs.fangraphs.com/all-about-clutch/); [FanGraphs WPA/LI library](https://library.fangraphs.com/misc/wpa-li); [FanGraphs Clutch library](https://library.fangraphs.com/misc/clutch); [Baseball-Reference WPA](https://baseballreference.com/about/wpa.shtml) (snippets; FanGraphs library returned 403 on fetch)
- **RAPM:** a ridge-regularised adjusted plus-minus. The ridge penalty handles lineup multicollinearity and pulls low-exposure players toward a prior; ridge = posterior mode under Gaussian priors. Bayesian RAPM variants use priors from minutes, team strength or box-score stats (RPM, LEBRON). One analyst found a full prior-season prior made year-to-year estimates "too malleable" and used a compromise weight. — search summary of [APBRmetrics Bayesian RAPM](https://apbr.org/metrics/viewtopic.php?p=33130), [hockeystats RAPM](https://hockeystats.com/methodology/rapm), [arXiv 2007.10550](https://arxiv.org/pdf/2007.10550)
- **EPV (basketball):** possessions modelled as a Markov chain, with actions credited by their change in expected points (cited as a structural analogue). — [Delta 2026 related work](https://www.cs.columbia.edu/%7Emisra/delta-2026.pdf)
- **VAEP (Decroos, Bransen, Van Haaren, Davis; KDD 2019, Best Applied Data Science Paper):** an action's value = Δ P(score in the next 10 actions) − Δ P(concede in the next 10 actions), from classifiers over game state. It values all on-ball actions, whereas shots and goals are under 2% of actions. A critical xT-vs-VAEP comparison exists (Van Roy et al., AAAI 2020 workshop). — [arXiv 1802.07127](https://arxiv.org/abs/1802.07127v2); [IJCAI 2020 extended abstract](https://www.ijcai.org/proceedings/2020/648)
- **NFL:** clutch is commonly defined as QB EPA/play in close games (40–60% WP) minus overall EPA/play. One 2021 analysis (35 QBs) found that about 0.1% of the variance in clutch EPA/play is predicted by the prior year. Not peer reviewed. — search summary ([bestballstats 2021](https://bestballstats.com/2021/10/10/need-a-comeback-these-are-the-quarterbacks-you-want/); [nfeloapp QB rankings](https://www.nfeloapp.com/qb-rankings))
- **Tennis (Klaassen & Magnus, *Analyzing Wimbledon*, 2014; about 100k Wimbledon points):** "big points" = break points, tiebreak points, and set-deciding games. Players play somewhat safer on big points. The apparent big-point over-performance of top players comes mostly from **weaker players underperforming**, not champions raising their level. A re-analysis notes that results depend on defining importance by Morris's point-importance rather than by break points. — [ITF Coaching Review](https://itfcoachingreview.com/index.php/journal/article/download/478/1297/1944); [On the T blog 2016](https://on-the-t.github.io/2016/02/14/Klaassen-Magnus-Hypothesis-1); [Tinbergen](https://tinbergen.nl/news/261/analyzing-wimbledon-new-book-by-fellows-klaassen-and-magnus)

### Inferences
- Pressure Lab's WPA per pressure ball is like WPA restricted to high-LI events. Its pressure-minus-normal delta is like Clutch. Computing a **WPA/LI-style context-neutral component and a Clutch-style residual explicitly** would make the opportunity vs skill split transparent.
- Tennis suggests reframing: "pressure rating" may mostly identify players who **lose less** under pressure (avoid choking) rather than players who rise. A one-sided treatment could help, for example a penalty for pressure underperformance with stronger shrinkage on positive deltas.
- RAPM-style ridge with an **informative prior equal to the player's all-situations rating** is the principled version of "shrink the pressure delta toward zero and the overall level toward the player's normal level".

### Gaps
- Karun Singh's xT write-up and EPM's exact prior structure were not retrieved.
- No peer-reviewed NFL clutch-stability study was found.

## Q3. Is clutch a stable skill? How to handle low reliability

### Takeaway
Across baseball, NFL, NBA and tennis, clutch residuals (pressure performance minus own baseline) have near-zero year-to-year reliability. The best baseball estimates put clutch talent at a few runs per season, needing heavy regression (Tango: regress about 79% at about 325 clutch PAs). Pressure Lab's finding that past pressure experience does not predict later pressure performance, and that its split-half delta reliability is low, is the expected result, not a bug. The fix is heavy shrinkage plus explicit reliability-based weighting, not dropping the idea. Psychology confirms that choking exists on average, but as a population effect that is hard to attribute to individuals.

### Cited Findings
- **Cramer (1977):** the best 1969 clutch hitters reverted to normal in 1970 on average. Birnbaum (SABR): failing to detect clutch is not proof it is absent; if clutch talent exists, its SD must be under about 30 points (of batting average). — [SABR: Clutch Hitting and the Cramer Test](https://sabr.org/journal/article/clutch-hitting-and-the-cramer-test/)
- **Tango (1999–2002 data, 340 hitters with ≥100 clutch PA and ≥800 PA, clutch by LI):** the standardised clutch score SD is 1.14 vs 1.0 expected under pure luck (214 within 1 SD vs 232 expected). His conclusion: "Clutch hitting exists, albeit at a very small level!" The implied regression is (1/1.12)² ≈ 79% toward the mean at about 325 clutch PAs. The page also states regression = 1250/(1250 + clutch PA), which is internally inconsistent with the other figure (flag this). The most detectable clutch skill (Giambi, Tejada) is about 2 runs/year, or about 0.6 wins in leverage terms. — [Tango "Does Clutch Hitting Exist?"](https://tangotiger.net/clutch.html); [Tango archive](https://tangotiger.net/archives/stud0322.shtml)
- **Carleton (Baseball Prospectus, Aug 2014):** the WP-based clutch measure has a year-to-year correlation of **.074**. A process proxy ("swing difference": first-pitch swing rate at LI 2 vs LI 1) has a 5-season ICC of **.30**, but its outcome effects are small (K rate 17.7% vs 18.3% at LI=2). Hitters get only about 60–80 high-leverage PAs a year. — [BP "I believe in clutch hitting"](https://www.baseballprospectus.com/news/article/24401/baseball-therapy-i-believe-in-clutch-hitting/)
- **NBA:** Cao et al. (2011; free throws 2002/03–2009/10) found most players shoot about 5–10% worse from the line under pressure (average choking). Solomonov et al. (2015, *Psychology of Sport and Exercise*; 16 expert-rated "clutch" players) found they did not shoot better in decisive phases, though they influenced results in other ways. A blog found combined clutch WPA year-over-year R² of about 0.31 when regular season and playoffs are pooled (not peer reviewed). — search summary ([TAU PDF](https://www.autolab.sites.tau.ac.il/_files/ugd/f0ac3e_dccc848e01c94efda606f97ade89edb4.pdf); [LIDA record](https://lida.sport-iat.de/dbb/Record/4044694); [Substack](https://themathchecksout.substack.com/p/is-clutch-performance-predictable))
- **NFL:** clutch EPA/play year-over-year explains about 0.1% of variance (35 QBs, 2021, informal). — [bestballstats 2021](https://bestballstats.com/2021/10/10/need-a-comeback-these-are-the-quarterbacks-you-want/)
- **Cricket:** Delta shows breakout bowlers regressing sharply the next season, and first-innings-only rank correlations of 0.44 (batters) and 0.65 (bowlers) with the full sample. — [Delta 2026](https://www.cs.columbia.edu/%7Emisra/delta-2026.pdf)
- **Psychology:** Beilock & Carr (2001, *J. Exp. Psych: General*; 54 novice golfers) found choking in putting was eliminated by self-consciousness training but not by dual-task training, which supports explicit-monitoring theory for sensorimotor skills (distraction theory fits maths tasks better). Baumeister (1984) is the classic definition of choking as performing below one's skill under pressure (cited secondhand). — [Carr summary](https://homepage.villanova.edu/diego.fernandezduque/Teaching/CognitivePsychology/Lectures_and_Labs/s4ExecutiveFunctions/sAppliedCog/choking_under_pressure.htm); [APA Monitor 2002](https://www.apa.org/monitor/feb02/athletes)
- **Cricket psychology:** PLOS ONE (2023) on 712 Tests (2004–2022) studies batting in the nervous nineties; slowing down is one plausible pressure response. A 2025 *Sport, Exercise, and Performance Psychology* study of county cricketers found individualised pressure training beat generic training. Peer-reviewed T20-chase choking research is thin. — [PLOS ONE 10.1371/journal.pone.0287700](https://doi.org/10.1371/journal.pone.0287700); [Bangor University](https://research.bangor.ac.uk/en/publications/maximizing-performance-under-pressure-a-comprehensive-multidiscip/)

### Inferences (recommendations for low reliability)
- Use **Tango-style regression for the delta component**: shrunk_delta = raw × n/(n + k), with k estimated from Pressure Lab's own data as k = (luck variance)/(true variance) from the split-half reliability (r = n/(n+k), so k = n(1−r)/r). With low r, k will be large (likely thousands of balls), so most players' pressure deltas will shrink to near 0. That is honest.
- Keep the weighting proportional to reliability, as Pressure Lab already does, but consider **Spearman-Brown projecting** the split-half r to full sample length before weighting, and report the implied k.
- Treat pressure ratings as **"overall skill applied in pressure contexts" + a small, heavily shrunk clutch residual**. Most predictive value will come from the player's overall per-ball skill (as in RAPM informative priors). Pressure Lab's null result on experience supports this.
- Consider process proxies (Carleton's swing difference; in cricket, perhaps boundary-attempt or dot-ball rate shifts under pressure) as more reliable signals than outcome residuals. They are untested in cricket.

### Gaps
- No cricket study found that reports year-to-year correlation of a T20 clutch/pressure-delta metric specifically.
- The Baumeister 1984 primary text was not retrieved.

## Q4. Combining batting and bowling into one all-rounder value

### Takeaway
The consensus is to put both disciplines in one currency (runs of projected total, runs above expected, or win probability) with zero-sum per-ball attribution, and sum them. Wickets are priced through a value function or a run-equivalence. A replacement-level baseline (WAR/VORP) is used when the goal is roster value rather than per-ball quality.

### Cited Findings
- Delta: bowler delta = −batter delta per ball, so all-rounder value = bat + bowl delta, "directly comparable to the totals of pure specialists". It applies a workload threshold to define all-rounders. — [Delta 2026](https://www.cs.columbia.edu/%7Emisra/delta-2026.pdf)
- Bandyopadhyay: RAE + DAR symmetric for batting and bowling ("a single symmetry treats run-scoring and run-prevention on the same footing"). — [arXiv 2608.18020](https://arxiv.org/abs/2608.18020)
- Smart Stats: wickets converted into a run value and added to batting impact. — [ESPN 2019](https://www.espn.in/cricket/story/_/id/26312449)
- cricWAR: RAA → VORP → WAR for batters and bowlers. — [Sloan cricWAR](https://sloansportsconference.com/research-papers/cricwar-a-reproducible-system-for-evaluating-player-performance-in-limited-overs-cricket)

### Inferences
- Pressure Lab standardises components within role and then maps them to 0–100. For an all-rounder score, **sum the un-standardised net runs (or WPA) per match across disciplines before standardising**. Averaging two 0–100 scores over-rewards part-time bowlers and ignores volume.
- Use per-match (volume-inclusive) totals for all-rounders and per-ball rates for specialists, or report both.

### Gaps
- No source found that validates which all-rounder combination best predicts team wins.

## Q5. Presenting uncertainty and avoiding over-credit to small samples

### Takeaway
Leading public systems use shrinkage (empirical Bayes cells, ridge/Bayesian priors), resampling CIs, and explicit minimum-sample or workload thresholds. Pressure Lab's bootstrap-by-match CIs and P(top 10) are already ahead of most cricket systems. The main improvements are partial pooling at the player level and informative priors.

### Cited Findings
- Delta reports 95% CIs on average match delta, notes that mid-tier ranks are dominated by small-N noise (N=4–5 first-innings matches), and recommends hierarchical partial pooling as the next step. — [Delta 2026](https://www.cs.columbia.edu/%7Emisra/delta-2026.pdf)
- Bandyopadhyay uses empirical Bayes shrinkage of sparse context cells. — [arXiv 2608.18020](https://arxiv.org/abs/2608.18020)
- cricWAR uses resampling for uncertainty in RAA/WAR. — [Sloan cricWAR](https://sloansportsconference.com/research-papers/cricwar-a-reproducible-system-for-evaluating-player-performance-in-limited-overs-cricket)
- RAPM: ridge shrinks low-minute players toward a prior; box-score or prior-season priors stabilise estimates. — [hockeystats RAPM](https://hockeystats.com/methodology/rapm); [APBRmetrics](https://apbr.org/metrics/viewtopic.php?p=33130)
- Tango: an explicit regression-to-the-mean amount derived from the luck/observed variance ratio. — [tangotiger.net](https://tangotiger.net/clutch.html)

### Inferences
- Replace independent per-component EB with a **hierarchical model**: player pressure effect ~ N(β·overall_skill, τ²), with τ estimated from the data. This is the cricket analogue of prior-informed RAPM and gives a coherent posterior for the 0–100 score and P(top 10).
- Show the shrinkage factor (n/(n+k)) next to each player so users see how much of a score is data and how much is prior.

### Gaps
- No cricket system found publishing calibration checks (for example, whether 90% intervals cover next-season performance 90% of the time). This is worth doing in Pressure Lab.
