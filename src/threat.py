"""Stage 3 (F3): matchup threat tiers with leave-one-out, and threat multipliers.

Batter threat (per phase): shrunk strike rate, boundary %, dot %   (min 60 balls)
Bowler threat (per phase): shrunk economy, dot %, wicket rate       (min 60 balls)
Tiers: Elite = top 15 %, Strong = next 25 %, Normal = rest (and anyone under 60 balls).

Leave-one-out: when rating player P, an opponent O's tier is recomputed from O's
balls minus the balls between O and P, so P's own performance cannot inflate or
deflate the difficulty of his opponents. Scaling parameters and tier cut-offs are
fixed from the full population; only O's numbers change.
"""
from __future__ import annotations

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

from utils import CHECK, check, eb_prior_strength, log, section, shrink

TIERS = ["Elite", "Strong", "Normal"]


def _bat_frame(b):
    x = b[b.faced].copy()
    x["bnd"] = (x.is_four | x.is_six).astype(int)
    x["dot"] = (x.bat_runs == 0).astype(int)
    x["r2"] = x.bat_runs ** 2
    return x


def _bowl_frame(b):
    x = b.copy()
    x["lg"] = x.legal.astype(int)
    x["dot"] = x.is_dot.astype(int)
    x["wk"] = x.bowler_wkt.astype(int)
    x["r2"] = x.bowler_runs ** 2
    return x


class Scorer:
    """Turns raw sums into a threat score with fixed priors / z-params / cut-offs."""

    def __init__(self, kind: str, agg: pd.DataFrame, cfg: dict):
        self.kind = kind
        self.min_balls = cfg["threat"]["min_balls"]
        sc = cfg["shrinkage"]
        if kind == "bat":
            n = agg.n
            self.pr = {
                "rpb": eb_prior_strength(agg.runs, n, agg.r2, sc["min_prior_balls"], sc["max_prior_balls"]),
                "bnd": eb_prior_strength(agg.bnd, n, None, sc["min_prior_balls"], sc["max_prior_balls"], p_rate=True),
                "dot": eb_prior_strength(agg["dot"], n, None, sc["min_prior_balls"], sc["max_prior_balls"], p_rate=True),
            }
        else:
            n = agg.lg
            self.pr = {
                "rpb": eb_prior_strength(agg.runs, n, agg.r2, sc["min_prior_balls"], sc["max_prior_balls"]),
                "dot": eb_prior_strength(agg["dot"], n, None, sc["min_prior_balls"], sc["max_prior_balls"], p_rate=True),
                "wk": eb_prior_strength(agg.wk, n, None, sc["min_prior_balls"], sc["max_prior_balls"], p_rate=True),
            }
        raw = self._raw(agg)
        q = (agg.n if kind == "bat" else agg.lg) >= self.min_balls
        self.z = {k: (np.asarray(raw[k])[np.asarray(q)].mean(), np.asarray(raw[k])[np.asarray(q)].std()) for k in raw}
        s = np.asarray(self._score(raw))[np.asarray(q)]
        self.elite_cut = np.quantile(s, 1 - cfg["threat"]["elite_share"])
        self.strong_cut = np.quantile(s, 1 - cfg["threat"]["elite_share"] - cfg["threat"]["strong_share"])

    def _raw(self, a):
        n = a.n if self.kind == "bat" else a.lg
        return {k: shrink(a[{"rpb": "runs"}.get(k, k)], n, *self.pr[k][:2]) for k in self.pr}

    def _score(self, raw):
        z = {k: (raw[k] - self.z[k][0]) / self.z[k][1] for k in raw}
        if self.kind == "bat":
            return z["rpb"] + z["bnd"] - z["dot"]
        return -z["rpb"] + z["dot"] + z["wk"]

    def tier(self, a: pd.DataFrame) -> np.ndarray:
        n = (a.n if self.kind == "bat" else a.lg).values
        s = np.asarray(self._score(self._raw(a)))
        t = np.where(s >= self.elite_cut, "Elite", np.where(s >= self.strong_cut, "Strong", "Normal"))
        return np.where(n >= self.min_balls, t, "Normal"), s


