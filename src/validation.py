"""Stage 8: validation and report-only analyses.

* Sensitivity: thresholds 10/20/30 %, each layer removed, IPL vs T20I only, rule-based pressure.
  Reported as top-10 overlap (count and Jaccard) and Spearman rho on common eligible players.
* Split-half reliability of the pressure delta (odd vs even matches per player).
* Sanity table: top 30 per list with raw stats and automatic flags.
* F15 phase-impact test.
"""
from __future__ import annotations

import itertools

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

import player_metrics as pmx
from pressure_index import Options
from ranking import RATING_COMPS, Rater
from utils import jaccard, log, section, spearman


def _scaled_rater(cfg, side, PM, o, share_balls: float):
    ec = cfg["eligibility"]
    base_pb = ec["batter_min_pressure_balls"] if side == "bat" else ec["bowler_min_pressure_balls"]
    base_m = ec["batter_min_matches"] if side == "bat" else ec["bowler_min_matches"]
    return Rater(cfg, side, PM, o, min_pb=max(30, int(round(base_pb * share_balls))),
                 min_m=max(5, int(round(base_m * min(1.0, share_balls ** 0.5 if share_balls < 1 else 1.0)))))


def sensitivity(cfg: dict, b: pd.DataFrame, base: dict[str, pd.DataFrame]) -> tuple[pd.DataFrame, dict]:
    """Returns the overlap table and, per test, the top-10 ids per side (FIX 9 confidence groups)."""
    section("STAGE 8a · SENSITIVITY")
    base_share = cfg["pressure"]["top_share"]
    tests: list[tuple[str, str, Options, float]] = []
    for s in cfg["pressure"]["sensitivity_shares"]:
        if abs(s - base_share) > 1e-9:
            tests.append((f"Threshold {int(s * 100)}%", f"Pressure balls = top {int(s * 100)}% instead of {int(base_share * 100)}%",
                          Options(top_share=s, label=f"thr{s}"), s / base_share))
    for s in cfg["stakes"]["sensitivity_scales"]:  # FIX 7
        lab = "Stakes off" if s == 0 else f"Stakes {int(round((s - 1) * 100)):+d}%"
        chg = "Every stakes multiplier = 1.0" if s == 0 else f"Every stakes multiplier's effect x{s:g}"
        tests.append((lab, chg, Options(stakes_scale=s, label=f"stakes{s}"), 1.0))
    names = {"F3": "opponent tier in the expected-value models", "F6": "match stakes", "F7": "death clamp", "F8": "powerplay control",
             "F9": "control vs teammates", "F10": "opposition Elo in the expected-value models", "F11": "rescue / heist", "F12": "NRR race",
             "F13": "pair-breaker", "F14": "collapse entry"}
    for L in cfg["validation"]["layers"]:
        tests.append((f"Without {L}", f"Remove {names.get(L, L)}", Options(off={L}, label=L), 1.0))
    tests.append(("Without F18", "Favourite-under-threat bonus off", Options(off={"F18"}, label="F18"), 1.0))
    ipl_share = float((b.league == "IPL").mean())
    tests.append(("IPL only", "Rate on IPL balls only", Options(league="IPL", label="ipl"), ipl_share))
    tests.append(("T20I only", "Rate on international balls only", Options(league="T20I", label="t20i"), 1 - ipl_share))
    tests.append(("Rule-based pressure", "Death overs / RRR >= 9 / collapse instead of leverage",
                  Options(rule_based=True, label="rule"), 1.0))
    rows = []
    top_sets = {}
    for name, change, o, share in tests:
        X = pmx.player_match(cfg, b, o)
        for side in ["bat", "bowl"]:
            if o.rule_based:  # rule-based flags ~47 % of balls: scale eligibility to the pressure-ball count
                share_b = float(X[side].p_balls.sum() / max(base[side + "_pm"].p_balls.sum(), 1))
            else:
                share_b = share
            R = _scaled_rater(cfg, side, X[side], o, share_b)
            t = R.table()
            bt = base[side]
            common = bt.index.intersection(t.index)
            rho = spearman(bt.loc[common, "rating"], t.loc[common, "rating"]) if len(common) > 5 else float("nan")
            top_b, top_t = list(bt.head(10).index), list(t.head(10).index)
            top_sets.setdefault(name, {})[side] = top_t
            rows.append({"test": name, "change": change, "list": "batters" if side == "bat" else "bowlers",
                         "eligible": len(t), "common_eligible": len(common), "spearman": round(rho, 3),
                         "top10_overlap": len(set(top_b) & set(top_t)), "jaccard": round(jaccard(top_b, top_t), 3)})
            log(f"  {name:<22} {('batters' if side == 'bat' else 'bowlers'):<8} eligible {len(t):>3} · "
                f"rho {rho:.3f} · top-10 overlap {rows[-1]['top10_overlap']}/10")
    return pd.DataFrame(rows), top_sets


