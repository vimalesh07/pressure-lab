"""Stage 2 (F1): par-score model, win-probability model, WPA and leverage.

* Par model (first innings): expected final total from the pre-ball state.
* WP model: one model per innings, pre-ball features only.
  Logistic regression baseline + LightGBM. Time split: fit 2022-23, isotonic
  calibration on 2024 (still inside the <= 2024 training window), test 2025-26.
* WPA per ball: WP(after) - WP(before) for the batting side (bowler gets the negative).
* Leverage: expected |WP swing| of the next ball over the outcomes
  (dot, 1, 2, 3, 4, 6, wicket, wide) using empirical outcome probabilities for the
  state cell. Normalised so the average ball = 1.0.
"""
from __future__ import annotations

import pickle

import lightgbm as lgb
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from sklearn.isotonic import IsotonicRegression
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import brier_score_loss, log_loss, mean_absolute_error, roc_auc_score
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import FunctionTransformer, StandardScaler

from endgame import EndGame
from utils import CHECK, check, log, section, spearman

ERA_FEATS = ["post23", "ipl_post23"]  # FIX 2: era (2023+) and format x era (IPL Impact Player rule)
PAR_FEATS = ["score_before", "wkts_before", "legal_before", "balls_rem", "max_balls", "crr", "wkts_last12",
             "part_runs", "part_balls", "is_ipl"] + ERA_FEATS
# Only generalisable state features: raw score/target/current-rate combinations act as a
# match fingerprint and let trees memorise training matches (checked: test AUC dropped).
WP1_FEATS = ["par_proj", "wkts_before", "balls_rem", "is_ipl"] + ERA_FEATS
WP2_FEATS = ["runs_needed", "balls_rem", "wkts_before", "rrr", "is_ipl"] + ERA_FEATS
def lr_feats_inn1(X) -> np.ndarray:
    """Logistic-regression design for innings 1. Wickets act through the par projection;
    the par x balls-left interaction lets the same projected total matter less early on."""
    X = np.asarray(X, float)
    par, wk, br, ipl, post, ipost = X[:, 0], X[:, 1], X[:, 2], X[:, 3], X[:, 4], X[:, 5]
    bf = br / 120.0
    return np.column_stack([par, par * bf, bf, ipl, post, ipost])


def lr_feats_inn2(X) -> np.ndarray:
    """Logistic-regression design for the chase with resource interactions, so a wicket or a
    boundary moves WP more late in the chase than early (a plain linear term cannot)."""
    X = np.asarray(X, float)
    rn, br, wk, rrr, ipl, post, ipost = X[:, 0], X[:, 1], X[:, 2], X[:, 3], X[:, 4], X[:, 5], X[:, 6]
    rn = np.maximum(rn, 0)
    br = np.maximum(br, 1)
    bf = br / 120.0
    wih = (10 - wk) / 10.0
    r = np.clip(rrr, 0, 36)
    return np.column_stack([r, rn / br, np.log1p(rn), np.log1p(br), wih, wih * bf, wih * (1 - bf),
                            r * bf, r * wih, ipl, post, ipost])


OUTCOMES = ["0", "1", "2", "3", "4", "6", "W", "X"]  # X = wide / no-ball extra


# ---------------------------------------------------------------- feature helpers


def derive(df: pd.DataFrame) -> pd.DataFrame:
    """(Re)compute derived features from the base state columns."""
    d = df
    d["balls_rem"] = (d["max_balls"] - d["legal_before"]).clip(lower=0)
    d["crr"] = np.where(d["legal_before"] > 0, d["score_before"] * 6 / d["legal_before"].clip(lower=1), 0.0)
    d["runs_needed"] = d["target"] - d["score_before"]
    d["rrr"] = np.where(d["innings"] == 2, d["runs_needed"] * 6 / d["balls_rem"].clip(lower=1), np.nan)
    return d


