"""Stage 6: per-ball expectations and per (player, match) component sums.

Every rating component is stored as (num, den[, sq]) per player-match so that
* the full-sample value is sum(num) / sum(den), shrunk with Empirical Bayes, and
* the bootstrap can resample MATCHES and recompute every component exactly.

Expected values come from the state cell (league x innings x over x wickets bucket x
chase required-rate bucket), so "above expected" removes the effect of the situation.

v2 (FIX 3 / FIX 4): the state-cell expectation is then adjusted for the OPPONENT, the only
place opponent strength enters the model:
    E[y] = cell(y) x exp(b0 + b1 Strong + b2 Elite + b3 oppElo_z + b4 oppElo_z x IPL)
(Poisson GLM with log(cell) as offset; batter targets use the bowler's leave-one-out tier and
the bowling side's pre-match Elo, bowler targets use the striker's tier and the batting side's Elo.)

Net runs above expected (NRAE, batter) = (runs - E[runs]) - wicket_value x (out - E[out])
Net runs saved (bowler)                 = (E[runs] - runs) + wicket_value x (wkt - E[wkt])
v2 (FIX 6): wicket_value is state-based, per ball (win_probability._wicket_value).
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from sklearn.linear_model import PoissonRegressor

from pressure_index import Options, flags, metric_weights
from utils import log, section

# expectation variants: "" = tier + opposition Elo (main), and ablations without one or both
VARIANTS = {"": ("tier", "elo"), "_noF3": ("elo",), "_noF10": ("tier",), "_none": ()}


def _variant(o: Options) -> str:
    if o.expect_variant is not None:
        return o.expect_variant
    a, c = "F3" in o.off, "F10" in o.off
    return "_none" if a and c else "_noF3" if a else "_noF10" if c else ""


def _opp_design(b: pd.DataFrame, side: str, use: tuple) -> tuple[np.ndarray, list[str]]:
    tier = b.bowler_tier if side == "bat" else b.striker_tier
    z = b[f"opp_elo_z_{side}"].fillna(0).values
    cols, names = [], []
    if "tier" in use:
        cols += [(tier == "Strong").values.astype(float), (tier == "Elite").values.astype(float)]
        names += ["Strong", "Elite"]
    if "elo" in use:
        cols += [z, z * b.is_ipl.values]
        names += ["oppElo_z(100pts)", "oppElo_z x IPL"]
    return (np.column_stack(cols) if cols else np.zeros((len(b), 0))), names


def _adjust(y: np.ndarray, e: np.ndarray, X: np.ndarray, mask: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Poisson GLM with offset log(e): fit target y/e with weight e (same score equations)."""
    if X.shape[1] == 0:
        return np.ones(len(y)), np.zeros(0)
    ok = mask & (e > 0)
    m = PoissonRegressor(alpha=1e-6, max_iter=500).fit(X[ok], y[ok] / e[ok], sample_weight=e[ok])
    return np.exp(m.intercept_ + X @ m.coef_), m.coef_

BAT_COMPS = {  # name: (kind, layer)  kind: mean | rate
    "nrae_p": ("mean", None), "runs_ae_p": ("mean", None), "out_ae_p": ("mean", None), "wpa_p": ("mean", None),
    "nrae_n": ("mean", None), "consistency": ("rate", None), "rescue": ("mean", "F11"), "collapse": ("mean", "F14"),
    "matchup_ppdeath": ("mean", "F8"),
}
BOWL_COMPS = {
    "rsae_p": ("mean", None), "wae_p": ("mean", None), "dot_p": ("rate", None), "wpa_p": ("mean", None),
    "nrs_p": ("mean", None), "nrs_n": ("mean", None), "consistency": ("rate", None), "death_clamp": ("rate", "F7"),
    "pp_control": ("mean", "F8"), "control": ("mean", "F9"), "heist": ("mean", "F11"), "pair_breaker": ("mean", "F13"),
}
TIER_VAL = {"Elite": 2, "Strong": 1, "Normal": 0}


