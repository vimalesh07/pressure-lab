"""Stage 5: per-ball pressure weight and pressure-ball flags.

pressure weight = leverage x stakes (F6, F12, F18)            (v2, FIX 4)
The opponent's threat tier no longer decides which balls are pressure balls: opponent
strength is used in ONE place only, the expected-value models (player_metrics).
Computed separately for the batting side and the bowling side, because stakes differ by
side. Pressure ball = top X % of that side's weights. Leverage is capped at p99 (FIX 5).

`Options` switches layers off for the sensitivity tests.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

from utils import log, section


@dataclass
class Options:
    top_share: float = 0.20
    off: set = field(default_factory=set)  # e.g. {"F3", "F6", "F12", "F18", "F10", "F7", ...}
    league: str | None = None  # "IPL" or "T20I" (T20I = all non-IPL)
    rule_based: bool = False
    label: str = "baseline"
    stakes_scale: float = 1.0  # FIX 7: every stakes multiplier m -> 1 + s x (m - 1); 0 = stakes off
    v1_threat: bool = False  # FIX 4 reverted: weight also x opponent threat multiplier (v1)
    uncapped: bool = False  # FIX 5 reverted: uncapped leverage
    uniform_weights: bool = False  # FIX 5 reverted: pressure-ball metrics unweighted (v1)
    expect_variant: str | None = None  # override the expected-value variant (ablations)


def stakes(cfg: dict, b: pd.DataFrame, side: str, o: Options) -> np.ndarray:
    """Per-ball stakes multiplier for one side, rebuilt from the individual flags so that the
    effect of every multiplier can be scaled (FIX 7)."""
    sc = cfg["stakes"]
    s = o.stakes_scale
    sm = lambda m: 1.0 + s * (m - 1.0)  # noqa: E731
    st = np.ones(len(b))
    if "F6" not in o.off and sc["enabled"]:
        st *= np.where(b[f"knockout_{side}"].values == 1, sm(sc["knockout"]), 1.0)
        st *= np.where(b[f"is_final_{side}"].values, sm(sc["final_extra"]), 1.0)
        st *= np.where(b[f"must_win_{side}"].values, sm(sc["must_win"]), 1.0)
        st *= np.where(b[f"series_decider_{side}"].values, sm(sc["series_decider"]), 1.0)
        st *= np.where(b[f"dead_rubber_{side}"].values, sm(sc["dead_rubber"]), 1.0)
    if "F12" not in o.off:
        st *= np.where(b[f"nrr_race_{side}"].values, sm(sc["nrr_race"]), 1.0)
    if "F18" not in o.off and sc["favourite_under_threat"]:
        st *= np.where(b.fav_threat.values, sm(sc["favourite_bonus"]), 1.0)
    lo, hi = sc["cap"]
    return np.clip(st, sm(lo), sm(hi))  # the cap scales with the multipliers


def weights(cfg: dict, b: pd.DataFrame, o: Options) -> tuple[np.ndarray, np.ndarray]:
    """Pressure weight = capped leverage x stakes (per side)."""
    lev = b.leverage_uncapped.values if o.uncapped else b.leverage.values
    out = []
    for side in ["bat", "bowl"]:
        w = lev * stakes(cfg, b, side, o)
        if o.v1_threat:
            w = w * b[f"threat_mult_{side}"].values
        out.append(w)
    return out[0], out[1]


def metric_weights(cfg: dict, b: pd.DataFrame, o: Options) -> tuple[np.ndarray, np.ndarray]:
    """FIX 5: weights used INSIDE pressure-ball metrics: log1p(leverage x stakes)."""
    pb, pw = weights(cfg, b, o)
    if cfg["pressure"].get("log_weights", True) and not o.uniform_weights:
        return np.log1p(pb), np.log1p(pw)
    return np.ones(len(b)), np.ones(len(b))


def flags(cfg: dict, b: pd.DataFrame, o: Options) -> tuple[np.ndarray, np.ndarray]:
    """Boolean pressure flags for the batting side and the bowling side."""
    if o.rule_based:
        r = cfg["pressure"]["rule_based"]
        rule = (b.overid.values >= r["death_overs_from"]) | \
               ((b.innings.values == 2) & (b.rrr.fillna(0).values >= r["chase_rrr_at_least"])) | \
               (b.wkts_last12.values >= r["collapse_wickets_last12"])
        return rule, rule
    pb, pw = weights(cfg, b, o)
    fb = b.faced.values
    cut_b = np.quantile(pb[fb], 1 - o.top_share)
    cut_w = np.quantile(pw, 1 - o.top_share)
    return (pb >= cut_b) & fb, pw >= cut_w


def run(cfg: dict, P: dict, b: pd.DataFrame) -> dict:
    section("STAGE 5 · PRESSURE WEIGHT AND PRESSURE BALLS")
    o = Options(top_share=cfg["pressure"]["top_share"])
    pb, pw = weights(cfg, b, o)
    b["pw_bat"], b["pw_bowl"] = pb, pw
    fb, fw = flags(cfg, b, o)
    b["p_bat"], b["p_bowl"] = fb, fw
    b["pressure_any"] = fb | fw
    # 0-1 pressure index for display: percentile of the larger side weight
    b["pressure_pct"] = pd.Series(np.maximum(pb, pw)).rank(pct=True).values
    log(f"Pressure balls (top {o.top_share:.0%}): batting side {int(fb.sum()):,}, bowling side {int(fw.sum()):,}, "
        f"either {int(b.pressure_any.sum()):,} of {len(b):,} deliveries")
    # FIX 4: overlap with the v1 pressure-ball set (v1 = uncapped leverage x stakes x threat tier)
    vb, vw = flags(cfg, b, Options(top_share=o.top_share, v1_threat=True, uncapped=True))
    ov = {}
    for lab, new, old in [("batting", fb, vb), ("bowling", fw, vw)]:
        inter = int((new & old).sum())
        ov[lab] = inter / max(int((new | old).sum()), 1)
        log(f"FIX 4 pressure-ball set, {lab}: v1 (x threat) {int(old.sum()):,} vs v2 (leverage x stakes) {int(new.sum()):,}; "
            f"shared {inter:,} -> {inter / max(int(old.sum()), 1):.1%} of v1 kept, Jaccard {ov[lab]:.3f}")
    for share in cfg["pressure"]["sensitivity_shares"]:
        x, y = flags(cfg, b, Options(top_share=share))
        log(f"  threshold {share:.0%}: batting {int(x.sum()):,}, bowling {int(y.sum()):,}")
    rb, _ = flags(cfg, b, Options(rule_based=True))
    log(f"Rule-based pressure (death, chase RRR >= 9, or 2+ wkts in last 12) flags {rb.mean():.1%} of balls; "
        f"overlap with leverage-based batting flag: {(rb & fb).sum() / max(fb.sum(), 1):.1%}")
    by_phase = b.groupby("phase").agg(lev=("leverage", "mean"), p=("p_bowl", "mean"))
    log(f"Mean leverage by phase: {by_phase.lev.round(2).to_dict()}; share of balls that are pressure balls "
        f"(bowling side): {by_phase.p.round(3).to_dict()}")
    _figure(P, b)
    return {"balls": b, "overlap_v1": ov}


def _figure(P, b):
    fig, ax = plt.subplots(1, 2, figsize=(11, 4))
    ax[0].hist(np.clip(b.leverage, 0, 6), bins=80, color="#B23A62")
    ax[0].axvline(1, color="#333", ls="--", lw=1)
    ax[0].set_title("Leverage per ball (mean = 1.0, clipped at 6)")
    ax[0].set_xlabel("Leverage")
    for ph, c in [("PP", "#4A73A8"), ("Middle", "#7C67A6"), ("Death", "#B23A62")]:
        x = b[b.phase == ph].groupby("overid").leverage.mean()
        ax[1].plot(x.index, x.values, "o-", color=c, label=ph)
    ax[1].set_title("Mean leverage by over")
    ax[1].set_xlabel("Over")
    ax[1].legend()
    fig.tight_layout()
    fig.savefig(P["figures"] / "leverage_distribution.png", dpi=130)
    plt.close(fig)
