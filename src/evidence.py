"""Stage 10e: evidence replays for every top-10 player (public/data/evidence.json).

For each top-10 batter and bowler, the matches where the WPA they earned on pressure
balls was highest, with every delivery they were involved in and the reason the model
rated it as pressure: leverage (from the win-probability model), match stakes and
opponent threat, plus the side-specific pressure percentile. The "situation" label is a
plain-language description of the game state; it does not decide anything.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from utils import CHECK, log

LEVELS = [(0.95, "Extreme"), (0.90, "Very high"), (0.80, "High")]
PHASE_TXT = {"PP": "powerplay", "Middle": "middle overs", "Death": "death overs"}


def level(p: float) -> str:
    for cut, lab in LEVELS:
        if p >= cut:
            return lab
    return "Normal"


def situation(r, side: str) -> str:
    ph = PHASE_TXT[r.phase]
    close = 0.2 <= r.wp_bat <= 0.8
    if side == "bat":
        if r.wkts_last12 >= 2:
            return "Batting through a collapse"
        if r.innings == 2:
            if r.balls_rem <= 6:
                return "Last-over chase"
            if r.phase == "Death" and close:
                return "Tight chase at the death"
            if pd.notna(r.rrr) and r.rrr >= 10:
                return f"Chase with the rate climbing ({r.rrr:.1f} an over)"
            return f"Chasing in the {ph}"
        if r.phase == "PP" and r.wkts_before >= 2:
            return "Early wickets down in the powerplay"
        if r.phase == "Death":
            return "Finishing the innings"
        return f"Setting a total in the {ph}"
    if r.part_runs >= 40:
        return "Breaking a set partnership"
    if r.innings == 2:
        if r.balls_rem <= 6:
            return "Defending the last over"
        if r.phase == "Death" and close:
            return "Defending a tight finish"
        if r.wp_bat >= 0.7:
            return "Pulling back a chase that is slipping away"
        return f"Defending in the {ph}"
    return {"PP": "New-ball spell in the powerplay", "Middle": "Middle-overs squeeze",
            "Death": "Death-over containment"}[r.phase]


def _score(total, wkts, legal) -> str:
    if pd.isna(total) or pd.isna(legal):
        return "–"
    w = 0 if pd.isna(wkts) else int(wkts)
    return f"{int(total)}/{w} ({int(legal) // 6}.{int(legal) % 6})"


SIDE_COLS = {"bat": ("striker_id", "wpa_bat", "p_bat", "bowler_tier", "batting_team_id"),
             "bowl": ("bowler_id", "wpa_bowl", "p_bowl", "striker_tier", "bowling_team_id")}


def pressure_pct(b: pd.DataFrame) -> dict:
    """Side-specific pressure percentile: the flag is "top 20 % of that side's weight"."""
    pct_bat = pd.Series(0.0, index=b.index)
    pct_bat[b.faced] = b.pw_bat[b.faced].rank(pct=True)
    return {"bat": pct_bat, "bowl": b.pw_bowl.rank(pct=True)}


class MatchCache:
    """Balls of one match (+ row positions), built once and shared by every exporter."""

    def __init__(self, b: pd.DataFrame):
        self.b, self.d = b, {}

    def get(self, mid):
        if mid not in self.d:
            mx = self.b[self.b.match_id == mid]
            self.d[mid] = (mx, {ix: i for i, ix in enumerate(mx.index)})
        return self.d[mid]


def curve(mx: pd.DataFrame) -> list[dict]:
    return [{"innings": int(r.innings), "over": r.over_label, "idx": i, "wp": round(100 * r.wp_team1, 1),
             "pressure": round(float(r.pressure_pct), 3)} for i, r in enumerate(mx.itertuples(index=False))]


def match_summary(X, mr) -> dict:
    return {"competition": str(mr.comp_name), "stage": str(mr.stage),
            "date": mr.match_date.strftime("%Y-%m-%d"), "venue": str(mr.venue_country),
            "teamA": str(X.team_name.get(int(mr.team1), mr.team1)),
            "teamB": str(X.team_name.get(int(mr.team2), mr.team2)),
            "scoreA": _score(mr.total1, mr.wkts1, mr.legal1), "scoreB": _score(mr.total2, mr.wkts2, mr.legal2),
            "result": str(mr.result)}


def player_in_match(C: dict, X, mid, pid, side: str, pct: dict, cache: MatchCache, outcome_text) -> dict | None:
    """Every delivery `pid` was involved in (as batter or bowler) in match `mid`, with the reasons the model
    rated it as pressure, plus the player's line. None when the player has no balls on that side."""
    key, wcol, pcol, tier, team_col = SIDE_COLS[side]
    cap = C["cfg"]["stakes"]["cap"]
    mx, pos = cache.get(mid)
    mr = X.m.loc[mid]
    mine = mx[mx[key] == pid]
    if side == "bat":
        mine = mine[mine.faced]
    if not len(mine):
        return None
    team = mine[team_col].iloc[0]
    t1 = int(team) == int(mr.team1)
    rows = []
    for ix, r in zip(mine.index, mine.itertuples(index=False)):
        wb = r.wp_team1 if t1 else 1 - r.wp_team1
        wa = r.wp_team1_post if t1 else 1 - r.wp_team1_post
        p = float(pct[side].loc[ix])
        tr = str(getattr(r, tier))
        tags = []
        if r.knockout:
            tags.append("Final" if mr.stage == "Final" else "Knockout")
        if tr in ("Elite", "Strong"):
            tags.append(f"{tr} {'bowler' if side == 'bat' else 'batter'}")
        if r.fav_threat:
            tags.append("Favourite under threat")
        if getattr(r, f"stakes_nrr_{side}") > 1:
            tags.append("NRR race")
        if r.wkts_last12 >= 2:
            tags.append("Collapse")
        st = float(np.clip(getattr(r, f"stakes_core_{side}") * getattr(r, f"stakes_nrr_{side}") * r.stakes_fav, *cap))
        state = (f"{int(max(r.runs_needed, 0))} needed off {int(r.balls_rem)} · {int(r.wkts_before)} down"
                 if r.innings == 2 else
                 f"{int(r.score_before)}/{int(r.wkts_before)} after {int(r.legal_before) // 6}.{int(r.legal_before) % 6} ov")
        rows.append({
            "idx": pos[ix], "innings": int(r.innings), "over": r.over_label,
            "opponent": str(r.bowler_name if side == "bat" else r.striker_name),
            "outcome": outcome_text(r), "runs": int(r.bat_runs if side == "bat" else r.bowler_runs),
            "wicket": bool(r.striker_out if side == "bat" else r.bowler_wkt),
            "state": state, "wpBefore": round(100 * wb, 1), "wpAfter": round(100 * wa, 1),
            "wpa": round(100 * getattr(r, wcol), 1), "pressure": round(p, 3), "level": level(p),
            "isPressure": bool(getattr(r, pcol)), "situation": situation(r, side), "tags": tags,
            "factors": {"leverage": round(float(r.leverage), 2), "stakes": round(st, 2),
                        "threat": round(float(getattr(r, f"threat_mult_{side}")), 2), "threatTier": tr}})
    if side == "bat":
        line = f"{int(mine.bat_runs.sum())} ({int(mine.faced.sum())})"
    else:
        lg = int(mine.legal.sum())
        line = f"{lg // 6}.{lg % 6}-{int(mine.bowler_runs.sum())}-{int(mine.bowler_wkt.sum())}"
    won = bool(mr.win_team_id == team) if pd.notna(mr.win_team_id) else None
    return {"playerTeam": X.tcode(team), "playerTeamIsA": t1, "won": won,
            "line": line, "pressureBalls": int(sum(d["isPressure"] for d in rows)),
            "pressureWpa": round(100 * float(mine.loc[mine[pcol], wcol].sum()), 1),
            "matchWpa": round(100 * float(mine[wcol].sum()), 1),
            "deliveries": rows}


