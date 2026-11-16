"""Stage 7: shrinkage (F4), rating, bootstrap rank confidence (F5), top 10, captain tie-break (F17).

Rating (0-100):
  1. every component is shrunk toward the population mean (Empirical Bayes, prior
     strength estimated from the data),
  2. standardised among eligible players,
  3. combined with the config weights,
  4. mapped to 0-100 as 100 * Phi(z / scale_divisor), z = standardised composite
     (50 = average eligible player; with divisor 2, 84 = two SD above average).
The scaling parameters are frozen from the full-sample fit and reused in the
bootstrap, so bootstrap ratings are on the same scale.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from scipy.stats import norm

from player_metrics import BAT_COMPS, BOWL_COMPS
from pressure_index import Options
from utils import eb_prior_strength, log

RATING_COMPS = {
    "bat": ["nrae_p", "runs_ae_p", "out_ae_p", "wpa_p", "delta", "consistency", "rescue", "collapse", "matchup_ppdeath"],
    "bowl": ["rsae_p", "wae_p", "dot_p", "wpa_p", "delta", "consistency", "death_clamp", "pp_control", "control", "heist",
             "pair_breaker"],
}
COMP_LAYER = {"rescue": "F11", "collapse": "F14", "matchup_ppdeath": "F8", "death_clamp": "F7", "pp_control": "F8",
              "control": "F9", "heist": "F11", "pair_breaker": "F13"}
DELTA = {"bat": ("nrae_p", "nrae_n"), "bowl": ("nrs_p", "nrs_n")}


class Rater:
    def __init__(self, cfg: dict, side: str, PM: pd.DataFrame, o: Options, weights: dict | None = None,
                 min_pb: int | None = None, min_m: int | None = None, comps: list | None = None):
        self.cfg, self.side = cfg, side
        self.kinds = BAT_COMPS if side == "bat" else BOWL_COMPS
        w = dict(weights or (cfg["rating"]["batter_weights"] if side == "bat" else cfg["rating"]["bowler_weights"]))
        for c in list(w):
            if comps is not None and c not in comps:
                w[c] = 0.0
            if COMP_LAYER.get(c) in o.off or (c == "matchup_ppdeath" and "F3" in o.off):
                w[c] = 0.0
        self.w = w
        ec = cfg["eligibility"]
        self.min_pb = min_pb if min_pb is not None else (ec["batter_min_pressure_balls"] if side == "bat" else ec["bowler_min_pressure_balls"])
        self.min_m = min_m if min_m is not None else (ec["batter_min_matches"] if side == "bat" else ec["bowler_min_matches"])
        S = self.sums(PM)
        self.base_comps = [c for c in self.kinds]
        # ---- EB priors from the population (players with a reasonable sample)
        sc = cfg["shrinkage"]
        self.prior = {}
        for c, (kind, _) in self.kinds.items():
            n = S[f"{c}_den"]
            keep = n >= 10 if kind == "mean" else n >= 3
            if keep.sum() < 5:
                self.prior[c] = (0.0, sc["max_prior_balls"], 1e-6)
                continue
            sq = S[f"{c}_sq"][keep] if f"{c}_sq" in S else None
            self.prior[c] = eb_prior_strength(S[f"{c}_num"][keep], n[keep], sq, sc["min_prior_balls"],
                                              sc["max_prior_balls"], p_rate=(kind == "rate"))
        # ---- eligibility
        S["eligible"] = (S.p_balls >= self.min_pb) & (S.matches_p >= self.min_m)
        self.eligible_ids = S.index[S.eligible]
        V = self._values(S)
        E = V.loc[S.eligible]
        # Standardise each shrunk component by its true-talent SD (tau), not by the spread of
        # the shrunk values: z-scoring shrunk values would undo the shrinkage, whereas dividing
        # by tau keeps noisy components (heavily shrunk) at low variance, so they count less.
        # The delta has no single prior, so it uses the eligible players' SD.
        self.z = {}
        for c in RATING_COMPS[side]:
            if c == "delta":
                self.z[c] = (E[c].mean(), E[c].std() if E[c].std() > 0 else 1.0)
            else:
                mu, m, tau = self.prior[c]
                self.z[c] = (mu, tau if tau > 0 else 1.0)
        comp = self._composite(V)
        self.comp_sd = comp[S.eligible].std() if S.eligible.sum() > 2 else 1.0
        self.S = S

    @staticmethod
    def sums(PM: pd.DataFrame) -> pd.DataFrame:
        S = PM.groupby(level="pid").sum()
        S["matches_p"] = (PM.p_balls > 0).groupby(level="pid").sum()
        S["matches"] = (PM.balls > 0).groupby(level="pid").sum()
        return S

    def _values(self, S: pd.DataFrame) -> pd.DataFrame:
        V = pd.DataFrame(index=S.index)
        for c in self.kinds:
            mu, m, _ = self.prior[c]
            V[c] = (S[f"{c}_num"] + m * mu) / (S[f"{c}_den"] + m)
        a, bb = DELTA[self.side]
        V["delta"] = V[a] - V[bb]
        return V

    def _composite(self, V: pd.DataFrame) -> pd.Series:
        comp = pd.Series(0.0, index=V.index)
        for c in RATING_COMPS[self.side]:
            mu, sd = self.z[c]
            comp += self.w.get(c, 0.0) * (V[c] - mu) / sd
        return comp

    def rate(self, S: pd.DataFrame | None = None) -> pd.DataFrame:
        S = self.S if S is None else S
        V = self._values(S)
        comp = self._composite(V)
        V["composite"] = comp
        V["rating"] = 100 * norm.cdf(comp / self.comp_sd / self.cfg["rating"]["scale_divisor"])
        for c in ["p_balls", "balls", "matches", "matches_p"]:
            if c in S:
                V[c] = S[c]
        if "eligible" in S:
            V["eligible"] = S["eligible"]
        return V

    def table(self) -> pd.DataFrame:
        V = self.rate()
        E = V[V.eligible].sort_values("rating", ascending=False)
        E["rank"] = np.arange(1, len(E) + 1)
        return E

    def rate_matrix(self, M: np.ndarray, cols: list[str]) -> np.ndarray:
        """Ratings for many resampled sum-vectors at once (rows = bootstrap draws)."""
        S = pd.DataFrame(M, columns=cols)
        return self.rate(S)["rating"].values


def component_reliability(R: Rater, PM: pd.DataFrame) -> dict[str, float]:
    """Split-half (odd vs even matches) Spearman-Brown reliability of every rating component."""
    ids = R.eligible_ids
    P = PM.loc[PM.index.get_level_values(0).isin(ids)].copy()
    P["k"] = P.groupby(level=0).cumcount()
    a = R.rate(Rater.sums(P[P.k % 2 == 1].drop(columns="k"))).loc[ids]
    c = R.rate(Rater.sums(P[P.k % 2 == 0].drop(columns="k"))).loc[ids]
    out = {}
    for comp in RATING_COMPS[R.side]:
        r = float(np.corrcoef(a[comp], c[comp])[0, 1]) if a[comp].std() > 0 and c[comp].std() > 0 else 0.0
        out[comp] = 2 * r / (1 + r) if r > 0 else 0.0
    return out


def reliability_weights(cfg: dict, side: str, R: Rater, PM: pd.DataFrame) -> dict[str, float]:
    """Final weight = config prior x clip(split-half reliability, floor, 1). Logged as the
    data-based justification for every weight."""
    key = "batter_weights" if side == "bat" else "bowler_weights"
    prior = cfg["rating"][key]
    rel = component_reliability(R, PM)
    floor = cfg["rating"]["reliability_floor"]
    final = {c: round(prior[c] * float(np.clip(rel.get(c, 0.0), floor, 1.0)), 4) for c in prior}
    lab = "batters" if side == "bat" else "bowlers"
    log(f"Weight justification ({lab}): prior x split-half reliability (floor {floor})")
    for c in prior:
        log(f"   {c:<16} prior {prior[c]:+.2f} · reliability {rel.get(c, 0.0):.2f} -> final {final[c]:+.4f}")
    return final


def bootstrap(cfg: dict, R: Rater, PM: pd.DataFrame, seed: int) -> pd.DataFrame:
    """Resample each eligible player's MATCHES with replacement, re-rate on the frozen scale."""
    bc = cfg["bootstrap"]
    B = bc["iterations"]
    rng = np.random.default_rng(seed)
    ids = list(R.eligible_ids)
    cols = [c for c in PM.columns if c.endswith(("_num", "_den", "_sq"))] + ["p_balls", "balls"]
    mats = np.zeros((B, len(ids)))
    for j, pid in enumerate(ids):
        X = PM.loc[pid, cols].values  # matches x cols
        k = len(X)
        idx = rng.integers(0, k, size=(B, k))
        sums = X[idx].sum(axis=1)  # B x cols
        mats[:, j] = R.rate_matrix(sums, cols)
    ranks = (-mats).argsort(axis=1).argsort(axis=1) + 1
    lo, hi = bc["ci"]
    out = pd.DataFrame({
        "pid": ids,
        "rating_lo": np.percentile(mats, lo, axis=0),
        "rating_hi": np.percentile(mats, hi, axis=0),
        "rank_lo": np.percentile(ranks, lo, axis=0),
        "rank_hi": np.percentile(ranks, hi, axis=0),
        "p_top10": (ranks <= bc["top_n"]).mean(axis=0),
    }).set_index("pid")
    return out