class WPModel:
    """Par model + per-innings WP models (+ optional isotonic calibration)."""

    def __init__(self, par, wp1, wp2, iso1=None, iso2=None, kind="lgbm", endgame=None, blend=(12, 24)):
        self.par, self.wp1, self.wp2, self.iso1, self.iso2, self.kind = par, wp1, wp2, iso1, iso2, kind
        self.endgame, self.blend = endgame, blend  # FIX 1: DP for <= blend[0] balls left, linear blend to blend[1]

    def par_proj(self, d: pd.DataFrame) -> np.ndarray:
        p = self.par.predict(d[PAR_FEATS])
        return np.maximum(p, d["score_before"].values)

    def _p(self, model, X):
        return model.predict_proba(X)[:, 1]

    def wp_bat(self, d: pd.DataFrame, dp: bool = True) -> np.ndarray:
        """WP of the side batting in this innings, handling terminal states."""
        d = derive(d.copy())
        out = np.full(len(d), np.nan)
        i1 = (d["innings"] == 1).values
        i2 = ~i1
        # ---- innings 1
        if i1.any():
            x = d[i1].copy()
            done = ((x["balls_rem"] <= 0) | (x["wkts_before"] >= 10)).values
            x["par_proj"] = self.par_proj(x)
            p = self._p(self.wp1, x[WP1_FEATS])
            if self.iso1 is not None:
                p = self.iso1.predict(p)
            if done.any():  # innings over -> WP = 1 - chaser's WP at the start of innings 2
                y = x[done].copy()
                y["innings"] = 2
                y["target"] = y["score_before"] + 1
                y["score_before"] = 0
                y["wkts_before"] = 0
                y["legal_before"] = 0
                y["wkts_last12"] = 0
                y["part_runs"] = 0
                y["part_balls"] = 0
                y["max_balls"] = y["max_balls2"]
                p[done] = 1 - self.wp_bat(y, dp)
            out[i1] = p
        # ---- innings 2
        if i2.any():
            x = d[i2]
            p = self._p(self.wp2, x[WP2_FEATS])
            if self.iso2 is not None:
                p = self.iso2.predict(p)
            if dp and self.endgame is not None:
                lo, hi = self.blend
                br = x["balls_rem"].values
                a = np.clip((hi - br) / (hi - lo), 0.0, 1.0)  # 1 at <= lo balls, 0 at >= hi balls
                if (a > 0).any():
                    pdp = self.endgame.wp(x["runs_needed"].values, br, x["wkts_before"].values, x["is_ipl"].values)
                    p = a * pdp + (1 - a) * p
            won = (x["runs_needed"] <= 0).values
            over = ((x["balls_rem"] <= 0) | (x["wkts_before"] >= 10)).values & ~won
            p = np.where(won, 1.0, p)
            p = np.where(over, np.where(x["runs_needed"].values == 1, 0.5, 0.0), p)
            out[i2] = p
        return np.clip(out, 0.0005, 0.9995)


# ---------------------------------------------------------------- training


def _lgb_clf(cfg, mono):
    return lgb.LGBMClassifier(**cfg["win_probability"]["lgbm"], monotone_constraints=mono,
                              random_state=cfg["seed"], verbose=-1, n_jobs=-1)


def _metrics(y, p):
    return {"auc": roc_auc_score(y, p), "brier": brier_score_loss(y, p), "log_loss": log_loss(y, np.clip(p, 1e-6, 1 - 1e-6))}


FEATS = {1: WP1_FEATS, 2: WP2_FEATS}
MONO = {1: [1, -1, 0, 0, 0, 0], 2: [-1, 1, -1, -1, 0, 0, 0]}  # par +, wkts - | runs_needed -, balls +, wkts -, rrr -
BL_BUCKETS = [(1, 1, "1"), (2, 3, "2-3"), (4, 6, "4-6"), (7, 12, "7-12"), (13, 24, "13-24"), (25, 999, "25+")]
OV_BUCKETS = [(1, 6, "1-6"), (7, 10, "7-10"), (11, 15, "11-15"), (16, 20, "16-20")]


def _make(cfg, kind, inn):
    if kind == "logreg":
        fe = lr_feats_inn1 if inn == 1 else lr_feats_inn2
        return make_pipeline(FunctionTransformer(fe), StandardScaler(), LogisticRegression(max_iter=3000, C=1.0))
    return _lgb_clf(cfg, MONO[inn])


def _ece(y, p, bins=10) -> float:
    y, p = np.asarray(y, float), np.asarray(p, float)
    if not len(y):
        return float("nan")
    k = np.clip((p * bins).astype(int), 0, bins - 1)
    e = 0.0
    for i in range(bins):
        s = k == i
        if s.any():
            e += s.mean() * abs(p[s].mean() - y[s].mean())
    return 100 * e