def split_half(cfg: dict, base_pm: dict, raters: dict) -> pd.DataFrame:
    section("STAGE 8b · SPLIT-HALF RELIABILITY (odd vs even matches)")
    out = []
    for side in ["bat", "bowl"]:
        PM = base_pm[side]
        R = raters[side]
        ids = R.eligible_ids
        P = PM.loc[PM.index.get_level_values(0).isin(ids)].copy()
        # order each player's matches by match_id (ids increase with date) and split odd / even
        P["k"] = P.groupby(level=0).cumcount()
        halves = {}
        for h, mask in [("odd", P.k % 2 == 1), ("even", P.k % 2 == 0)]:
            S = Rater.sums(P[mask].drop(columns="k"))
            V = R.rate(S)
            halves[h] = V
        a, c = halves["odd"].loc[ids], halves["even"].loc[ids]
        for metric in ["delta", "rating", RATING_COMPS[side][0]]:
            r = float(np.corrcoef(a[metric], c[metric])[0, 1])
            sb = 2 * r / (1 + r) if r > -1 else float("nan")
            out.append({"list": "batters" if side == "bat" else "bowlers", "metric": metric, "n_players": len(ids),
                        "pearson_r": round(r, 3), "spearman": round(spearman(a[metric], c[metric]), 3),
                        "spearman_brown_full": round(sb, 3)})
            log(f"  {out[-1]['list']:<8} {metric:<10} r = {r:+.3f}  (Spearman-Brown full-sample reliability {sb:+.3f}, n={len(ids)})")
    return pd.DataFrame(out)


def sanity(cfg: dict, side: str, table: pd.DataFrame, raw: dict, b: pd.DataFrame, names: pd.Series,
           R: Rater, boot: pd.DataFrame) -> pd.DataFrame:
    """Top 30 with raw stats and flags for surprises."""
    t = table.head(30).copy()
    key = "striker_id" if side == "bat" else "bowler_id"
    pflag = "p_bat" if side == "bat" else "p_bowl"
    x = b[b[pflag]]
    intl = b[b.elo_pool == "International"]
    elo_q = intl[f"opp_elo_{side}"].quantile(0.25)
    tier2 = (x.league == "Emerging") | ((x.elo_pool == "International") & (x[f"opp_elo_{side}"] < elo_q))
    share = tier2.groupby(x[key]).mean()
    rp, rn = raw[f"{side}_p"], raw[f"{side}_n"]
    t["name"] = t.index.map(names)
    if side == "bat":
        t["sr_pressure"] = rp.sr.reindex(t.index).round(1)
        t["sr_normal"] = rn.sr.reindex(t.index).round(1)
        t["runs_pressure"] = rp.runs.reindex(t.index)
        t["dismissals_pressure"] = rp.outs.reindex(t.index)
    else:
        t["econ_pressure"] = rp.econ.reindex(t.index).round(2)
        t["econ_normal"] = rn.econ.reindex(t.index).round(2)
        t["wkts_pressure"] = rp.wkts.reindex(t.index)
    t["tier2_share"] = share.reindex(t.index).round(3)
    t = t.join(boot[["rating_lo", "rating_hi", "p_top10"]], how="left")
    mins = R.min_pb
    flags = []
    for pid, r in t.iterrows():
        f = []
        if r.tier2_share > 0.4:
            f.append("tier-2-heavy sample")
        if r.p_balls < 1.25 * mins:
            f.append("thin sample")
        if pd.notna(r.rating_hi) and r.rating_hi - r.rating_lo > 40:
            f.append("wide CI")
        # most players are a little worse on pressure balls, so compare with the eligible average
        if r.delta < R.z["delta"][0] - 0.5 * R.z["delta"][1] and r["rank"] <= 10:
            f.append("drops more than average under pressure")
        contrib = {c: abs(R.w.get(c, 0) * (r[c] - R.z[c][0]) / R.z[c][1]) for c in RATING_COMPS[side]}
        tot = sum(contrib.values())
        if tot > 0 and max(contrib.values()) / tot > 0.5:
            f.append(f"driven by {max(contrib, key=contrib.get)}")
        flags.append("; ".join(f))
    t["flags"] = flags
    return t