def captain_analysis(PM: pd.DataFrame, p11: pd.DataFrame, side: str) -> pd.DataFrame:
    """F17: pressure performance with vs without the captaincy."""
    cap = p11.assign(cap=p11.is_captain.astype(str).str.lower().eq("true")).groupby(["player_id", "match_id"]).cap.max()
    val = "nrae_p" if side == "bat" else "nrs_p"
    x = PM[[f"{val}_num", f"{val}_den", "p_balls"]].copy()
    x["cap"] = cap.reindex(pd.MultiIndex.from_arrays([x.index.get_level_values(0), x.index.get_level_values(1)])).fillna(False).values
    g = x[x.p_balls > 0].groupby([x[x.p_balls > 0].index.get_level_values(0), "cap"]).agg(
        num=(f"{val}_num", "sum"), den=(f"{val}_den", "sum"), matches=("p_balls", "size"))
    g = g.unstack("cap")
    out = pd.DataFrame(index=g.index)
    for c, lab in [(True, "captain"), (False, "not_captain")]:
        if ("num", c) in g:
            out[f"{lab}_per_ball"] = g[("num", c)] / g[("den", c)]
            out[f"{lab}_matches"] = g[("matches", c)]
    out = out.dropna()
    out = out[(out.captain_matches >= 5) & (out.not_captain_matches >= 5)]
    out["captaincy_effect"] = out.captain_per_ball - out.not_captain_per_ball
    out.index.name = "player_id"
    return out