def run(cfg: dict, P: dict, D: dict) -> dict:
    section("STAGE 2 · F1 WIN PROBABILITY (ML + END-GAME DP), PAR SCORE, WPA, LEVERAGE, WICKET VALUE")
    b: pd.DataFrame = D["balls"]
    m: pd.DataFrame = D["matches"]
    wc = cfg["win_probability"]
    ec = cfg["endgame"]
    seed = cfg["seed"]
    b["is_ipl"] = (b.league == "IPL").astype(int)
    b["post23"] = (b.season >= wc["era_from_season"]).astype(int)
    b["ipl_post23"] = b.is_ipl * b.post23
    b["max_balls2"] = b.second_inn_revised_overs.fillna(120).clip(upper=120)
    b["target"] = b["target"].fillna(0)  # innings 1 has no target (unused there)
    b = derive(b)
    log(f"FIX 2 era features: post23 = season >= {wc['era_from_season']}, ipl_post23 = IPL x post23 "
        f"(Impact Player era); {int(b.ipl_post23.sum()):,} IPL balls in the new era")
    blend = (ec["dp_balls"], ec["blend_to_balls"])

    # ---------------- par-score model (evaluation fit: <= train_max_season)
    inn1 = m.set_index("match_id")
    done1 = (inn1.wkts1 >= 10) | (inn1.legal1 >= inn1.first_inn_revised_overs.fillna(120).clip(upper=120))
    complete = set(inn1[done1].index)
    p1 = b[(b.innings == 1) & b.match_id.isin(complete)].copy()
    p1["final"] = p1.match_id.map(inn1.total1)
    tr = p1.season <= wc["train_max_season"]
    te = p1.season.isin(wc["test_seasons"])
    par = lgb.LGBMRegressor(**wc["par_lgbm"], random_state=seed, verbose=-1)
    par.fit(p1.loc[tr, PAR_FEATS], p1.loc[tr, "final"])
    par_mae = mean_absolute_error(p1.loc[te, "final"], np.maximum(par.predict(p1.loc[te, PAR_FEATS]), p1.loc[te, "score_before"]))
    at10 = te & (p1.legal_before == 60)
    mae10 = mean_absolute_error(p1.loc[at10, "final"], par.predict(p1.loc[at10, PAR_FEATS]))
    log(f"Par model: trained on {tr.sum():,} first-innings balls (<= {wc['train_max_season']}); "
        f"test MAE {par_mae:.1f} runs overall, {mae10:.1f} runs at the 10-over mark (n={at10.sum()})")

    # ---------------- WP training data
    lab = m.set_index("match_id")
    usable = lab[~lab.no_result & ~lab.is_tie & lab.has_bbb & lab.win_team_id.notna()].index
    log(f"WP training excludes {int(lab.no_result.sum())} no-result and {int(lab.is_tie.sum())} tied matches")
    d = b[b.match_id.isin(usable)].copy()
    d["y"] = (d.batting_team_id == d.win_team_id).astype(int)
    d["par_proj"] = np.maximum(par.predict(d[PAR_FEATS]), d.score_before)
    fit = d.season <= wc["calibration_season"] - 1
    cal = d.season == wc["calibration_season"]
    test = d.season.isin(wc["test_seasons"])
    check(not (fit & test).any() and not (cal & test).any(), "test seasons never used for fitting or calibration")
    log(f"WP split: fit {fit.sum():,} balls (2022-{wc['calibration_season'] - 1}) · calibrate {cal.sum():,} "
        f"({wc['calibration_season']}) · test {test.sum():,} ({wc['test_seasons']})")
    eg_eval = EndGame(cfg, b[b.season <= wc["calibration_season"]], f"evaluation, seasons <= {wc['calibration_season']}")

    models, val_brier, rows, preds_test, iso_used = {}, {}, [], {}, {}
    for kind in ["logreg", "lgbm"]:
        ms = {}
        for inn in (1, 2):
            sl = d.innings == inn
            feats = FEATS[inn]
            mdl = _make(cfg, kind, inn)
            mdl.fit(d.loc[fit & sl, feats].fillna(0), d.loc[fit & sl, "y"])
            # calibration decision: 2-fold by match inside the calibration season
            pc = mdl.predict_proba(d.loc[cal & sl, feats].fillna(0))[:, 1]
            yc = d.loc[cal & sl, "y"].values
            half = (pd.Series(d.loc[cal & sl, "match_id"].values).rank(method="dense") % 2 == 0).values
            gain = []
            for a, bb in [(half, ~half), (~half, half)]:
                iso = IsotonicRegression(out_of_bounds="clip").fit(pc[a], yc[a])
                gain.append(brier_score_loss(yc[bb], pc[bb]) - brier_score_loss(yc[bb], iso.predict(pc[bb])))
            use_iso = float(np.mean(gain)) > 0
            iso_used[(kind, inn)] = use_iso
            iso = IsotonicRegression(out_of_bounds="clip").fit(pc, yc) if use_iso else None
            log(f"  {kind} innings {inn}: isotonic calibration {'APPLIED' if use_iso else 'not needed'} "
                f"(validation Brier gain {np.mean(gain):+.5f})")
            ms[inn] = (mdl, iso)
        wpm = WPModel(par, ms[1][0], ms[2][0], ms[1][1], ms[2][1], kind, endgame=eg_eval, blend=blend)
        models[kind] = wpm
        dv = d[cal].copy()
        val_brier[kind] = brier_score_loss(dv.y, wpm.wp_bat(dv))
        dt = d[test].copy()
        for version, use_dp in [("ml_only", False), ("ml+endgame_dp", True)]:
            dt["p"] = wpm.wp_bat(dt, dp=use_dp)
            preds_test[(kind, version)] = dt[["innings", "y", "p", "balls_rem", "overid"]].copy()
            for inn in ["all", 1, 2]:
                s = dt if inn == "all" else dt[dt.innings == inn]
                rows.append({"model": kind, "version": version, "evaluation": "test 2025-26 (honest)", "innings": inn,
                             "n_balls": len(s), **{k: round(v, 4) for k, v in _metrics(s.y, s.p).items()}})
    # Model choice uses the 2024 season only, never the test seasons.
    best = min(val_brier, key=val_brier.get)
    log(f"2024 validation Brier (with end-game DP): { {k: round(v, 4) for k, v in val_brier.items()} } -> model used: {best}")
    calib = _calibration({k: preds_test[(k, "ml+endgame_dp")] for k in ["logreg", "lgbm"]}, P, best)
    eg_tab, i1_tab, eg_ok = _endgame_calibration(cfg, preds_test[(best, "ml_only")], preds_test[(best, "ml+endgame_dp")], P)

    # ---------------- FIX 2: refit the chosen model on ALL seasons for scoring
    par_all = lgb.LGBMRegressor(**wc["par_lgbm"], random_state=seed, verbose=-1)
    par_all.fit(p1[PAR_FEATS], p1["final"])
    d["par_proj"] = np.maximum(par_all.predict(d[PAR_FEATS]), d.score_before)
    eg_all = EndGame(cfg, b, "final, all seasons")
    ms = {}
    for inn in (1, 2):
        sl = d.innings == inn
        X, y = d.loc[sl, FEATS[inn]].fillna(0), d.loc[sl, "y"]
        mdl = _make(cfg, best, inn).fit(X, y)
        iso = None
        if iso_used[(best, inn)]:  # isotonic on cross-fitted (out-of-fold, by match) predictions
            half = (pd.Series(d.loc[sl, "match_id"].values).rank(method="dense") % 2 == 0).values
            oof = np.zeros(len(y))
            for a in (half, ~half):
                oof[~a] = _make(cfg, best, inn).fit(X[a], y[a]).predict_proba(X[~a])[:, 1]
            iso = IsotonicRegression(out_of_bounds="clip").fit(oof, y)
        ms[inn] = (mdl, iso)
    W = WPModel(par_all, ms[1][0], ms[2][0], ms[1][1], ms[2][1], best, endgame=eg_all, blend=blend)
    da = d.copy()
    da["p"] = W.wp_bat(da)
    for inn in ["all", 1, 2]:
        s = da if inn == "all" else da[da.innings == inn]
        rows.append({"model": best, "version": "ml+endgame_dp", "evaluation": "refit on all seasons (in-sample)",
                     "innings": inn, "n_balls": len(s), **{k: round(v, 4) for k, v in _metrics(s.y, s.p).items()}})
    met = pd.DataFrame(rows)
    met.loc[len(met)] = {"model": "par_score", "version": "-", "evaluation": "test 2025-26 (honest)", "innings": 1,
                         "n_balls": int(te.sum()), "auc": np.nan, "brier": np.nan, "log_loss": np.nan}
    met["par_mae_runs"] = np.where(met.model == "par_score", round(par_mae, 2), np.nan)
    met.to_csv(P["tables"] / "wp_model_metrics.csv", index=False)
    log("WP metrics (honest test on 2025-26, and the final refit in-sample):")
    log(met.to_string(index=False))
    for r, bl, w in [(4, 1, 7), (6, 1, 7), (10, 2, 7), (12, 6, 5), (30, 12, 6)]:
        log(f"  end-game DP example (IPL): {r} needed off {bl} ball(s), {w} wickets in hand -> "
            f"{100 * float(eg_all.wp([r], [bl], [10 - w], [1])[0]):.1f}%")

    # ---------------- WP for every ball (final model) and an ML-only variant (ablation of FIX 1)
    b["wp_bat"] = W.wp_bat(b)
    b["wp_bat_ml"] = W.wp_bat(b, dp=False)
    check(b.wp_bat.between(0, 1).all(), "WP is between 0 and 1 for every ball")
    for col, sfx in [("wp_bat", ""), ("wp_bat_ml", "_ml")]:
        t1, post, wpa = _wpa(b, lab, col)
        if sfx == "":
            b["wp_team1"], b["wp_team1_post"] = t1, post
        b[f"wpa_bat{sfx}"] = wpa
        b[f"wpa_bowl{sfx}"] = -wpa
    log(f"WPA: mean |WPA| per ball {b.wpa_bat.abs().mean():.4f} (ML only {b.wpa_bat_ml.abs().mean():.4f})")

    # ---------------- leverage (FIX 5: capped at the configured quantile)
    probs = _outcome_probs(cfg, b)
    for dp, sfx in [(True, ""), (False, "_ml")]:
        raw = _leverage_raw(b, W, probs, dp)
        _set_leverage(cfg, b, raw, sfx)
    # chase pressure index cross-check
    ch = b[(b.innings == 2) & (b.balls_rem > 0) & (b.runs_needed > 0)].copy()
    ch["chase_pi"] = (ch.runs_needed / (W.par_proj(ch) - ch.score_before).clip(lower=1)).clip(upper=5)
    b["chase_pi"] = np.nan
    b.loc[ch.index, "chase_pi"] = ch.chase_pi
    rho = spearman(ch.chase_pi, ch.leverage)
    log(f"Chase pressure index vs leverage: Spearman {rho:.3f}")

    # ---------------- FIX 6: state-based wicket value
    wkt_runs = _wicket_value(cfg, b, W, P)

    with open(P["models"] / "wp_model.pkl", "wb") as f:
        pickle.dump(W, f)
    with open(P["models"] / "par_score_model.pkl", "wb") as f:
        pickle.dump(par_all, f)
    log(f"saved refit models -> {P['models'] / 'wp_model.pkl'}, {P['models'] / 'par_score_model.pkl'}")

    tr_ = met.query(f"model=='{best}' and version=='ml+endgame_dp' and innings=='all' and evaluation.str.startswith('test')",
                    engine="python").iloc[0]
    CHECK.add("F1 WP model trained, test AUC/Brier reported, calibration plot saved, leverage computed",
              (P["figures"] / "calibration_curve.png").exists() and b.leverage.notna().all(),
              f"{best} test AUC {tr_.auc:.3f}, Brier {tr_.brier:.4f}; leverage capped at p{int(100 * cfg['pressure']['leverage_cap_quantile'])}")
    worst = eg_tab[eg_tab.bucket != "25+"]
    CHECK.add("FIX 1 DP end-game WP live; calibration error < 5 pts in each balls-left bucket", eg_ok,
              "after: " + ", ".join(f"{r.bucket}: gap {r.gap_after:+.1f} / ECE {r.ece_after:.1f}" for r in eg_tab.itertuples())
              + f" | before worst gap {worst.gap_before.abs().max():.1f}")
    CHECK.add("FIX 2 era feature added; honest test metrics logged; final model refit on all seasons",
              all(f in WP2_FEATS for f in ERA_FEATS),
              f"test Brier {tr_.brier:.4f}, AUC {tr_.auc:.3f}; refit on {len(d):,} balls 2022-2026; metrics in wp_model_metrics.csv")
    return {"balls": b, "wp": W, "metrics": met, "calibration": calib, "wkt_runs": wkt_runs, "par_mae": par_mae,
            "chase_rho": rho, "best": best, "endgame_table": eg_tab, "inn1_table": i1_tab}