def build(C: dict, X, outcome_text) -> dict:
    b, m, cfg = C["b"], X.m, C["cfg"]
    n_matches = cfg["export"].get("evidence_matches", 3)
    ok = set(m[m.has_bbb & ~m.no_result & m.total2.notna()].index)
    pct = pressure_pct(b)
    C["pressure_pct"] = pct
    raw = C["raw"]
    cache = C.setdefault("match_cache", MatchCache(b))
    out, curves = {}, {}
    for side in ["bat", "bowl"]:
        key, wcol, pcol, tier, team_col = SIDE_COLS[side]
        top = C["top10"][side].join(C["boot"][side])
        for pid, t in top.iterrows():
            x = b[(b[key] == pid) & b.match_id.isin(ok)]
            if side == "bat":
                x = x[x.faced]
            pm = x[x[pcol]].groupby("match_id")[wcol].agg(["sum", "size"])
            pick = pm[pm["size"] >= 2].sort_values("sum", ascending=False).head(n_matches).index
            matches = []
            for mid in pick:
                mx, _ = cache.get(mid)
                pim = player_in_match(C, X, mid, pid, side, pct, cache, outcome_text)
                curves[str(mid)] = curve(mx)
                matches.append({"id": str(mid), **match_summary(X, m.loc[mid]), **pim})
            if side == "bat":
                rp, rn = raw["bat_p"], raw["bat_n"]
                cmp_ = {"metric": "Strike rate", "pressure": round(float(rp.sr.get(pid, np.nan)), 1),
                        "normal": round(float(rn.sr.get(pid, np.nan)), 1), "higherIsBetter": True}
            else:
                rp, rn = raw["bowl_p"], raw["bowl_n"]
                cmp_ = {"metric": "Economy", "pressure": round(float(rp.econ.get(pid, np.nan)), 2),
                        "normal": round(float(rn.econ.get(pid, np.nan)), 2), "higherIsBetter": False}
            slug = X.slug(pid)
            out[slug] = {"playerId": slug, "name": X.names.get(pid, str(pid)), "team": X.cur_team(pid),
                         "role": "batter" if side == "bat" else "bowler", "rank": int(t["rank"]),
                         "rating": round(float(t.rating), 1), "ratingLo": round(float(t.rating_lo), 1),
                         "ratingHi": round(float(t.rating_hi), 1), "pTop10": round(float(t.p_top10), 3),
                         "pressureBalls": int(t.p_balls), "pressureMatches": int(len(pm)),
                         "positiveMatchShare": round(float((pm["sum"] > 0).mean()) if len(pm) else 0.0, 3),
                         "totalPressureWpa": round(100 * float(pm["sum"].sum()), 1), "compare": cmp_,
                         "matches": matches}
            C["ref_ids"].add(pid)
    n_m = sum(len(v["matches"]) for v in out.values())
    big = max((abs(d["wpa"]) for v in out.values() for mm in v["matches"] for d in mm["deliveries"]), default=0.0)
    log(f"evidence.json: {len(out)} top-10 players, {n_m} standout matches (highest pressure-ball WPA, >= 2 pressure balls); "
        f"largest single-ball swing {big:.1f} WP points")
    n_top = len(C["top10"]["bat"]) + len(C["top10"]["bowl"])
    CHECK.add("Evidence replay for every top-10 player", len(out) == n_top and all(v["matches"] for v in out.values()),
              f"{len(out)} players, {n_m} standout matches with ball-level pressure reasons")
    return {"levels": [{"min": c, "label": lab} for c, lab in LEVELS], "players": out, "curves": curves}
