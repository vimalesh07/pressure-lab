"""FIX 1: exact end-game win probability for the chase by dynamic programming.

State = (runs needed r, legal balls left b, wickets in hand w), per format (IPL / T20I).
Per-delivery outcomes are (team runs k, legal?, wicket?) with empirical probabilities
taken from second-innings death-over deliveries, in cells
    format x wickets-in-hand bucket x required-runs-per-ball bucket,
smoothed (Dirichlet) toward the format-pooled cell and then toward all death balls.
Extras (wides, no-balls) add runs and do NOT use up a legal ball.

Terminal rules: r <= 0 -> win (1); balls or wickets run out with r == 1 -> tie (0.5),
otherwise loss (0). Ties are scored 0.5, matching the WP model's treatment.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from utils import log

WIH_BUCKETS = [(1, 3), (4, 6), (7, 10)]
RPB_EDGES = [-np.inf, 1.0, 1.5, 2.0, np.inf]  # runs needed per legal ball left


def _wih_bucket(w: np.ndarray) -> np.ndarray:
    return np.select([w <= 3, w <= 6], [0, 1], 2)


def _rpb_bucket(r: np.ndarray, b: np.ndarray) -> np.ndarray:
    x = r / np.maximum(b, 1)
    return np.digitize(x, RPB_EDGES[1:-1])


class EndGame:
    def __init__(self, cfg: dict, b: pd.DataFrame, label: str):
        ec = cfg["endgame"]
        self.max_balls = int(ec["dp_max_balls"])
        self.R = int(ec["max_runs"])
        alpha = float(ec["smoothing"])
        x = b[(b.innings == 2) & (b.overid >= ec["death_from_over"]) & (b.runs_needed > 0) & (b.balls_rem > 0)]
        k = np.where(x.legal, np.minimum(x.team_runs, 6), np.minimum(x.team_runs, 7)).astype(int)
        k = np.where(x.is_wicket & x.legal, np.minimum(k, 3), k)
        cat = pd.Series(list(zip(k, x.legal.astype(int), x.is_wicket.astype(int))), index=x.index)
        self.cats = sorted(set(cat))
        ci = {c: i for i, c in enumerate(self.cats)}
        cidx = cat.map(ci).values
        fmt = x.is_ipl.values.astype(int)
        wb = _wih_bucket((10 - x.wkts_before).values)
        rb = _rpb_bucket(x.runs_needed.values, x.balls_rem.values)
        nC, nR = len(self.cats), len(RPB_EDGES) - 1
        cnt = np.zeros((2, 3, nR, nC))
        np.add.at(cnt, (fmt, wb, rb, cidx), 1)
        glob = cnt.sum((0, 1, 2))
        glob = glob / glob.sum()
        pooled = cnt.sum(0)  # wih x rpb, both formats
        pooled_p = (pooled + alpha * glob) / (pooled.sum(-1, keepdims=True) + alpha)
        self.P = (cnt + alpha * pooled_p[None]) / (cnt.sum(-1, keepdims=True) + alpha)  # fmt x wih x rpb x cat
        self.n_balls = len(x)
        thin = int((cnt.sum(-1) < 200).sum())
        log(f"End-game DP ({label}): {len(x):,} 2nd-innings death deliveries, {nC} outcome types, "
            f"{2 * 3 * nR} cells ({thin} with < 200 balls, smoothed toward pooled rates, alpha {alpha:g})")
        self.V = {f: self._solve(f) for f in (0, 1)}

    def _solve(self, f: int) -> np.ndarray:
        """V[w, b, r] for w in 0..10, b in 0..max_balls, r in 0..R."""
        B, R = self.max_balls, self.R
        V = np.zeros((11, B + 1, R + 1))
        term = np.zeros(R + 1)
        term[0] = 1.0
        term[1] = 0.5
        V[0, :, :] = term
        V[:, 0, :] = term
        V[:, :, 0] = 1.0
        cats = self.cats
        rr = np.arange(1, R + 1)
        # Extras (illegal deliveries) keep the same (w, b) state, so V[w, b, r] depends on
        # V[w, b, r - k] for k >= 1: solving r in increasing order resolves that dependency.
        illegal = [(j, k, wk) for j, (k, lg, wk) in enumerate(cats) if lg == 0]
        legal = [(j, k, wk) for j, (k, lg, wk) in enumerate(cats) if lg == 1]
        for w in range(1, 11):
            wb = _wih_bucket(np.array([w]))[0]
            for bb in range(1, B + 1):
                rpb = _rpb_bucket(rr.astype(float), np.full(R, bb))
                p = self.P[f, wb][rpb]  # R x nC
                v = np.zeros(R)
                for j, k, wk in legal:  # these move to (w - wk, bb - 1): already solved
                    r2 = rr - k
                    w2, b2 = w - wk, bb - 1
                    if w2 == 0 or b2 == 0:
                        nxt = np.where(r2 <= 0, 1.0, np.where(r2 == 1, 0.5, 0.0))
                    else:
                        nxt = np.where(r2 <= 0, 1.0, V[w2, b2, np.clip(r2, 0, R)])
                    v += p[:, j] * nxt
                row = V[w, bb]
                for i, r in enumerate(rr):  # illegal deliveries: same (w, bb), fewer runs needed
                    s = v[i]
                    for j, k, wk in illegal:
                        r2 = r - k
                        if r2 <= 0:
                            s += p[i, j]
                        elif wk and w - wk == 0:  # run out off a wide that ends the innings
                            s += p[i, j] * (0.5 if r2 == 1 else 0.0)
                        else:
                            s += p[i, j] * (row[r2] if not wk else V[w - wk, bb, r2])
                    row[r] = s
        return V

    def wp(self, runs_needed, balls_rem, wkts_before, is_ipl) -> np.ndarray:
        r = np.asarray(runs_needed, float)
        bb = np.clip(np.asarray(balls_rem, int), 0, self.max_balls)
        w = np.clip(10 - np.asarray(wkts_before, int), 0, 10)
        f = np.asarray(is_ipl, int)
        ri = np.clip(r, 0, self.R).astype(int)
        out = np.where(f == 1, self.V[1][w, bb, ri], self.V[0][w, bb, ri])
        out = np.where(r > self.R, 0.0, out)
        return np.where(r <= 0, 1.0, out)