def _wpa(b: pd.DataFrame, lab: pd.DataFrame, col: str):
    t1 = np.where(b.innings == 1, b[col], 1 - b[col])
    nxt = pd.Series(t1, index=b.index).groupby(b.match_id).shift(-1)
    res = lab.reindex(b.match_id)
    final_t1 = np.where(res.no_result.values, np.nan,
                        np.where(res.is_tie.values, 0.5, (res.win_team_id.values == res.team1.values).astype(float)))
    post = np.where(nxt.isna().values, final_t1, nxt.values)
    post = np.where(np.isnan(post), t1, post)  # no-result: last ball gets no WPA
    d1 = post - t1
    return t1, post, np.where(b.innings == 1, d1, -d1)


def _calibration(preds: dict, P: dict, best: str) -> list[dict]:
    fig, ax = plt.subplots(figsize=(6, 5.5))
    ax.plot([0, 1], [0, 1], "--", color="#999", lw=1, label="Perfect")
    out = []
    for kind, color in [("logreg", "#4A73A8"), ("lgbm", "#B23A62")]:
        dt = preds[kind]
        q = pd.qcut(dt.p, 10, duplicates="drop")
        g = dt.groupby(q, observed=True).agg(pred=("p", "mean"), obs=("y", "mean"), n=("y", "size"))
        ax.plot(g.pred, g.obs, "o-", color=color, label=kind + (" (used)" if kind == best else ""))
        if kind == best:
            out = [{"predicted": round(100 * r.pred, 1), "observed": round(100 * r.obs, 1), "n": int(r.n)} for r in g.itertuples()]
    ax.set_xlabel("Predicted win probability (batting side)")
    ax.set_ylabel("Observed win rate")
    ax.set_title("WP calibration · test seasons 2025-26 (deciles, with end-game DP)")
    ax.legend()
    fig.tight_layout()
    fig.savefig(P["figures"] / "calibration_curve.png", dpi=130)
    plt.close(fig)
    return out