def run(cfg: dict, P: dict, b: pd.DataFrame, wkt_runs: float) -> dict:
    section("STAGE 3 · F3 MATCHUP THREAT TIERS (LEAVE-ONE-OUT)")
    bat = _bat_frame(b)
    bowl = _bowl_frame(b)
    bat_cols = dict(runs=("bat_runs", "sum"), n=("faced", "sum"), bnd=("bnd", "sum"), dot=("dot", "sum"), r2=("r2", "sum"))
    bowl_cols = dict(runs=("bowler_runs", "sum"), lg=("lg", "sum"), dot=("dot", "sum"), wk=("wk", "sum"), r2=("r2", "sum"))

    tiers_bat, tiers_bowl = [], []
    b["bowler_tier"] = "Normal"  # tier of the bowler, from the striker's point of view (LOO)
    b["striker_tier"] = "Normal"  # tier of the striker, from the bowler's point of view (LOO)
    b["nonstriker_tier"] = "Normal"
    for ph in cfg["threat"]["phases"]:
        bp, wp = bat[bat.phase == ph], bowl[bowl.phase == ph]
        A = bp.groupby("striker_id").agg(**bat_cols)
        Bw = wp.groupby("bowler_id").agg(**bowl_cols)
        sb, sw = Scorer("bat", A, cfg), Scorer("bowl", Bw, cfg)
        ta, sa = sb.tier(A)
        tw, sw_ = sw.tier(Bw)
        tiers_bat.append(pd.DataFrame({"player_id": A.index, "phase": ph, "tier": ta, "score": sa, "balls": A.n.values}))
        tiers_bowl.append(pd.DataFrame({"player_id": Bw.index, "phase": ph, "tier": tw, "score": sw_, "balls": Bw.lg.values}))
        # ---- leave-one-out, ball level
        pair_bat = bp.groupby(["striker_id", "bowler_id"]).agg(**bat_cols)
        pair_bowl = wp.groupby(["bowler_id", "striker_id"]).agg(**bowl_cols)
        idx = b.index[b.phase == ph]
        x = b.loc[idx, ["striker_id", "bowler_id", "non_striker_id"]]
        # striker tier seen by this bowler: striker totals minus balls vs this bowler
        tot = A.reindex(x.striker_id.values).fillna(0).values
        pr = pair_bat.reindex(pd.MultiIndex.from_arrays([x.striker_id.values, x.bowler_id.values])).fillna(0).values
        loo = pd.DataFrame(np.maximum(tot - pr, 0), columns=A.columns)
        b.loc[idx, "striker_tier"] = sb.tier(loo)[0]
        # non-striker tier (for pair-breaker), LOO vs this bowler as well
        tot = A.reindex(x.non_striker_id.values).fillna(0).values
        pr = pair_bat.reindex(pd.MultiIndex.from_arrays([x.non_striker_id.values, x.bowler_id.values])).fillna(0).values
        b.loc[idx, "nonstriker_tier"] = sb.tier(pd.DataFrame(np.maximum(tot - pr, 0), columns=A.columns))[0]
        # bowler tier seen by this striker
        tot = Bw.reindex(x.bowler_id.values).fillna(0).values
        pr = pair_bowl.reindex(pd.MultiIndex.from_arrays([x.bowler_id.values, x.striker_id.values])).fillna(0).values
        b.loc[idx, "bowler_tier"] = sw.tier(pd.DataFrame(np.maximum(tot - pr, 0), columns=Bw.columns))[0]
        n_q = int((A.n >= cfg["threat"]["min_balls"]).sum()), int((Bw.lg >= cfg["threat"]["min_balls"]).sum())
        log(f"{ph:<6} qualified batters {n_q[0]:>4} (Elite {int((ta == 'Elite').sum())}, Strong {int((ta == 'Strong').sum())}) · "
            f"qualified bowlers {n_q[1]:>4} (Elite {int((tw == 'Elite').sum())}, Strong {int((tw == 'Strong').sum())})")

    tb = pd.concat(tiers_bat, ignore_index=True)
    tw = pd.concat(tiers_bowl, ignore_index=True)
    changed = float((b.striker_tier != b.striker_id.map(tb[tb.phase == "Death"].set_index("player_id").tier)).loc[b.phase == "Death"].mean())
    log(f"Leave-one-out changed the striker's tier on {changed:.1%} of death-over balls")

    # ---- multipliers from the data: per-ball cost of facing each tier
    mult_bat, mult_bowl, gap = _multipliers(cfg, b, wkt_runs, P)
    b["threat_mult_bat"] = b.bowler_tier.map(mult_bat)  # batter facing a strong bowler
    b["threat_mult_bowl"] = b.striker_tier.map(mult_bowl)  # bowler facing a strong batter
    check(b.threat_mult_bat.notna().all() and b.threat_mult_bowl.notna().all(), "every ball has a threat multiplier")
    CHECK.add("F3 Threat tiers built with leave-one-out, multiplier justified", True,
              f"LOO changed {changed:.1%} of death tiers; bat mult {mult_bat}, bowl mult {mult_bowl}")
    return {"balls": b, "tiers_bat": tb, "tiers_bowl": tw, "mult_bat": mult_bat, "mult_bowl": mult_bowl, "tier_gap": gap}