def add_expectations(cfg: dict, b: pd.DataFrame, wkt_runs: float) -> pd.DataFrame:
    section("STAGE 6 · EXPECTED VALUES AND PER-BALL CONTRIBUTIONS")
    wkb = pd.cut(b.wkts_before, [-1, 2, 5, 10], labels=["0-2", "3-5", "6+"]).astype(str)
    rrb = np.where(b.innings == 1, "-", pd.cut(b.rrr.fillna(0), [-1e9, 6, 8, 10, 12, 1e9],
                                               labels=["<6", "6-8", "8-10", "10-12", "12+"]).astype(str))
    fine = b.is_ipl.astype(str) + "|" + b.innings.astype(str) + "|" + b.overid.astype(str) + "|" + wkb + "|" + rrb
    coarse = b.is_ipl.astype(str) + "|" + b.innings.astype(str) + "|" + b.overid.astype(str) + "|" + wkb

    def expect(col, mask):
        f = b[mask].groupby(fine[mask])[col].agg(["mean", "size"])
        c = b[mask].groupby(coarse[mask])[col].mean()
        v = f["mean"].reindex(fine).values
        n = f["size"].reindex(fine).fillna(0).values
        return np.where(n >= 100, v, c.reindex(coarse).values)

    fb = b.faced.values
    allb = np.ones(len(b), bool)
    cell = {"bat_runs": np.where(fb, expect("bat_runs", b.faced), 0.0),
            "striker_out": np.where(fb, expect("striker_out", b.faced), 0.0),
            "bowler_runs": expect("bowler_runs", pd.Series(True, index=b.index)),
            "bowler_wkt": expect("bowler_wkt", pd.Series(True, index=b.index))}
    targets = {"bat_runs": ("bat", fb), "striker_out": ("bat", fb), "bowler_runs": ("bowl", allb), "bowler_wkt": ("bowl", allb)}
    wv = b.wkt_value.values  # FIX 6: state-based runs value of a wicket
    so = b.striker_out.values.astype(float)
    log("FIX 3/4 opponent adjustment of the expected values (multiplicative effect exp(coef) vs Normal tier / "
        "average-Elo opposition):")
    coefs = {}
    for v, use in VARIANTS.items():
        E = {}
        for t, (side, mk) in targets.items():
            X, nm = _opp_design(b, side, use)
            f, coef = _adjust(b[t].values.astype(float), cell[t], X, mk)
            E[t] = np.where(mk, cell[t] * f, 0.0)
            if v == "":
                coefs[t] = {n: round(float(np.exp(c)), 4) for n, c in zip(nm, coef)}
                log(f"   {t:<12} ({'vs bowler' if side == 'bat' else 'vs batter'}): "
                    + ", ".join(f"{n} x{np.exp(c):.3f}" for n, c in zip(nm, coef)))
        b[f"e_bat_runs{v}"], b[f"e_out{v}"] = E["bat_runs"], E["striker_out"]
        b[f"e_bowl_runs{v}"], b[f"e_bowl_wkt{v}"] = E["bowler_runs"], E["bowler_wkt"]
        b[f"runs_ae{v}"] = np.where(fb, b.bat_runs - E["bat_runs"], 0.0)
        b[f"out_ae{v}"] = np.where(fb, so - E["striker_out"], 0.0)
        b[f"nrae{v}"] = b[f"runs_ae{v}"] - wv * b[f"out_ae{v}"]
        b[f"rsae{v}"] = E["bowler_runs"] - b.bowler_runs
        b[f"wae{v}"] = b.bowler_wkt.astype(float) - E["bowler_wkt"]
        b[f"nrs{v}"] = b[f"rsae{v}"] + wv * b[f"wae{v}"]
    b.attrs["opp_coefs"] = coefs
    # FIX 6 ablation: main expectations with the v1 fixed wicket value
    b["nrae_fixwv"] = b.runs_ae - wkt_runs * b.out_ae
    b["nrs_fixwv"] = b.rsae + wkt_runs * b.wae
    for c in ["runs_ae", "out_ae", "rsae", "wae"]:
        b[f"{c}_fixwv"] = b[c]
    log(f"Expected values = state cell x opponent adjustment; wicket value per ball (mean {wv.mean():.2f} runs, "
        f"v1 fixed {wkt_runs:.2f}). Check: mean NRAE per faced ball {b.loc[b.faced, 'nrae'].mean():+.4f}, "
        f"mean net runs saved {b.nrs.mean():+.4f} (both ~0)")

    # ---- situational flags used by components
    fc = cfg["features"]
    b["rescue_ball"] = b.faced & (b.wp_bat < fc["rescue_wp_threshold"])
    b["heist_ball"] = (1 - b.wp_bat) < fc["heist_wp_threshold"]
    b["ppdeath_elite"] = b.faced & b.phase.isin(["PP", "Death"]) & b.bowler_tier.isin(["Elite", "Strong"])
    # F8 bowling: powerplay vs Elite/Strong powerplay batters, weighted by situation
    q = b[b.innings == 1].groupby(["match_id"]).agg(t=("team_runs", "sum"), lg=("league", "first"), s=("season", "first"))
    q25 = q.groupby(["lg", "s"]).t.quantile(fc["low_total_quantile"])
    thr = pd.MultiIndex.from_frame(b[["league", "season"]]).map(q25.to_dict())
    low_total = (b.innings == 2) & ((b.target - 1) < np.asarray(thr, float))
    sw = cfg["features"]["pp_situation_weight"]
    b["pp_sit_w"] = (1.0 * np.where(low_total, sw["low_total"], 1.0) * np.where(b.knockout_bowl == 1, sw["knockout"], 1.0)
                     * np.where(b.nrr_race_bowl, sw["nrr"], 1.0))
    b["pp_ball"] = (b.phase == "PP") & b.striker_tier.isin(["Elite", "Strong"])
    b["pp_bat_elite"] = b.faced & (b.phase == "PP") & b.bowler_tier.isin(["Elite", "Strong"])
    log(f"F8: {int(low_total.sum()):,} balls bowled defending a below-{fc['low_total_quantile']:.0%}-quantile total; "
        f"{int(b.pp_ball.sum()):,} powerplay balls vs Elite/Strong batters")
    # F13 pair-breaker
    setp = (b.part_runs >= fc["set_partnership_runs"]) | (b.part_balls >= fc["set_partnership_balls"])
    b["pair_break_w"] = np.where(b.bowler_wkt & setp,
                                 1 + 0.5 * (b.striker_tier.map(TIER_VAL) + b.nonstriker_tier.map(TIER_VAL)), 0.0)
    log(f"F13: {int((b.pair_break_w > 0).sum())} bowler wickets ended a set partnership "
        f"(>= {fc['set_partnership_runs']} runs or >= {fc['set_partnership_balls']} balls)")
    return b