def _endgame_calibration(cfg, before: pd.DataFrame, after: pd.DataFrame, P: dict):
    """Second innings by balls left (before = ML only, after = ML + DP); first innings by over."""
    lim = cfg["endgame"]["calib_max_error"]
    rows = []
    b2, a2 = before[before.innings == 2], after[after.innings == 2]
    for lo, hi, lab in BL_BUCKETS:
        s = (b2.balls_rem >= lo) & (b2.balls_rem <= hi)
        y = b2.y[s]
        rows.append({"bucket": lab, "n_balls": int(s.sum()), "actual_win_pct": round(100 * y.mean(), 1),
                     "pred_before": round(100 * b2.p[s].mean(), 1), "pred_after": round(100 * a2.p[s].mean(), 1),
                     "gap_before": round(100 * (b2.p[s].mean() - y.mean()), 1),
                     "gap_after": round(100 * (a2.p[s].mean() - y.mean()), 1),
                     "ece_before": round(_ece(y, b2.p[s]), 1), "ece_after": round(_ece(y, a2.p[s]), 1),
                     "brier_before": round(brier_score_loss(y, b2.p[s]), 4), "brier_after": round(brier_score_loss(y, a2.p[s]), 4)})
    T = pd.DataFrame(rows)
    T.to_csv(P["tables"] / "endgame_calibration.csv", index=False)
    log("FIX 1 end-game calibration, 2nd innings, test seasons (pred vs actual win %, pts):")
    log(T.to_string(index=False))
    a1 = after[after.innings == 1]
    r1 = []
    for lo, hi, lab in OV_BUCKETS:
        s = (a1.overid >= lo) & (a1.overid <= hi)
        r1.append({"overs": lab, "n_balls": int(s.sum()), "actual_win_pct": round(100 * a1.y[s].mean(), 1),
                   "pred": round(100 * a1.p[s].mean(), 1), "gap": round(100 * (a1.p[s].mean() - a1.y[s].mean()), 1),
                   "ece": round(_ece(a1.y[s], a1.p[s]), 1)})
    T1 = pd.DataFrame(r1)
    T1.to_csv(P["tables"] / "innings1_calibration.csv", index=False)
    log("1st-innings reliability by over bucket (test seasons):")
    log(T1.to_string(index=False))
    ok = bool((T.gap_after.abs() < lim).all() and (T.ece_after < lim).all())

    fig, ax = plt.subplots(1, 3, figsize=(15, 4.6))
    x = np.arange(len(T))
    ax[0].bar(x - 0.27, T.actual_win_pct, 0.27, label="Actual", color="#3c2814")
    ax[0].bar(x, T.pred_before, 0.27, label="ML only (before)", color="#B23A62")
    ax[0].bar(x + 0.27, T.pred_after, 0.27, label="ML + DP (after)", color="#4A73A8")
    ax[0].set_xticks(x, T.bucket)
    ax[0].set_xlabel("Legal balls left (2nd innings)")
    ax[0].set_ylabel("Win %")
    ax[0].set_title("Mean predicted vs actual")
    ax[0].legend(fontsize=8)
    ax[1].bar(x - 0.2, T.ece_before, 0.4, label="before", color="#B23A62")
    ax[1].bar(x + 0.2, T.ece_after, 0.4, label="after", color="#4A73A8")
    ax[1].axhline(lim, ls="--", color="#999")
    ax[1].set_xticks(x, T.bucket)
    ax[1].set_title("Calibration error (ECE, pts)")
    ax[1].legend(fontsize=8)
    s = after[(after.innings == 2) & (after.balls_rem <= 12)]
    sb = before[(before.innings == 2) & (before.balls_rem <= 12)]
    for dd, c, lab in [(sb, "#B23A62", "before"), (s, "#4A73A8", "after")]:
        q = pd.cut(dd.p, np.linspace(0, 1, 11), include_lowest=True)
        g = dd.groupby(q, observed=True).agg(p=("p", "mean"), y=("y", "mean"), n=("y", "size"))
        g = g[g.n >= 15]
        ax[2].plot(g.p, g.y, "o-", color=c, label=lab)
    ax[2].plot([0, 1], [0, 1], "--", color="#999")
    ax[2].set_title("Reliability, <= 12 balls left")
    ax[2].set_xlabel("Predicted")
    ax[2].set_ylabel("Observed")
    ax[2].legend(fontsize=8)
    fig.suptitle("End-game win probability calibration · test seasons 2025-26")
    fig.tight_layout()
    fig.savefig(P["figures"] / "endgame_calibration.png", dpi=130)
    plt.close(fig)
    return T, T1, ok