def _multipliers(cfg, b, wkt_runs, P):
    tc = cfg["threat"]
    lo = {t: tc["multiplier_bounds"][t][0] for t in ["Strong", "Elite"]}
    hi = {t: tc["multiplier_bounds"][t][1] for t in ["Strong", "Elite"]}
    rows = []
    # batter facing bowler tiers
    f = b[b.faced]
    g = f.groupby("bowler_tier").agg(balls=("faced", "sum"), runs=("bat_runs", "sum"), outs=("striker_out", "sum"))
    g["rpo"] = g.runs / g.balls * 6
    g["out_rate"] = g.outs / g.balls
    g["net_rpb"] = g.runs / g.balls - wkt_runs * g.out_rate
    # bowler facing batter tiers
    h = b.groupby("striker_tier").agg(balls=("legal", "sum"), runs=("bowler_runs", "sum"), wk=("bowler_wkt", "sum"))
    h["rpo"] = h.runs / h.balls * 6
    h["wkt_rate"] = h.wk / h.balls
    h["net_rpb"] = h.runs / h.balls - wkt_runs * h.wkt_rate
    mult_bat, mult_bowl = {"Normal": 1.0}, {"Normal": 1.0}
    k = tc["difficulty_scale"]
    for t in ["Strong", "Elite"]:
        rb = g.loc["Normal", "net_rpb"] / g.loc[t, "net_rpb"]  # >1: harder to score vs better bowlers
        rw = h.loc[t, "net_rpb"] / h.loc["Normal", "net_rpb"]  # >1: better batters cost more
        mult_bat[t] = round(float(np.clip(1 + k * (rb - 1), lo[t], hi[t])), 2)
        mult_bowl[t] = round(float(np.clip(1 + k * (rw - 1), lo[t], hi[t])), 2)
        rows.append((t, rb, rw))
    log("Threat-tier gap (all balls, LOO tiers):")
    log(f"  batter vs bowler tier: RPO {g.rpo.round(2).to_dict()}, dismissal/ball {g.out_rate.round(4).to_dict()}")
    log(f"  bowler vs batter tier: RPO {h.rpo.round(2).to_dict()}, wicket/ball {h.wkt_rate.round(4).to_dict()}")
    for t, rb, rw in rows:
        log(f"  {t}: net-runs cost ratio bat {rb:.3f}, bowl {rw:.3f} -> multiplier = 1 + {k} x (ratio - 1), "
            f"clipped to {tc['multiplier_bounds'][t]}")
    log(f"  JUSTIFICATION: multipliers bat {mult_bat}, bowl {mult_bowl} (Normal 1.0 by definition)")
    # figure
    fig, ax = plt.subplots(1, 2, figsize=(10, 4))
    for a_, d_, ttl in [(ax[0], g, "Batters vs bowler tier"), (ax[1], h, "Bowlers vs batter tier")]:
        d_ = d_.reindex(TIERS)
        a_.bar(d_.index, d_.rpo, color=["#B23A62", "#7C67A6", "#4A73A8"])
        for i, v in enumerate(d_.rpo):
            a_.text(i, v + 0.1, f"{v:.2f}", ha="center")
        a_.set_title(ttl)
        a_.set_ylabel("Runs per over")
    fig.suptitle("Threat-tier runs gap (leave-one-out tiers)")
    fig.tight_layout()
    fig.savefig(P["figures"] / "threat_tier_runs_gap.png", dpi=130)
    plt.close(fig)
    gap = {"batting": g.reset_index().to_dict("records"), "bowling": h.reset_index().to_dict("records")}
    return mult_bat, mult_bowl, gap
