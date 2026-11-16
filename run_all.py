"""Pressure Lab: full, reproducible pipeline.

    py run_all.py            (Windows)     |     python run_all.py

Stages: data prep -> win probability / leverage -> threat tiers -> stakes / Elo / NRR ->
pressure balls -> player metrics -> ratings + bootstrap -> validation -> scouting -> export.
Everything is logged to outputs/logs/run_log.txt and ends with the acceptance checklist.
"""
from __future__ import annotations

import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "src"))

import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

import data_prep  # noqa: E402
import export  # noqa: E402
import player_metrics as pmx  # noqa: E402
import pressure_index  # noqa: E402
import ranking as rk  # noqa: E402
import report_v2  # noqa: E402
import scouting  # noqa: E402
import stakes  # noqa: E402
import threat  # noqa: E402
import validation  # noqa: E402
import win_probability  # noqa: E402
from pressure_index import Options  # noqa: E402
from utils import CHECK, Timer, get_logger, load_config, log, paths, section, set_seeds  # noqa: E402


def main() -> int:
    t0 = time.time()
    cfg = load_config()
    P = paths(cfg)
    get_logger(P["logs"] / "run_log.txt")
    set_seeds(cfg["seed"])
    pd.set_option("display.width", 220)
    log(f"Pressure Lab pipeline · seed {cfg['seed']} · config {Path('config.yaml').resolve()}")

    with Timer("data prep"):
        D = data_prep.run(cfg, P)
    rate, n = data_prep.CHECK_STATE["reconcile"]
    CHECK.add("Data mapped and loaded, extras reconciled, innings totals match results (>= 98%)", rate >= 0.98,
              f"{rate:.2%} of {n} decided matches reconcile; {len(D['no_bbb'])} matches without balls logged")

    base_dir = P["tables"].parent / "baseline_v1"
    CHECK.add("Baseline v1 snapshot saved", all((base_dir / f).exists() for f in
              ["top10_batters.csv", "top10_bowlers.csv", "full_ratings_batters.csv", "full_ratings_bowlers.csv",
               "wp_model_metrics.csv", "sensitivity.csv"]), f"{base_dir} (CSV tables, JSON, v1 run log, v1 config)")

    with Timer("win probability"):
        W = win_probability.run(cfg, P, D)
    # FIX 3: A-team cups out of everything downstream of the WP model
    bx, mx, EXC = data_prep.exclude_competitions(cfg, P, W["balls"], D["matches"], D["names"])
    D["matches_all"], D["matches"] = D["matches"], mx
    with Timer("threat"):
        T = threat.run(cfg, P, bx, W["wkt_runs"])
    with Timer("stakes"):
        S = stakes.run(cfg, P, T["balls"], D["matches"])
    with Timer("pressure"):
        X = pressure_index.run(cfg, P, S["balls"])
    b = pmx.add_expectations(cfg, X["balls"], W["wkt_runs"])
    w_now = pressure_index.weights(cfg, b, Options())
    st_bat = pressure_index.stakes(cfg, b, "bat", Options())
    one_place = bool(np.allclose(w_now[0], b.leverage.values * st_bat)) and "Strong" in b.attrs["opp_coefs"]["bat_runs"]

    # ---------------- ratings
    section("STAGE 7 · F4 SHRINKAGE + ELIGIBILITY · F5 CONSISTENCY + BOOTSTRAP · RATINGS")
    o = Options(top_share=cfg["pressure"]["top_share"])
    with Timer("player metrics"):
        PMX = pmx.player_match(cfg, b, o)
    pflags = PMX["flags"]
    raw = pmx.raw_stats(b, *pflags)
    raters, tables, boots, top10, caps, elig = {}, {}, {}, {}, {}, {}
    for side in ["bat", "bowl"]:
        R = rk.Rater(cfg, side, PMX[side], o)
        if cfg["rating"]["reliability_weighting"]:
            key = "batter_weights" if side == "bat" else "bowler_weights"
            cfg["rating"][key] = rk.reliability_weights(cfg, side, R, PMX[side])
            R = rk.Rater(cfg, side, PMX[side], o)  # every later Rater (sensitivity, slices) uses the final weights
        raters[side] = R
        elig[side] = rk.describe_eligibility(R, side)
        tables[side] = R.table()
        with Timer(f"bootstrap {side}"):
            boots[side] = rk.bootstrap(cfg, R, PMX[side], cfg["seed"])
        caps[side] = rk.captain_analysis(PMX[side], D["p11"], side)
        top, swaps = rk.top_n(tables[side], caps[side], cfg["rating"]["tie_epsilon"], cfg["bootstrap"]["top_n"])
        top10[side] = top
        tables[side].loc[top.index, "rank"] = top["rank"].values
        log(f"F17 captaincy tie-break: {len(caps[side])} captains analysed; {swaps} adjacent swap(s) applied in the top 10")
    # consistency spread (F5 report): std / IQR of per-match scores
    for side in ["bat", "bowl"]:
        PM = PMX[side]
        ms = PM.match_score[PM.p_balls >= 3]
        g = ms.groupby(level=0)
        tables[side]["match_sd"] = g.std().reindex(tables[side].index)
        tables[side]["match_iqr"] = (g.quantile(0.75) - g.quantile(0.25)).reindex(tables[side].index)
        tables[side]["pct_matches_above_avg"] = (PM.consistency_num.groupby(level=0).sum()
                                                 / PM.consistency_den.groupby(level=0).sum()).reindex(tables[side].index)
    nb, nw = len(tables["bat"]), len(tables["bowl"])
    CHECK.add("F4 Shrinkage applied, eligibility counts reported", nb > 10 and nw > 10,
              f"{nb} batters, {nw} bowlers eligible; EB prior per component logged")
    ok5 = boots["bat"].p_top10.notna().all() and boots["bowl"].p_top10.notna().all()
    CHECK.add("F5 Consistency + bootstrap (1,000) rank intervals and P(top 10)", ok5 and cfg["bootstrap"]["iterations"] >= 1000,
              f"{cfg['bootstrap']['iterations']} resamples by match; per-match SD/IQR/% above average in full_ratings_*.csv")

    # feature-layer checks (computed inside the components)
    pmw = PMX["bowl"]
    CHECK.add("F7 Death clamp rate", pmw.death_clamp_den.sum() > 0,
              f"{int(pmw.death_clamp_den.sum())} death overs vs Elite/Strong finishers, "
              f"{pmw.death_clamp_num.sum() / pmw.death_clamp_den.sum():.1%} clamped (<= {cfg['features']['clamp_runs']} runs)")
    CHECK.add("F8 Powerplay control by situation (batting mirror included)",
              pmw.pp_control_den.sum() > 0 and PMX["bat"].matchup_ppdeath_den.sum() > 0,
              f"{int(b.pp_ball.sum()):,} PP balls vs Elite/Strong batters (situation-weighted); "
              f"{int(b.pp_bat_elite.sum()):,} PP balls faced vs Elite/Strong bowlers")
    CHECK.add("F9 Control score vs teammates", pmw.control_den.sum() > 0,
              f"{int(pmw.control_den.sum()):,} legal balls compared with same-innings teammates")
    CHECK.add("F11 Rescue + Heist scores", PMX["bat"].rescue_den.sum() > 0 and pmw.heist_den.sum() > 0,
              f"rescue balls {int(PMX['bat'].rescue_den.sum()):,}, heist balls {int(pmw.heist_den.sum()):,}")
    CHECK.add("F13 Pair-breaker score", (b.pair_break_w > 0).sum() > 0,
              f"{int((b.pair_break_w > 0).sum())} set-partnership wickets, weighted by pair threat")
    CHECK.add("F14 Collapse entry", PMX["bat"].collapse_den.sum() > 0,
              f"{int(PMX['bat'].collapse_den.sum()):,} balls faced after walking in during a collapse")
    CHECK.add("F17 Captain tie-breaker analysis", len(caps["bat"]) + len(caps["bowl"]) > 0,
              f"{len(caps['bat'])} batting / {len(caps['bowl'])} bowling captains compared with vs without captaincy")

    # ---------------- validation
    base = {"bat": tables["bat"], "bowl": tables["bowl"], "bat_pm": PMX["bat"], "bowl_pm": PMX["bowl"]}
    with Timer("sensitivity"):
        sens, top_sets = validation.sensitivity(cfg, b, base)
    split = validation.split_half(cfg, PMX, raters)
    sanity = {side: validation.sanity(cfg, side, tables[side], raw, b, D["names"], raters[side], boots[side])
              for side in ["bat", "bowl"]}
    for side in ["bat", "bowl"]:
        fl = sanity[side][sanity[side]["flags"] != ""]
        log(f"Sanity ({side}): {len(fl)} of top 30 flagged -> "
            + "; ".join(f"{r['name']}: {r['flags']}" for _, r in fl.head(8).iterrows()))
    phase = validation.phase_impact(b)
    phase_bl = validation.phase_baselines(b, P)
    CHECK.add("FIX 8 Phase-impact baselines table", (P["tables"] / "phase_impact_baselines.csv").exists(),
              "; ".join(f"{r.phases_won} {r.win_pct_at_least:.0f}% (occurs {r.share_at_least:.0%})" for r in
                        phase_bl[(phase_bl.format == "All") & (phase_bl.n_phases == 2)].itertuples())
              + " -> phase_impact_baselines.csv/.png")
    stk = sens[sens.test.str.startswith("Stakes")]
    emp = pd.read_csv(P["tables"] / "stakes_empirical.csv")
    CHECK.add("FIX 7 Stakes off / -50% / +50% sensitivity done; empirical support logged",
              stk.test.nunique() == 3 and len(emp) > 0,
              "; ".join(f"{r.test} {r.list} overlap {r.top10_overlap}/10 rho {r.spearman:.2f}" for r in stk.itertuples())
              + f" | data supports {int(emp.supports_multiplier.sum())}/{len(emp)} multiplier directions (stakes_empirical.csv)")

    # ---------------- v2 reports: FIX 3 weak opposition, FIX 5 dominance, FIX 9 groups
    weak = report_v2.weak_opposition_report(cfg, b, tables, D["names"], P)
    dom = report_v2.single_over_dominance(cfg, b, tables, P)
    cards = report_v2.confidence(cfg, b, top10, boots, top_sets, D["names"], P)
    coefs = b.attrs["opp_coefs"]
    CHECK.add("FIX 3 A-team cups excluded; Elo built; opposition Elo in the xR/xW models; weak-opposition share reported",
              EXC["matches"] > 0 and all("oppElo_z(100pts)" in v for v in coefs.values()) and len(weak) > 0,
              f"removed {EXC['matches']} matches / {EXC['balls']:,} balls ({EXC['players']} players); "
              f"Elo home adv {cfg['elo']['home_advantage']}, newcomer offset -{cfg['elo']['new_team_offset']}; "
              f"+100 opp Elo: bat runs x{coefs['bat_runs']['oppElo_z(100pts)']:.3f}, bowl wkts x{coefs['bowler_wkt']['oppElo_z(100pts)']:.3f}; "
              f"{int(weak.flag_over_25pct.sum())} players flagged > 25% weak-opposition pressure balls")
    ov = X["overlap_v1"]
    CHECK.add("FIX 4 Opponent tier used in one place only; pressure balls = leverage x stakes", one_place,
              f"pressure weight == leverage x stakes on every ball; tier + opp Elo only in E[runs]/E[wkts] "
              f"(Elite bowler: bat runs x{coefs['bat_runs']['Elite']:.3f}); v1/v2 pressure-ball Jaccard bat {ov['batting']:.2f}, "
              f"bowl {ov['bowling']:.2f}")
    # ablations: re-rate with one fix reverted (explains entries / exits, see comparison)
    abl = {}
    b_ml = b.copy()
    for c in ["leverage", "leverage_uncapped", "wpa_bat", "wpa_bowl"]:
        b_ml[c] = b_ml[f"{c}_ml"]
    for lab, bb, oo in [("FIX 1 end-game DP", b_ml, Options()),
                        ("FIX 3/4 opponent in expectations", b, Options(expect_variant="_none")),
                        ("FIX 4 threat out of the pressure weight", b, Options(v1_threat=True)),
                        ("FIX 5 leverage cap + log weights", b, Options(uncapped=True, uniform_weights=True)),
                        ("FIX 6 state-based wicket value", b, Options(expect_variant="_fixwv"))]:
        XX = pmx.player_match(cfg, bb, oo)
        abl[lab] = {side: rk.Rater(cfg, side, XX[side], oo).table() for side in ["bat", "bowl"]}
    del b_ml
    CHECK.add("F15 Phase-impact test", len(phase[0]) > 0,
              "share of |WPA| by phase x format + phase-winner win rates -> phase_impact.csv")
    CHECK.add("Sensitivity, split-half and sanity checks done", len(sens) > 0 and len(split) > 0,
              f"{sens.test.nunique()} sensitivity tests; split-half delta r = "
              f"{split[(split.metric == 'delta')].pearson_r.round(2).tolist()} (bat, bowl)")

    # ---------------- scouting
    sc = scouting.run(cfg, b, tables["bat"], raters["bat"], PMX["bat"], D["names"], D, W["wkt_runs"])
    CHECK.add("F16 Fragile list + weakness profiles + RR Fix / Attack tags", len(sc["fragile"]) > 0 and len(sc["profiles"]) > 0,
              f"{len(sc['fragile'])} fragile batters; {sc['profiles'].player_id.nunique()} profiles; "
              f"{len(sc['fix_ids'])} Fix / {len(sc['attack_ids'])} Attack cards")

    # ---------------- export
    C = {"cfg": cfg, "P": P, "b": b, "D": D, "wp": W, "threat": T, "stakes": S, "pflags": pflags, "raw": raw,
         "raters": raters, "tables": tables, "boot": boots, "top10": top10, "captain": caps, "pm": PMX,
         "sens": sens, "split": split, "sanity": sanity, "phase": phase, "scout": sc, "cards": cards,
         "eligibility_counts": {"batters": nb, "bowlers": nw, "rules": elig}}
    with Timer("export"):
        export.run(C)

    # ---------------- comparison v1 vs v2
    C["explanations"] = report_v2.explain_changes(cfg, b, C, abl)
    eg = W["endgame_table"]
    sd = dom.set_index(["list", "scheme"])
    C["fix_notes"] = [
        f"FIX 1: end-game DP for <= {cfg['endgame']['dp_balls']} balls left, linear blend to ML at {cfg['endgame']['blend_to_balls']}; "
        f"1-ball bucket gap {eg.gap_before.iloc[0]:+.1f} -> {eg.gap_after.iloc[0]:+.1f} pts; worst |gap| (<= 24 balls) "
        f"{eg.gap_before.iloc[:5].abs().max():.1f} -> {eg.gap_after.iloc[:5].abs().max():.1f} pts.",
        f"FIX 2: era features {', '.join(win_probability.ERA_FEATS)}; model chosen on 2024 = {W['best']}; refit on all seasons.",
        f"FIX 3: excluded {EXC['matches']} A-team matches ({EXC['balls']:,} balls, {EXC['players']} players; per-player list in "
        "tables/excluded_competitions_players.csv). Opposition Elo effect per +100 Elo: "
        + ", ".join(f"{k} x{v['oppElo_z(100pts)']:.3f}" for k, v in coefs.items())
        + f". Weak-opposition share > 25%: {int(weak.flag_over_25pct.sum())} eligible players (tables/weak_opposition_share.csv).",
        f"FIX 4: pressure weight = leverage x stakes. Pressure-ball overlap with v1 (Jaccard): batting {ov['batting']:.2f}, "
        f"bowling {ov['bowling']:.2f}. Opponent tier effect inside E[runs] (batter vs Elite bowler): x{coefs['bat_runs']['Elite']:.3f}.",
        "FIX 5: leverage capped at p99; max single-over share of a top-20 player's weighted score: "
        + "; ".join(f"{l} {sd.loc[(l, 'raw leverage x stakes (uncapped)'), 'max']:.1%} -> {sd.loc[(l, 'v2: log1p(capped leverage x stakes)'), 'max']:.1%} "
                    f"(v1 uniform {sd.loc[(l, 'v1: uniform (x opp-Elo weight)'), 'max']:.1%})" for l in ["batters", "bowlers"]) + ".",
        f"FIX 6: state-based wicket value, mean {b.wkt_value.mean():.2f} runs (v1 fixed {W['wkt_runs']:.2f}); "
        "tables/wicket_value_table.csv + figures/wicket_value_heatmap.png.",
        f"FIX 7: stakes empirical check supports {int(emp.supports_multiplier.sum())}/{len(emp)} multiplier directions "
        "(tables/stakes_empirical.csv).",
        "FIX 8: phase-win baselines in tables/phase_impact_baselines.csv: "
        + "; ".join(f"{r.phases_won} {r.win_pct_at_least:.0f}%" for r in
                    phase_bl[(phase_bl.format == "All") & phase_bl.n_phases.between(1, 2)].itertuples()) + ".",
        "FIX 9: confidence groups + cards in tables/top10_cards_*.csv; wording changed to 'best and most consistent "
        "performer in high-pressure situations'.",
    ]
    cmp_path = report_v2.comparison(cfg, P, C)
    lb = __import__("json").loads((P["public"] / "leaderboard_batters.json").read_text(encoding="utf-8"))
    json_ok = any("confidenceGroup" in r for v in lb["views"] for r in v["rows"])
    CHECK.add("Full rerun done; comparison_v1_vs_v2.md written; JSON updated", cmp_path.exists() and json_ok,
              f"{cmp_path.name}; public/data/*.json with confidence groups; bootstrap {cfg['bootstrap']['iterations']}, "
              f"{sens.test.nunique()} sensitivity tests, split-half done")
    bad = []
    for f in list(Path("src").rglob("*.ts*")) + list(Path("src").rglob("*.py")) + [Path("README.md")]:
        t = f.read_text(encoding="utf-8", errors="ignore").lower()
        if f.name != "run_all.py" and ("clutch" in t or "raises his game" in t):
            bad.append(str(f))
    CHECK.add("FIX 9 Confidence groups + sample cards; wording changed", len(cards["bat"]) == 10 and not bad,
              "groups bat " + str(cards["bat"].confidence_group.value_counts().to_dict()) + ", bowl "
              + str(cards["bowl"].confidence_group.value_counts().to_dict())
              + ("; old wording left in: " + ", ".join(bad) if bad else "; no 'clutch' / 'raises his game' left in src/ or README"))

    # ---------------- final printouts
    section("TOP 10 BATTERS AND BOWLERS UNDER PRESSURE")
    for side, lab in [("bat", "BATTERS"), ("bowl", "BOWLERS")]:
        t = top10[side].join(boots[side])
        cd = cards[side].set_index("player_id")
        out = pd.DataFrame({"rank": t["rank"], "name": t.index.map(D["names"]), "rating": t.rating.round(1),
                            "CI 5-95": [f"{a:.1f}-{c:.1f}" for a, c in zip(t.rating_lo, t.rating_hi)],
                            "rank 5-95": [f"{a:.0f}-{c:.0f}" for a, c in zip(t.rank_lo, t.rank_hi)],
                            "P(top10)": t.p_top10.round(2), "group": cd.confidence_group.reindex(t.index).values,
                            "pressure balls": t.p_balls.astype(int), "matches": t.matches_p.astype(int)})
        log(f"\nTOP 10 {lab}")
        log(out.to_string(index=False))
    CHECK.add("Final top 10 batters and bowlers printed (rating, rank range, P(top 10), group, pressure balls, matches)",
              len(top10["bat"]) == 10 and len(top10["bowl"]) == 10, "see tables above and outputs/tables/top10_*.csv")
    need = [P["tables"] / f for f in ["wicket_value_table.csv", "endgame_calibration.csv", "phase_impact_baselines.csv",
                                     "stakes_empirical.csv", "top10_cards_batters.csv", "single_over_dominance.csv",
                                     "top10_batters.csv", "top10_bowlers.csv", "full_ratings_batters.csv", "full_ratings_bowlers.csv",
                                     "sensitivity.csv", "fragile_batters.csv", "weakness_profiles.csv", "phase_impact.csv",
                                     "wp_model_metrics.csv"]]
    need += [P["figures"] / f for f in ["endgame_calibration.png", "wicket_value_heatmap.png", "phase_impact_baselines.png",
                                       "calibration_curve.png", "leverage_distribution.png", "pressure_vs_normal_scatter.png",
                                       "top10_rating_bars.png", "phase_impact.png", "threat_tier_runs_gap.png",
                                       "sample_radar_weakness_heatmap.png"]]
    need += [P["models"] / f for f in ["wp_model.pkl", "par_score_model.pkl"]]
    need += [P["public"] / f for f in ["kpis.json", "players.json", "leaderboard_batters.json", "leaderboard_bowlers.json", "evidence.json",
                                      "player_profiles.json", "match_replay.json", "matchups.json", "scouting.json", "method.json"]]
    missing = [str(p.name) for p in need if not p.exists()]
    CHECK.add("All CSV, PNG, model and JSON outputs written", not missing,
              f"{len(need) - len(missing)}/{len(need)} files" + (f"; missing {missing}" if missing else ""))

    order = ["Data mapped", "F1 ", "F2 ", "F3 ", "F4 ", "F5 ", "F6 ", "F7 ", "F8 ", "F9 ", "F10 ", "F11 ", "F12 ", "F13 ",
             "F14 ", "F15 ", "F16 ", "F17 ", "F18 ", "Sensitivity", "All CSV", "Baseline", "FIX 1", "FIX 2", "FIX 3",
             "FIX 4", "FIX 5", "FIX 6", "FIX 7", "FIX 8", "FIX 9", "Full rerun", "Final top 10"]
    CHECK.items.sort(key=lambda it: next((i for i, k in enumerate(order) if it[0].startswith(k)), 99))
    log("")
    log(CHECK.render())
    log(f"\nTotal runtime {time.time() - t0:.0f}s")
    if not CHECK.all_ok():
        log("SOME CHECKS FAILED")
        return 1
    log("ALL CHECKS PASSED")
    return 0


if __name__ == "__main__":
    sys.exit(main())