def top_n(table: pd.DataFrame, cap: pd.DataFrame, eps: float, n: int = 10) -> tuple[pd.DataFrame, int]:
    """Top n by rating; F17 captaincy only reorders adjacent players whose ratings differ < eps."""
    t = table.sort_values("rating", ascending=False).copy()
    key = cap.captaincy_effect.reindex(t.index).fillna(0.0).values
    order = list(range(len(t)))
    swaps = 0
    for i in range(min(len(order) - 1, n + 2)):
        a, b_ = order[i], order[i + 1]
        if abs(t.rating.iloc[a] - t.rating.iloc[b_]) < eps and key[b_] > key[a]:
            order[i], order[i + 1] = b_, a
            swaps += 1
    t = t.iloc[order]
    t["rank"] = np.arange(1, len(t) + 1)
    return t.head(n), swaps


def describe_eligibility(R: Rater, side: str) -> str:
    S = R.S
    lab = "batters" if side == "bat" else "bowlers"
    msg = (f"{lab}: {int(S.eligible.sum())} eligible of {len(S)} with any balls "
           f"(>= {R.min_pb} pressure balls and >= {R.min_m} matches with pressure balls); "
           f"{int((S.p_balls >= R.min_pb).sum())} pass the ball rule, {int((S.matches_p >= R.min_m).sum())} the match rule")
    log(msg)
    pri = ", ".join(f"{c}: m={m:.0f}" for c, (mu, m, tau) in R.prior.items())
    log(f"  EB prior strength (balls of pseudo-data toward the {lab} mean): {pri}")
    return msg
