"""Stage 4: match stakes (F6), team Elo (F10), IPL NRR race (F12), favourite under threat (F18).

Stakes are computed per (match, team) because they differ by side: a must-win match
for one team is not necessarily one for the other.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from utils import CHECK, check, log, section


def _team_rows(m: pd.DataFrame) -> pd.DataFrame:
    a = m.assign(team=m.home_team_id, opp=m.away_team_id)
    c = m.assign(team=m.away_team_id, opp=m.home_team_id)
    t = pd.concat([a, c], ignore_index=True)
    t["won"] = np.where(t.no_result, np.nan, np.where(t.is_tie & t.win_team_id.isna(), 0.5, (t.win_team_id == t.team).astype(float)))
    return t.sort_values(["match_date", "match_number", "match_id"]).reset_index(drop=True)


def elo(cfg: dict, m: pd.DataFrame) -> pd.DataFrame:
    """Pre-match Elo for both teams, by date, separately per pool (IPL / International).
    FIX 3: home advantage per pool (config) enters the expected score only; a team's first
    match starts at the current pool mean minus `new_team_offset` (newcomers are usually weaker)."""
    ec = cfg["elo"]
    rating: dict[tuple, float] = {}
    rows = []
    for r in m.sort_values(["match_date", "match_number", "match_id"]).itertuples():
        ka, kb = (r.elo_pool, r.home_team_id), (r.elo_pool, r.away_team_id)
        pool = [v for (pl, _), v in rating.items() if pl == r.elo_pool]
        new = (np.mean(pool) if pool else ec["start"]) - (ec["new_team_offset"] if pool else 0)
        ea, eb = rating.setdefault(ka, new), rating.setdefault(kb, new)
        rows.append((r.match_id, r.home_team_id, ea, eb))
        rows.append((r.match_id, r.away_team_id, eb, ea))
        if r.no_result or pd.isna(r.win_team_id):
            continue
        ha = ec["home_advantage"].get(r.elo_pool, 0)
        exp_a = 1 / (1 + 10 ** ((eb - ea - ha) / 400))
        sa = 1.0 if r.win_team_id == r.home_team_id else 0.0
        rating[ka] = ea + ec["k"] * (sa - exp_a)
        rating[kb] = eb - ec["k"] * (sa - exp_a)
    return pd.DataFrame(rows, columns=["match_id", "team", "elo", "opp_elo"])


def nrr_race(cfg: dict, m: pd.DataFrame) -> pd.DataFrame:
    """Rebuild the IPL points table and NRR match by match; flag late-league race matches."""
    sc = cfg["stakes"]
    out = []
    ipl = m[(m.league == "IPL")]
    for comp, g in ipl.groupby("comp_id"):
        lg = g[g.stage == "League"].sort_values(["match_date", "match_number"])
        teams = sorted(set(lg.home_team_id) | set(lg.away_team_id))
        n_fix = {t: int(((lg.home_team_id == t) | (lg.away_team_id == t)).sum()) for t in teams}
        pts = {t: 0 for t in teams}
        rf = {t: 0.0 for t in teams}
        of = {t: 0.0 for t in teams}
        ra = {t: 0.0 for t in teams}
        oa = {t: 0.0 for t in teams}
        played = {t: 0 for t in teams}
        for r in lg.itertuples():
            # pre-match table
            nrr = {t: (rf[t] / of[t] if of[t] else 0) - (ra[t] / oa[t] if oa[t] else 0) for t in teams}
            order = sorted(teams, key=lambda t: (-pts[t], -nrr[t]))
            fourth = pts[order[3]] if len(order) >= 4 else 0
            for t in (r.home_team_id, r.away_team_id):
                late = played[t] >= (1 - sc["nrr_late_league_share"]) * n_fix[t]
                pos = order.index(t) + 1
                close = abs(pts[t] - fourth) <= sc["nrr_points_window"]
                out.append((r.match_id, t, bool(late and close), pos, pts[t], round(nrr[t], 3)))
            # update after the match
            for t in (r.home_team_id, r.away_team_id):
                played[t] += 1
            if r.no_result or pd.isna(r.total1) or pd.isna(r.total2):
                pts[r.home_team_id] += 1
                pts[r.away_team_id] += 1
                continue
            pts[int(r.win_team_id)] += 2
            mb1 = r.first_inn_revised_overs if pd.notna(r.first_inn_revised_overs) else 120
            mb2 = r.second_inn_revised_overs if pd.notna(r.second_inn_revised_overs) else 120
            o1 = (mb1 if r.wkts1 >= 10 else r.legal1) / 6  # all out -> full quota
            o2 = (mb2 if r.wkts2 >= 10 else r.legal2) / 6
            t1, t2 = int(r.team1), int(r.team2)
            rf[t1] += r.total1; of[t1] += o1; ra[t1] += r.total2; oa[t1] += o2
            rf[t2] += r.total2; of[t2] += o2; ra[t2] += r.total1; oa[t2] += o1
    return pd.DataFrame(out, columns=["match_id", "team", "nrr_race", "table_pos", "points", "nrr"])


def series_flags(m: pd.DataFrame) -> pd.DataFrame:
    """Bilateral series: decider (level going into the last match) and dead rubber (already decided)."""
    out = []
    intl = m[m.league != "IPL"]
    for comp, g in intl.groupby("comp_id"):
        teams = set(g.home_team_id) | set(g.away_team_id)
        if len(teams) != 2 or len(g) < 2:
            continue
        g = g.sort_values(["match_date", "match_number"])
        n = len(g)
        wins = {t: 0 for t in teams}
        for i, r in enumerate(g.itertuples()):
            remaining = n - i  # including this match
            a, c = sorted(teams)
            lead = abs(wins[a] - wins[c])
            decider = (i == n - 1) and wins[a] == wins[c]
            dead = lead > remaining
            out.append((r.match_id, decider, dead))
            if not r.no_result and pd.notna(r.win_team_id) and int(r.win_team_id) in wins:
                wins[int(r.win_team_id)] += 1
    return pd.DataFrame(out, columns=["match_id", "series_decider", "dead_rubber"])


def must_win(cfg: dict, m: pd.DataFrame) -> pd.DataFrame:
    t = _team_rows(m)
    out = []
    for (comp, team), g in t.groupby(["comp_id", "team"]):
        streak = 0
        for r in g.itertuples():
            out.append((r.match_id, team, streak >= cfg["stakes"]["must_win_losses"]))
            if pd.isna(r.won):
                continue
            streak = streak + 1 if r.won == 0 else 0
    return pd.DataFrame(out, columns=["match_id", "team", "must_win"])


def run(cfg: dict, P: dict, b: pd.DataFrame, m: pd.DataFrame) -> dict:
    section("STAGE 4 · F6 STAKES · F10 ELO · F12 NRR RACE · F18 FAVOURITE UNDER THREAT")
    sc = cfg["stakes"]
    E = elo(cfg, m)
    N = nrr_race(cfg, m)
    S = series_flags(m)
    W = must_win(cfg, m)
    T = _team_rows(m)[["match_id", "team", "opp", "knockout", "is_final", "league", "fmt", "elo_pool"]]
    T = T.merge(E, on=["match_id", "team"], how="left").merge(W, on=["match_id", "team"], how="left") \
         .merge(N[["match_id", "team", "nrr_race", "table_pos", "points", "nrr"]], on=["match_id", "team"], how="left") \
         .merge(S, on="match_id", how="left")
    for c in ["must_win", "nrr_race", "series_decider", "dead_rubber"]:
        T[c] = T[c].eq(True)
    T["favourite"] = T.elo > T.opp_elo
    log(f"flags (team-match rows): knockout {int(T.knockout.sum())}, must-win {int(T.must_win.sum())}, "
        f"series decider {int(T.series_decider.sum())}, dead rubber {int(T.dead_rubber.sum())}, "
        f"IPL NRR race {int(T.nrr_race.sum())}")

    # ---- evidence for the stakes values: are these matches tighter / played differently?
    mb = b.groupby("match_id").agg(lev=("leverage", "mean"), rpo=("team_runs", "sum"), lg=("legal", "sum"))
    mb["rpo"] = mb.rpo / mb.lg * 6
    TT = T.drop_duplicates("match_id").set_index("match_id").join(mb, how="inner")
    base_lev, base_rpo = TT.lev.mean(), TT.rpo.mean()
    for flag in ["knockout", "must_win", "series_decider", "dead_rubber", "nrr_race"]:
        src = T[T[flag].astype(bool)].match_id.unique()
        x = TT.loc[TT.index.isin(src)]
        if len(x):
            log(f"  evidence {flag:<15}: {len(x):>3} matches, mean leverage {x.lev.mean():.3f} vs {base_lev:.3f} overall, "
                f"run rate {x.rpo.mean():.2f} vs {base_rpo:.2f}")
    log(f"  JUSTIFICATION: knockout x{sc['knockout']} (final x{sc['final_extra']} more), must-win x{sc['must_win']}, "
        f"series decider x{sc['series_decider']}, dead rubber x{sc['dead_rubber']}, NRR race x{sc['nrr_race']}. "
        "Leverage already measures how close the ball is; stakes add what is riding on the match "
        "(elimination, series, qualification), which leverage cannot see. Values are moderate so that a "
        "single flag never outweighs a 2x leverage difference, and are capped at "
        f"{sc['cap']}.")

    mult = np.ones(len(T))
    if sc["enabled"]:
        mult *= np.where(T.knockout == 1, sc["knockout"], 1.0)
        mult *= np.where(T.is_final == 1, sc["final_extra"], 1.0)
        mult *= np.where(T.must_win, sc["must_win"], 1.0)
        mult *= np.where(T.series_decider, sc["series_decider"], 1.0)
        mult *= np.where(T.dead_rubber, sc["dead_rubber"], 1.0)
    T["stakes_core"] = mult  # F6
    T["stakes_nrr"] = np.where(T.nrr_race, sc["nrr_race"], 1.0)  # F12

    # ---- F10: Elo report, IPL vs international
    TE = T.dropna(subset=["elo"]).merge(m[["match_id", "win_team_id", "no_result"]], on="match_id")
    TE = TE[~TE.no_result & TE.win_team_id.notna() & (TE.elo != TE.opp_elo)]
    TE["fav_won"] = (TE.favourite == (TE.win_team_id == TE.team))
    rep = []
    for pool, g in TE.groupby("elo_pool"):
        g = g[g.team < g.opp] if len(g) else g
        last = T[T.elo_pool == pool].groupby("team").elo.last()
        rep.append({"pool": pool, "matches": len(g), "favourite_win_rate": round(g.fav_won.mean(), 3),
                    "elo_sd": round(last.std(), 1), "elo_range": round(last.max() - last.min(), 1)})
        log(f"  F10 Elo {pool:<13}: favourite won {g.fav_won.mean():.1%} of {len(g)} matches; "
            f"current Elo SD {last.std():.0f}, range {last.max() - last.min():.0f}")

    # ---- per-ball stakes and opponent-strength weights
    key = T.set_index(["match_id", "team"])
    ib = pd.MultiIndex.from_frame(b[["match_id", "batting_team_id"]])
    iw = pd.MultiIndex.from_frame(b[["match_id", "bowling_team_id"]])
    for side, ix in [("bat", ib), ("bowl", iw)]:
        b[f"stakes_core_{side}"] = key.stakes_core.reindex(ix).fillna(1.0).values
        b[f"stakes_nrr_{side}"] = key.stakes_nrr.reindex(ix).fillna(1.0).values
        b[f"opp_elo_{side}"] = key.opp_elo.reindex(ix).values
        b[f"knockout_{side}"] = key.knockout.reindex(ix).fillna(0).values
        b[f"nrr_race_{side}"] = key.nrr_race.reindex(ix).eq(True).values
        for f in ["is_final", "must_win", "series_decider", "dead_rubber"]:  # FIX 7: per-flag, for scaled stakes
            b[f"{f}_{side}"] = key[f].reindex(ix).eq(True).values if key[f].dtype == bool else key[f].reindex(ix).fillna(0).eq(1).values
    # F18: pre-match favourite currently below 40 % WP
    fav_bat = key.favourite.reindex(ib).eq(True).values
    wp_bat = b.wp_bat.values
    fav_wp = np.where(fav_bat, wp_bat, 1 - wp_bat)
    has_fav = (key.elo.reindex(ib).values != key.opp_elo.reindex(ib).values)
    b["fav_threat"] = has_fav & (fav_wp < sc["favourite_wp_threshold"])
    b["stakes_fav"] = np.where(b.fav_threat & sc["favourite_under_threat"], sc["favourite_bonus"], 1.0)
    log(f"F18 favourite under threat: {b.fav_threat.mean():.1%} of balls "
        f"({b[b.fav_threat].match_id.nunique()} matches); bonus x{sc['favourite_bonus']} "
        f"({'ON' if sc['favourite_under_threat'] else 'OFF'})")
    # opponent-strength weight (F10)
    ec = cfg["elo"]
    pool_mean = T.groupby("elo_pool").elo.mean()
    pm = b.elo_pool.map(pool_mean)
    lo, hi = ec["weight_bounds"]
    b["elo_w_bat"] = np.clip(1 + (b.opp_elo_bat.fillna(pm) - pm) / ec["scale"], lo, hi)
    b["elo_w_bowl"] = np.clip(1 + (b.opp_elo_bowl.fillna(pm) - pm) / ec["scale"], lo, hi)
    log(f"Opponent-strength weights (v1 only, NOT used in v2 ratings: opposition Elo now enters the expected-value "
        f"models, FIX 3/4): batting mean {b.elo_w_bat.mean():.3f}")
    # FIX 3: weak opposition = pre-match opposition Elo in the bottom quartile of its pool
    q = T.groupby("elo_pool").elo.quantile(ec["weak_quantile"])
    qb = b.elo_pool.map(q)
    for side in ["bat", "bowl"]:
        b[f"opp_elo_z_{side}"] = ((b[f"opp_elo_{side}"].fillna(pm) - pm) / 100.0).values
        b[f"weak_opp_{side}"] = (b[f"opp_elo_{side}"] < qb).values
    log(f"FIX 3 weak-opposition cut (bottom {ec['weak_quantile']:.0%} of pre-match Elo): "
        f"{ {k: round(v) for k, v in q.items()} }; {b.weak_opp_bat.mean():.1%} of balls are batted vs weak bowling sides")
    _stakes_evidence(cfg, b, P)
    check(b.stakes_core_bat.notna().all(), "every ball has a stakes multiplier")

    CHECK.add("F6 Knockout / must-win / series decider / dead rubber flags", True,
              f"knockout {int(T.knockout.sum())}, must-win {int(T.must_win.sum())}, decider {int(T.series_decider.sum())}, "
              f"dead rubber {int(T.dead_rubber.sum())} team-matches")
    CHECK.add("F10 Elo opposition adjustment, IPL vs T20I reported", len(rep) == 2,
              "; ".join(f"{r['pool']} fav win {r['favourite_win_rate']:.0%}" for r in rep))
    CHECK.add("F12 NRR pressure flags (IPL)", int(T.nrr_race.sum()) > 0, f"{int(T.nrr_race.sum())} IPL team-matches in the race")
    CHECK.add("F18 Favourite-under-threat flag", True,
              f"{b.fav_threat.mean():.1%} of balls flagged, bonus x{sc['favourite_bonus']}")
    return {"balls": b, "team_match": T, "elo_report": pd.DataFrame(rep), "nrr": N}


def _stakes_evidence(cfg: dict, b: pd.DataFrame, P: dict) -> pd.DataFrame:
    """FIX 7: does the data support each stakes multiplier's direction?
    League-wide boundary %, dot % and wicket rate on flagged balls vs ordinary balls in the
    SAME leverage decile x innings (so closeness of the game is held fixed). A multiplier > 1
    says the situation is harder for the batter (fewer boundaries / more dots / more wickets);
    a multiplier < 1 (dead rubber) says it is easier."""
    sc = cfg["stakes"]
    x = b[b.legal].copy()
    x["bucket"] = pd.qcut(x.leverage.rank(method="first"), 10, labels=False).astype(str) + "|" + x.innings.astype(str)
    x["bnd"] = (x.is_four | x.is_six).astype(float)
    x["dot"] = (x.team_runs == 0).astype(float)
    x["wk"] = x.is_wicket.astype(float)
    flags = {"knockout": ("knockout_bat", sc["knockout"]), "final": ("is_final_bat", sc["knockout"] * sc["final_extra"]),
             "must_win (batting side)": ("must_win_bat", sc["must_win"]),
             "must_win (bowling side)": ("must_win_bowl", sc["must_win"]),
             "series_decider": ("series_decider_bat", sc["series_decider"]),
             "dead_rubber": ("dead_rubber_bat", sc["dead_rubber"]), "nrr_race (batting side)": ("nrr_race_bat", sc["nrr_race"]),
             "nrr_race (bowling side)": ("nrr_race_bowl", sc["nrr_race"])}
    rows = []
    for name, (col, mult) in flags.items():
        f = x[col].astype(bool)
        if f.sum() < 200:
            continue
        F, O = x[f], x[~f]
        wt = F.bucket.value_counts(normalize=True)  # re-weight ordinary balls to the flagged leverage mix
        om = O.groupby("bucket")[["bnd", "dot", "wk"]].mean().reindex(wt.index)
        exp = (om.mul(wt, axis=0)).sum()
        act = F[["bnd", "dot", "wk"]].mean()
        d = act - exp
        harder = int(d.bnd < 0) + int(d["dot"] > 0) + int(d.wk > 0)  # votes that batting is harder
        # standard error of the boundary-% difference, to say whether it is distinguishable from 0
        se = float(np.sqrt(act.bnd * (1 - act.bnd) / len(F)))
        direction = "harder" if harder >= 2 else "easier"
        expected = "harder" if mult > 1 else "easier"
        rows.append({"flag": name, "multiplier": round(mult, 3), "balls": int(len(F)),
                     "boundary_pct": round(100 * act.bnd, 2), "boundary_pct_matched": round(100 * exp.bnd, 2),
                     "dot_pct": round(100 * act["dot"], 2), "dot_pct_matched": round(100 * exp["dot"], 2),
                     "wicket_pct": round(100 * act.wk, 2), "wicket_pct_matched": round(100 * exp.wk, 2),
                     "votes_harder_for_batter": int(harder), "data_direction": direction,
                     "boundary_diff_in_se": round(float(d.bnd) / se, 2) if se > 0 else np.nan,
                     "supports_multiplier": direction == expected})
    E = pd.DataFrame(rows)
    E.to_csv(P["tables"] / "stakes_empirical.csv", index=False)
    log("FIX 7 empirical stakes check (flagged balls vs ordinary balls in the same leverage decile x innings):")
    log(E.to_string(index=False))
    log(f"  data supports the direction of {int(E.supports_multiplier.sum())}/{len(E)} multipliers "
        "(direction = majority of boundary / dot / wicket votes; |boundary diff| < 2 SE means the data cannot tell)")
    return E