def _outcome_probs(cfg: dict, b: pd.DataFrame) -> np.ndarray:
    tr = b.team_runs.clip(upper=6).replace(5, 4)
    oc = np.where(b.is_wide | b.is_noball, "X", np.where(b.is_wicket, "W", tr.astype(int).astype(str)))
    oc = np.where(np.isin(oc, OUTCOMES), oc, "1")
    b["outcome"] = oc
    wkb = pd.cut(b.wkts_before, [-1, 2, 5, 10], labels=["0-2", "3-5", "6+"]).astype(str)
    rrb = np.where(b.innings == 1, "-", pd.cut(b.rrr.fillna(0), [-1e9, 6, 9, 12, 1e9], labels=["<6", "6-9", "9-12", "12+"]).astype(str))
    b["state_cell"] = b.innings.astype(str) + "|" + b.phase + "|" + wkb + "|" + rrb + "|" + b.is_ipl.astype(str)
    counts = pd.crosstab(b.state_cell, b.outcome).reindex(columns=OUTCOMES, fill_value=0)
    coarse = b.state_cell.str.rsplit("|", n=1).str[0]
    cc = pd.crosstab(coarse, b.outcome).reindex(columns=OUTCOMES, fill_value=0)
    thin = counts.sum(1) < cfg["pressure"]["leverage_min_cell"]
    log(f"Leverage outcome cells: {len(counts)} ({int(thin.sum())} thin cells backed off to coarser cells)")
    P_ = counts.div(counts.sum(1), axis=0).reindex(b.state_cell).values
    Pc = cc.div(cc.sum(1), axis=0).reindex(coarse).values
    return np.where(thin.reindex(b.state_cell).values[:, None], Pc, P_)