def _death_clamp_overs(cfg: dict, b: pd.DataFrame) -> pd.DataFrame:
    """F7: death overs bowled mostly to Elite/Strong finishers; clamp = <= 9 runs conceded."""
    fc = cfg["features"]
    d = b[b.phase == "Death"]
    o = d.groupby(["match_id", "innings", "overid", "bowler_id"]).agg(
        runs=("bowler_runs", "sum"), legal=("legal", "sum"), wk=("bowler_wkt", "sum"),
        thr=("striker_tier", lambda s: s.isin(["Elite", "Strong"]).mean())).reset_index()
    o = o[o.legal >= 4]
    o["qual"] = o.thr >= fc["clamp_min_threat_share"]
    o["clamp"] = o.qual & (o.runs <= fc["clamp_runs"])
    return o


def _control(b: pd.DataFrame) -> pd.DataFrame:
    """F9: bowler economy vs teammates' economy in the same innings (conditions cancel)."""
    g = b.groupby(["match_id", "innings", "bowler_id"]).agg(r=("bowler_runs", "sum"), n=("legal", "sum")).reset_index()
    t = g.groupby(["match_id", "innings"]).agg(R=("r", "sum"), N=("n", "sum"))
    g = g.join(t, on=["match_id", "innings"])
    g["tm_n"] = g.N - g.n
    g = g[(g.n >= 6) & (g.tm_n >= 12)]
    g["diff"] = (g.R - g.r) / g.tm_n - g.r / g.n  # teammates' runs/ball minus own (+ = better)
    g["num"] = g["diff"] * g.n
    return g


