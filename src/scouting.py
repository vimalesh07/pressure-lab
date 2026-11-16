"""Stage 9 (F16): pressure-fragile batters and weakness profiles.

Fragile = eligible batters with the most negative shrunk pressure delta, where the drop
also shows up in BOTH halves of their matches (odd and even), so it is consistent.
Weakness profiles use pressure balls only, split by bowler and delivery attributes.
Cells with fewer than `scout_min_cell_balls` balls are hidden; each cell gets a
confidence tag. Rajasthan Royals players (team_id 3, latest season) -> "Fix plan",
everyone else -> "Attack plan".
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from ranking import Rater
from utils import log, section

RR_TEAM_ID = 3  # given in the brief: Rajasthan Royals = team_id 3 (a team id, not a player name)
PHASE_NAME = {"PP": "Powerplay", "Middle": "Middle", "Death": "Death"}
DIMENSIONS = ["pace_or_spin", "bowling_type", "delivery_style", "on_or_off", "over_or_around", "phase"]


def bowler_group(t: str) -> str:
    t = str(t)
    if "offbreak" in t.lower():
        return "Off spin"
    if "leg-break" in t.lower():
        return "Leg spin"
    if "orthodox" in t.lower():
        return "Left-arm orthodox"
    if "chinaman" in t.lower():
        return "Left-arm wrist spin"
    return "Left-arm pace" if t.lower().startswith("left") else "Right-arm pace"


def confidence(n: int) -> str:
    return "High" if n >= 120 else "Medium" if n >= 50 else "Low"


def rr_squad(mapping: pd.DataFrame, comps: pd.DataFrame, m: pd.DataFrame) -> tuple[set, str]:
    mm = mapping[mapping.team_id == RR_TEAM_ID]
    seasons = m.groupby("comp_id").season.max()
    mm = mm.assign(season=mm.comp_id.map(seasons))
    latest = mm.season.max()
    sq = set(mm[mm.season == latest].player_id)
    name = mm.team_name.iloc[0] if len(mm) else "Team 3"
    log(f"Team id {RR_TEAM_ID} ({name}) latest season {latest}: {len(sq)} squad players -> Fix plans")
    return sq, name


def profile(b: pd.DataFrame, pid: int, wkt_runs: float, min_cell: int) -> pd.DataFrame:
    x = b[(b.striker_id == pid) & b.p_bat].copy()
    x["bowler_group"] = x.bowling_type.map(bowler_group)
    rows = []
    for dim in DIMENSIONS + ["bowler_group"]:
        for val, g in x.groupby(dim):
            n = int(g.faced.sum())
            if n < min_cell:
                continue
            exp = (g.e_bat_runs - wkt_runs * g.e_out).sum()
            act = (g.bat_runs - wkt_runs * g.striker_out).sum()
            idx = 100 + 100 * (act - exp) / max(abs(exp), 1e-6) if exp != 0 else 100
            rows.append({"player_id": pid, "dimension": dim, "value": val, "balls": n,
                         "sr": round(100 * g.bat_runs.sum() / n, 1),
                         "dot_pct": round(100 * (g.faced & (g.bat_runs == 0)).sum() / n, 1),
                         "dismissal_pct": round(100 * g.striker_out.sum() / n, 2),
                         "dismissals": int(g.striker_out.sum()),
                         "perf_index": round(float(np.clip(idx, 0, 250)), 1), "confidence": confidence(n)})
    return pd.DataFrame(rows)


def run(cfg: dict, b: pd.DataFrame, bat_table: pd.DataFrame, bat_rater: Rater, PMb: pd.DataFrame,
        names: pd.Series, D: dict, wkt_runs: float) -> dict:
    section("STAGE 9 · F16 PRESSURE-FRAGILE LIST AND WEAKNESS PROFILES")
    min_cell = cfg["export"]["scout_min_cell_balls"]
    squad, squad_name = rr_squad(D["mapping"], D["comps"], D["matches"])
    ids = bat_rater.eligible_ids
    P = PMb.loc[PMb.index.get_level_values(0).isin(ids)].copy()
    P["k"] = P.groupby(level=0).cumcount()
    halves = {h: bat_rater.rate(Rater.sums(P[P.k % 2 == r].drop(columns="k"))) for h, r in [("odd", 1), ("even", 0)]}
    T = bat_table.copy()
    T["delta_odd"] = halves["odd"].delta.reindex(T.index)
    T["delta_even"] = halves["even"].delta.reindex(T.index)
    T["consistent_drop"] = (T.delta < 0) & (T.delta_odd < 0) & (T.delta_even < 0)
    fr = T[T.consistent_drop].sort_values("delta").copy()
    fr["name"] = fr.index.map(names)
    fr["plan"] = np.where(fr.index.isin(squad), "Fix plan", "Attack plan")
    log(f"Pressure-fragile batters (negative delta in full sample AND both halves): {len(fr)} of {len(T)} eligible")

    # Fix-plan candidates: squad batters with a negative delta and a usable sample (not only eligible ones)
    S = bat_rater.rate()
    fix_pool = S[S.index.isin(squad) & (S.p_balls >= 60) & (S.delta < 0)].sort_values("delta")
    log(f"Squad batters with a pressure drop and >= 60 pressure balls: {len(fix_pool)}")

    prof_ids = list(dict.fromkeys(list(fr.index[:20]) + list(fix_pool.index[:8])))
    profs = pd.concat([profile(b, pid, wkt_runs, min_cell) for pid in prof_ids], ignore_index=True) if prof_ids else pd.DataFrame()
    if len(profs):
        profs["name"] = profs.player_id.map(names)
        profs["plan"] = np.where(profs.player_id.isin(squad), "Fix plan", "Attack plan")

    cards = {}
    for pid in prof_ids:
        cards[pid] = card(b, pid, profs[profs.player_id == pid], names, squad, S, wkt_runs)
    fr["recommendation"] = [cards[p]["recommendation"] if p in cards else "" for p in fr.index]
    # a card is only shown when the displayed (unweighted) performance index also drops
    drops = [p for p in prof_ids if cards[p]["drop_pct"] < 0]
    log(f"Cards whose displayed index also drops under pressure: {len(drops)} of {len(prof_ids)}")
    return {"fragile": fr, "profiles": profs, "cards": cards, "squad": squad, "squad_name": squad_name,
            "fix_ids": [p for p in fix_pool.index if p in drops][:8],
            "attack_ids": [p for p in fr.index if p not in squad and p in drops][:8]}


def _worst(pr: pd.DataFrame, dim: str):
    x = pr[pr.dimension == dim]
    if not len(x):
        return None
    return x.sort_values("perf_index").iloc[0]


def card(b, pid, pr, names, squad, S, wkt_runs) -> dict:
    x = b[b.striker_id == pid]
    p = x[x.p_bat]
    n = x[~x.p_bat & x.faced]

    def index(g):
        exp = (g.e_bat_runs - wkt_runs * g.e_out).sum()
        act = (g.bat_runs - wkt_runs * g.striker_out).sum()
        return round(float(np.clip(100 + 100 * (act - exp) / max(abs(exp), 1e-6), 0, 250)), 1)

    ni, pi = index(n), index(p)
    vs = _worst(pr, "bowler_group")
    dl = _worst(pr, "delivery_style")
    ln = _worst(pr, "on_or_off")
    ph = _worst(pr, "phase")
    rd = p[p.striker_out]
    dis = (rd.dismissal_type.fillna("Other") + np.where(rd.stroke.notna(), " (" + rd.stroke.fillna("") + ")", "")).value_counts()
    top_stroke = rd.stroke.value_counts()
    plan = "Fix plan" if pid in squad else "Attack plan"
    vs_txt = vs.value if vs is not None else "n/a"
    dl_txt = dl.value if dl is not None else "n/a"
    ph_txt = PHASE_NAME.get(ph.value, "Death") if ph is not None else "Death"
    ln_txt = ln.value if ln is not None else "n/a"
    stroke = top_stroke.index[0] if len(top_stroke) else None
    if plan == "Fix plan":
        rec = (f"Performance index drops {ni:.0f} -> {pi:.0f} under pressure; work on {vs_txt} ({dl_txt}, {ln_txt.lower()}) "
               f"in the {ph_txt.lower()}" + (f", and on shot choice with the {stroke.lower()}, the most common dismissal shot" if stroke else "") + ".")
    else:
        rec = (f"Bowl {vs_txt} with {dl_txt.lower()} on the {ln_txt.lower()} in the {ph_txt.lower()}; performance index falls "
               f"{ni:.0f} -> {pi:.0f} under pressure" + (f" and the {stroke.lower()} is the most common dismissal shot" if stroke else "") + ".")
    return {"normal_index": ni, "pressure_index": pi, "drop_pct": round(100 * (pi - ni) / max(ni, 1), 1),
            "sample": int(p.faced.sum()), "versus": vs_txt, "delivery": dl_txt, "line": ln_txt, "phase": ph_txt,
            "dismissals": [{"type": k, "count": int(v)} for k, v in dis.head(5).items()],
            "recommendation": rec, "plan": plan,
            "confidence": confidence(int(p.faced.sum()))}