def phase_impact(b: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    """F15: share of |WPA| by phase, and how often the team that 'wins' a phase wins the match."""
    section("STAGE 8c · F15 PHASE-IMPACT TEST")
    x = b.copy()
    x["abs_wpa"] = x.wpa_bat.abs()
    x["fmt3"] = x.league
    rows = []
    for fmt, g in list(x.groupby("fmt3")) + [("All", x)]:
        tot = g.abs_wpa.sum()
        per_ball_all = g.abs_wpa.mean()
        for ph in ["PP", "Middle", "Death"]:
            h = g[g.phase == ph]
            rows.append({"format": fmt, "phase": ph, "share_abs_wpa": round(h.abs_wpa.sum() / tot, 4),
                         "share_balls": round(len(h) / len(g), 4),
                         "abs_wpa_per_ball_vs_mean": round(h.abs_wpa.mean() / per_ball_all, 3),
                         "batting_gain_vs_mean": round(h.wpa_bat.clip(lower=0).mean() / g.wpa_bat.clip(lower=0).mean(), 3),
                         "bowling_gain_vs_mean": round(h.wpa_bowl.clip(lower=0).mean() / g.wpa_bowl.clip(lower=0).mean(), 3)})
    T = pd.DataFrame(rows)
    # phase winner vs match winner
    done = x[~x.no_result & x.win_team_id.notna()]
    tw = pd.concat([
        done.assign(team=done.batting_team_id, w=done.wpa_bat),
        done.assign(team=done.bowling_team_id, w=done.wpa_bowl),
    ]).groupby(["match_id", "phase", "team"]).w.sum().reset_index()
    tw = tw.merge(done.groupby("match_id").agg(win=("win_team_id", "first"), lg=("league", "first")), on="match_id")
    best = tw.loc[tw.groupby(["match_id", "phase"]).w.idxmax()]
    best["won"] = best.team == best.win
    W = best.groupby(["lg", "phase"]).won.mean().unstack().round(3)
    W.loc["All"] = best.groupby("phase").won.mean().round(3)
    for r in T[T.format == "All"].itertuples():
        log(f"  {r.phase:<6} {r.share_abs_wpa:.1%} of all |WPA| from {r.share_balls:.1%} of balls "
            f"(per-ball impact {r.abs_wpa_per_ball_vs_mean:.2f}x the mean)")
    log("  Team that wins the phase (higher WPA in it) also wins the match:")
    log(W.to_string())
    log(f"  Conclusion: the side that wins BOTH powerplay and death WPA wins "
        f"{best[best.phase.isin(['PP', 'Death'])].groupby('match_id').filter(lambda g: g.team.nunique() == 1).groupby('match_id').won.first().mean():.1%} "
        "of matches (where one side won both)")
    T.attrs["winner_table"] = W
    return T, W


def phase_baselines(b: pd.DataFrame, P: dict) -> pd.DataFrame:
    """FIX 8: put "wins powerplay AND death -> wins X%" in context.

    For every (match, team), which phases it won on WPA (higher summed WPA than the opponent in
    that phase). Reports, for every combination of phases, how often a team wins exactly that set
    and at least that set, and its match-win rate. Winning phases on WPA is partly circular (the
    WPA of a match sums to the result), so the useful comparison is between combinations."""
    section("STAGE 8d · FIX 8 PHASE-IMPACT BASELINES")
    done = b[~b.no_result & b.win_team_id.notna()]
    tw = pd.concat([done.assign(team=done.batting_team_id, w=done.wpa_bat),
                    done.assign(team=done.bowling_team_id, w=done.wpa_bowl)]
                   ).groupby(["match_id", "phase", "team"]).w.sum().unstack("phase").fillna(0.0)
    tw = tw.reset_index()
    opp = tw.groupby("match_id")[["PP", "Middle", "Death"]].transform("sum") - tw[["PP", "Middle", "Death"]]
    won = tw[["PP", "Middle", "Death"]] > opp
    meta = done.groupby("match_id").agg(win=("win_team_id", "first"), lg=("league", "first"))
    tw = tw.join(meta, on="match_id")
    tw["won_match"] = tw.team == tw.win
    for ph in ["PP", "Middle", "Death"]:
        tw[f"won_{ph}"] = won[ph].values
    rows = []
    phases = ["PP", "Middle", "Death"]
    for fmt, g in list(tw.groupby("lg")) + [("All", tw)]:
        n = len(g)
        for k in range(0, 4):
            for combo in itertools.combinations(phases, k):
                exact = np.ones(n, bool)
                atl = np.ones(n, bool)
                for ph in phases:
                    w = g[f"won_{ph}"].values
                    exact &= w if ph in combo else ~w
                    if ph in combo:
                        atl &= w
                lab = " + ".join(combo) if combo else "none"
                rows.append({"format": fmt, "phases_won": lab, "n_phases": k,
                             "share_exactly": round(exact.mean(), 4), "win_pct_exactly": round(100 * g.won_match[exact].mean(), 1) if exact.any() else np.nan,
                             "share_at_least": round(atl.mean(), 4), "win_pct_at_least": round(100 * g.won_match[atl].mean(), 1) if atl.any() else np.nan,
                             "team_matches": n})
    T = pd.DataFrame(rows)
    # share of total |WPA| by phase and format
    x = b.assign(abs_wpa=b.wpa_bat.abs())
    sh = []
    for fmt, g in list(x.groupby("league")) + [("All", x)]:
        tot = g.abs_wpa.sum()
        for ph in phases:
            sh.append({"format": fmt, "phases_won": f"|WPA| share: {ph}", "share_abs_wpa": round(g.abs_wpa[g.phase == ph].sum() / tot, 4)})
    T = pd.concat([T, pd.DataFrame(sh)], ignore_index=True)
    T.to_csv(P["tables"] / "phase_impact_baselines.csv", index=False)
    A = T[(T.format == "All") & T.n_phases.notna()]
    log("Win % by phases won on WPA (All formats): exactly / at least")
    for r in A.itertuples():
        log(f"   {r.phases_won:<22} exactly {r.share_exactly:6.1%} of team-matches, win {r.win_pct_exactly:5.1f}% | "
            f"at least {r.share_at_least:6.1%}, win {r.win_pct_at_least:5.1f}%")
    for r in T[T.share_abs_wpa.notna()].itertuples():
        log(f"   {r.format:<9} {r.phases_won}: {r.share_abs_wpa:.1%}")
    # figure
    fig, ax = plt.subplots(1, 2, figsize=(13, 4.6))
    a = A[A.n_phases.between(1, 2)].sort_values("win_pct_at_least")
    ax[0].barh(a.phases_won, a.win_pct_at_least, color=np.where(a.phases_won == "PP + Death", "#B23A62", "#4A73A8"))
    for i, (v, sh_) in enumerate(zip(a.win_pct_at_least, a.share_at_least)):
        ax[0].text(v + 0.5, i, f"{v:.0f}%  (occurs {sh_:.0%})", va="center", fontsize=8)
    ax[0].set_xlim(0, 110)
    ax[0].set_xlabel("Match win % (team won at least these phases on WPA)")
    ax[0].set_title("Phase-win baselines (all formats)")
    S = T[T.share_abs_wpa.notna()].copy()
    S["phase"] = S.phases_won.str.split(": ").str[1]
    pv = S.pivot(index="format", columns="phase", values="share_abs_wpa")[phases]
    pv.plot(kind="bar", ax=ax[1], color=["#4A73A8", "#7C67A6", "#B23A62"], rot=0)
    ax[1].set_ylabel("Share of total |WPA|")
    ax[1].set_title("Share of |WPA| by phase and format")
    fig.tight_layout()
    fig.savefig(P["figures"] / "phase_impact_baselines.png", dpi=130)
    plt.close(fig)
    return T