def player_match(cfg: dict, b: pd.DataFrame, o: Options, mask: np.ndarray | None = None,
                 pflags: tuple[np.ndarray, np.ndarray] | None = None) -> dict[str, pd.DataFrame]:
    """Per (player, match) sums for every component, for one set of options.

    Pressure flags are always computed on ALL balls (the definition of a pressure ball is
    global); `mask` / `o.league` then restrict which balls are summed (leaderboard slices).
    """
    fb, fw = pflags if pflags is not None else flags(cfg, b, o)
    mwb, mww = metric_weights(cfg, b, o)  # FIX 5: log1p(leverage x stakes) inside pressure metrics
    v = _variant(o)
    keep = np.ones(len(b), bool)
    if o.league is not None:
        keep &= ((b.league == "IPL") if o.league == "IPL" else (b.league != "IPL")).values
    if mask is not None:
        keep &= np.asarray(mask, bool)
    x = b
    if not keep.all():
        x = b[keep]
        fb, fw = fb[keep], fw[keep]
        mwb, mww = mwb[keep], mww[keep]
    wb, ww = mwb, mww
    nrae, nrs = x[f"nrae{v}"].values, x[f"nrs{v}"].values
    fcd = x.faced.values
    pb = fb & fcd
    nb = (~fb) & fcd

    # ---------------- batters
    A = pd.DataFrame({"pid": x.striker_id.values, "mid": x.match_id.values})
    A["p_balls"] = pb.astype(int)
    A["balls"] = fcd.astype(int)

    def add(df, name, val, w, mask, sq=True):
        df[f"{name}_num"] = np.where(mask, val * w, 0.0)
        df[f"{name}_den"] = np.where(mask, w, 0.0)
        if sq:
            df[f"{name}_sq"] = np.where(mask, w * val ** 2, 0.0)

    add(A, "nrae_p", nrae, wb, pb)
    add(A, "runs_ae_p", x[f"runs_ae{v}"].values, wb, pb)
    add(A, "out_ae_p", x[f"out_ae{v}"].values, wb, pb)
    add(A, "wpa_p", x.wpa_bat.values, wb, pb)
    add(A, "nrae_n", nrae, 1.0, nb)
    add(A, "rescue", x.wpa_bat.values, 1.0, x.rescue_ball.values)
    add(A, "collapse", nrae, 1.0, (x.collapse_entry & x.faced).values)
    add(A, "matchup_ppdeath", nrae, 1.0, x.ppdeath_elite.values)
    PMb = A.groupby(["pid", "mid"]).sum()

    # ---------------- bowlers
    Bw = pd.DataFrame({"pid": x.bowler_id.values, "mid": x.match_id.values})
    Bw["p_balls"] = (fw & x.legal.values).astype(int)
    Bw["balls"] = x.legal.values.astype(int)
    add(Bw, "rsae_p", x[f"rsae{v}"].values, ww, fw)
    add(Bw, "wae_p", x[f"wae{v}"].values, ww, fw)
    add(Bw, "dot_p", x.is_dot.values.astype(float), 1.0, fw & x.legal.values, sq=False)
    add(Bw, "wpa_p", x.wpa_bowl.values, ww, fw)
    add(Bw, "nrs_p", nrs, ww, fw)
    add(Bw, "nrs_n", nrs, 1.0, ~fw)
    add(Bw, "heist", x.wpa_bowl.values, 1.0, x.heist_ball.values)
    add(Bw, "pp_control", nrs, x.pp_sit_w.values, x.pp_ball.values)
    add(Bw, "pair_breaker", x.pair_break_w.values, 1.0, x.legal.values)
    PMw = Bw.groupby(["pid", "mid"]).sum()
    dc = _death_clamp_overs(cfg, x)
    dcq = dc[dc.qual].groupby(["bowler_id", "match_id"]).agg(death_clamp_num=("clamp", "sum"), death_clamp_den=("qual", "sum"))
    dcq.index.names = ["pid", "mid"]
    ctl = _control(x)
    ctl["sq"] = ctl["diff"] ** 2 * ctl.n
    ct = ctl.groupby(["bowler_id", "match_id"]).agg(control_num=("num", "sum"), control_den=("n", "sum"),
                                                   control_sq=("sq", "sum"))
    ct.index.names = ["pid", "mid"]
    PMw = PMw.join(dcq, how="left").join(ct, how="left").fillna(0.0)

    # ---------------- consistency (per-match pressure score vs population average)
    for PM, val in [(PMb, "nrae_p"), (PMw, "nrs_p")]:
        ok = PM.p_balls >= 3
        score = PM[f"{val}_num"] / PM[f"{val}_den"].replace(0, np.nan)
        pop = score[ok].mean()
        PM["match_score"] = score
        PM["consistency_num"] = (ok & (score > pop)).astype(float)
        PM["consistency_den"] = ok.astype(float)
    return {"bat": PMb, "bowl": PMw, "flags": (fb, fw), "balls": x}