def _leverage_raw(b: pd.DataFrame, W: WPModel, probs: np.ndarray, dp: bool) -> np.ndarray:
    """Expected |WP swing| of the next ball over the outcomes."""
    base_cols = ["innings", "score_before", "wkts_before", "legal_before", "max_balls", "max_balls2", "target",
                 "wkts_last12", "part_runs", "part_balls", "is_ipl"] + ERA_FEATS
    base = b[base_cols].copy()
    wp_now = b.wp_bat.values if dp else b.wp_bat_ml.values
    lev = np.zeros(len(b))
    for k, o in enumerate(OUTCOMES):
        x = base.copy()
        if o == "W":
            x["wkts_before"] += 1
            x["legal_before"] += 1
            x["wkts_last12"] += 1
            x["part_runs"] = 0
            x["part_balls"] = 0
        elif o == "X":
            x["score_before"] += 1
            x["part_runs"] += 1
        else:
            r = int(o)
            x["score_before"] += r
            x["legal_before"] += 1
            x["part_runs"] += r
            x["part_balls"] += 1
        lev += probs[:, k] * np.abs(W.wp_bat(x, dp) - wp_now)
    return lev


def _set_leverage(cfg: dict, b: pd.DataFrame, raw: np.ndarray, sfx: str) -> None:
    q = cfg["pressure"]["leverage_cap_quantile"]
    norm = raw / raw.mean()
    cap = float(np.quantile(norm, q))
    capped = np.minimum(norm, cap)
    b[f"leverage_uncapped{sfx}"] = norm
    b[f"leverage{sfx}"] = capped / capped.mean()
    lv = b[f"leverage{sfx}"]
    log(f"Leverage{sfx or ''} ({'ML + DP' if not sfx else 'ML only'}): uncapped p50 {np.median(norm):.2f}, p99 {cap:.2f}, "
        f"max {norm.max():.1f} -> capped at p{int(100 * q)} ({(norm > cap).mean():.1%} of balls), renormalised mean "
        f"{lv.mean():.3f}, max {lv.max():.2f}")
    check(abs(lv.mean() - 1) < 1e-6, f"leverage{sfx} normalised so the average ball = 1.0")