def raw_stats(b: pd.DataFrame, fb: np.ndarray, fw: np.ndarray) -> dict[str, pd.DataFrame]:
    """F2: normal vs pressure raw stats for every metric (unshrunk)."""
    out = {}
    f = b.faced.values
    for lab, mk in [("p", fb & f), ("n", (~fb) & f)]:
        x = b[mk]
        g = x.groupby("striker_id").agg(balls=("faced", "sum"), runs=("bat_runs", "sum"), outs=("striker_out", "sum"),
                                        dots=("bat_runs", lambda s: (s == 0).sum()),
                                        fours=("is_four", "sum"), sixes=("is_six", "sum"),
                                        nrae=("nrae", "mean"), wpa=("wpa_bat", "mean"), matches=("match_id", "nunique"))
        g["sr"] = 100 * g.runs / g.balls
        g["dot_pct"] = 100 * g.dots / g.balls
        g["bnd_pct"] = 100 * (g.fours + g.sixes) / g.balls
        g["dis_rate"] = 100 * g.outs / g.balls
        g["avg"] = g.runs / g.outs.replace(0, np.nan)
        out[f"bat_{lab}"] = g
    for lab, mk in [("p", fw), ("n", ~fw)]:
        x = b[mk]
        g = x.groupby("bowler_id").agg(legal=("legal", "sum"), runs=("bowler_runs", "sum"), wkts=("bowler_wkt", "sum"),
                                       dots=("is_dot", "sum"), fours=("is_four", "sum"), sixes=("is_six", "sum"),
                                       nrs=("nrs", "mean"), wpa=("wpa_bowl", "mean"), matches=("match_id", "nunique"))
        g["econ"] = 6 * g.runs / g.legal
        g["dot_pct"] = 100 * g.dots / g.legal
        g["bnd_pct"] = 100 * (g.fours + g.sixes) / g.legal
        g["wkt_rate"] = 100 * g.wkts / g.legal
        g["sr_bowl"] = g.legal / g.wkts.replace(0, np.nan)
        out[f"bowl_{lab}"] = g
    return out