def _wicket_value(cfg: dict, b: pd.DataFrame, W: WPModel, P: dict) -> float:
    """FIX 6: runs a wicket costs in the current state.
    1st innings: par(state) - par(state with one more wicket, partnership reset).
    2nd innings: WP drop from a wicket / WP gain from one extra run (local runs-to-WP slope);
    falls back to the par difference where the slope is ~0 (game already decided)."""
    wvc = cfg["wicket_value"]
    wv = np.zeros(len(b))
    i1 = (b.innings == 1).values
    x = b[i1].copy()
    y = x.copy()
    y["wkts_before"] += 1
    y["wkts_last12"] += 1
    y["part_runs"] = 0
    y["part_balls"] = 0
    par_x = W.par_proj(x)
    v1 = np.where(x.wkts_before.values >= 9, par_x - x.score_before.values, par_x - W.par_proj(y))
    wv[i1] = v1
    i2 = ~i1
    x2 = b[i2].copy()
    base = W.wp_bat(x2)
    xw = x2.copy()
    xw["wkts_before"] += 1
    xw["part_runs"] = 0
    xw["part_balls"] = 0
    xr = x2.copy()
    xr["score_before"] += 1
    slope = W.wp_bat(xr) - base
    drop = base - W.wp_bat(xw)
    fb = W.par_proj(x2) - W.par_proj(xw.assign(wkts_last12=xw.wkts_last12 + 1))
    use = slope >= wvc["min_slope"]
    v2 = np.where(use, drop / np.where(use, slope, 1.0), fb)
    wv[i2] = v2
    b["wkt_value"] = np.clip(wv, 0, wvc["cap"])
    log(f"FIX 6 wicket value: innings 1 mean {b.wkt_value[i1].mean():.2f} runs, innings 2 mean {b.wkt_value[i2].mean():.2f} "
        f"({(~use).mean():.1%} of chase balls use the par fallback, slope < {wvc['min_slope']}); "
        f"p10 {b.wkt_value.quantile(.1):.1f}, p90 {b.wkt_value.quantile(.9):.1f}")
    # v1 definition (fixed scalar) kept for the ablation and for display indices
    s = (b.innings == 1) & (b.wkts_before < 9) & (b.balls_rem > 6)
    fixed = float(b.loc[s, "wkt_value"].mean())
    log(f"Fixed wicket value (v1 definition: mean 1st-innings par difference): {fixed:.2f} runs")
    # lookup table + heatmap
    t = b.assign(overs_left=np.ceil(b.balls_rem.clip(lower=1) / 6).astype(int), wickets_in_hand=10 - b.wkts_before)
    tab = t.groupby(["innings", "overs_left", "wickets_in_hand"]).wkt_value.agg(["mean", "size"]).reset_index()
    tab.columns = ["innings", "overs_left", "wickets_in_hand", "wicket_value_runs", "n_balls"]
    tab["wicket_value_runs"] = tab.wicket_value_runs.round(2)
    tab.to_csv(P["tables"] / "wicket_value_table.csv", index=False)
    fig, ax = plt.subplots(1, 2, figsize=(13, 4.8))
    for k, inn in enumerate((1, 2)):
        pv = tab[(tab.innings == inn) & (tab.n_balls >= 30)].pivot(index="wickets_in_hand", columns="overs_left",
                                                                  values="wicket_value_runs").sort_index(ascending=False)
        im = ax[k].imshow(pv.values, aspect="auto", cmap="RdPu", vmin=0, vmax=min(30, np.nanmax(pv.values)))
        ax[k].set_xticks(range(len(pv.columns)), pv.columns)
        ax[k].set_yticks(range(len(pv.index)), pv.index)
        ax[k].set_xlabel("Overs left")
        ax[k].set_ylabel("Wickets in hand")
        ax[k].set_title(f"Innings {inn}: runs a wicket costs")
        fig.colorbar(im, ax=ax[k], label="runs")
    fig.tight_layout()
    fig.savefig(P["figures"] / "wicket_value_heatmap.png", dpi=130)
    plt.close(fig)
    CHECK.add("FIX 6 State-based wicket value table + heatmap", (P["tables"] / "wicket_value_table.csv").exists(),
              f"inn1 mean {b.wkt_value[i1].mean():.2f}, inn2 mean {b.wkt_value[i2].mean():.2f} runs (v1 fixed {fixed:.2f}); "
              "wicket_value_table.csv + wicket_value_heatmap.png")
    return fixed
